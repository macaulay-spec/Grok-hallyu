/**
 * Firebase primary backend — ALL Hallyu-owned reads and writes.
 *
 * Contract (see lib/data/backend.ts): every mutation in the sync plan has a real implementation;
 * anything unknown throws BackendError (never a silent success). Every pull scope the app uses is
 * served from Firestore — there is NO Supabase fallback in this module. Supabase survives only in
 * lib/data/supabaseBackend.ts as an explicit, opt-in recovery/migration adapter (setBackend), and
 * in lib/video.ts videoUrl() for resolving media keys of pre-migration posts.
 *
 * Firestore data model (designed for the app's access patterns, NOT copied from Postgres):
 *   users/{uid}                        public profile card (handle, name, avatar, counts…)
 *   users/{uid}/private/me             email, prefs, onboarding, lastSeenActivity (owner-only)
 *   users/{uid}/watchlist/{dramaId}    WatchlistItem
 *   users/{uid}/saved/{postId}         save record
 *   users/{uid}/follows/{kind}_{id}    {kind: users|dramas|actors|collections, targetId}
 *   users/{uid}/followers/{uid2}       reverse index (written by the follower)
 *   users/{uid}/dramaNotify/{dramaId}  episode-alert opt-in
 *   users/{uid}/collections/{colId}    Collection (owner's copy, incl. private)
 *   users/{uid}/blocks/{uid2}          block
 *   users/{uid}/mutes/{user_x|drama_x} mute
 *   users/{uid}/reactions/{targetId}   my reaction (post OR comment) {kind, isComment, postId}
 *   users/{uid}/commentRefs/{cid}      {postId} — locates my comments for deletion
 *   users/{uid}/notifications/{nid}    Notification (created by the acting member)
 *   users/{uid}/downloads/{keyId}      download ledger {key, postId, count, firstAt, lastAt}
 *   posts/{postId}                     Post + denormalized author/drama display fields
 *   posts/{postId}/comments/{cid}      Comment + denormalized author
 *   collections/{colId}                public mirror of public collections (community tab)
 *   reports/{rid}                      moderation reports (create-only, nobody reads back)
 *
 * Query policy: ONLY auto-indexed shapes — global orderBy(createdAt)+__name__ cursors, equality,
 * equality-zigzag and single-field ranges. Anything that would need a manual composite index is
 * fetched as a bounded window and sorted/paged client-side (documented trade-off at this scale,
 * see docs/backend/FIREBASE.md). No TMDB data is ever written to Firestore; posts only
 * denormalize the display title/poster of the drama they reference (user content metadata, not a
 * catalog copy).
 */
import '../polyfills'; // MUST precede the firebase/* imports below (Hermes TextDecoder crash)
import {
  documentId,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { deleteObject, listAll, ref as storageRef } from 'firebase/storage';
import {
  fbAuth,
  fbDb,
  fbStorage,
  isLocalMediaUri,
  mapFirebaseError,
  storagePaths,
  uploadToFirebaseStorage,
} from '../firebase';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { allDramas, dispatchLocal, getState, Mutation, MePayload } from '../store';
import { Collection, Comment, Drama, Notification, Post, ReactionKind, User, WatchlistItem } from '../model';
import { TMDB_IMG } from '../catalog';
import { now } from '../format';
import { uploadVideo } from '../video';

type Json = Record<string, any>;

const PAGE = 20; // feed page size (matches the legacy server contract)
const WINDOW = 120; // bounded fetch window for client-paged feeds
const MAX_NOTIFICATION_FANOUT = 8;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function requireUid(): string {
  const uid = fbAuth().currentUser?.uid;
  if (!uid) throw new BackendError('Sign in to sync your changes', false, 401);
  return uid;
}

function optionalUid(): string | null {
  try {
    return fbAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

function heat(p: Post): number {
  const r = Object.values<number>(p.reactions ?? {}).reduce((x, y) => x + (y || 0), 0);
  return r + 3 * (p.commentCount ?? 0) + 2 * (p.saveCount ?? 0);
}

/** Account-switch guard (same discipline as the legacy backend): a late page must never land in
 * another member's store. */
function readOwner(): string {
  return getState().profile.id;
}
function isOwner(owner: string): boolean {
  return getState().profile.id === owner;
}

const zeroReactions = (): Record<ReactionKind, number> => ({ loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0 });

/** Batched multi-get (the modular SDK has no getAll — getDoc per ref, bounded). */
async function getAllDocs(refs: DocumentReference[]) {
  const out = [];
  for (let i = 0; i < refs.length; i += 50) {
    const snaps = await Promise.all(refs.slice(i, i + 50).map((r) => getDoc(r).catch(() => null)));
    out.push(...snaps.filter((s): s is NonNullable<typeof s> => !!s && s.exists()));
  }
  return out;
}

interface MappedPost {
  post: Post;
  author?: Partial<User> & { id: string };
  drama?: Drama;
}

function docToPost(d: { id: string; data(): Json }): MappedPost {
  const j = d.data();
  const post: Post = {
    id: d.id,
    type: j.type ?? 'post',
    authorId: j.authorId ?? j.userId ?? '',
    createdAt: j.createdAt ?? new Date(0).toISOString(),
    editedAt: j.editedAt ?? undefined,
    body: j.body ?? '',
    title: j.title ?? undefined,
    kind: j.kind ?? undefined,
    rating: j.rating ?? undefined,
    verdict: j.verdict ?? undefined,
    images: Array.isArray(j.images) && j.images.length ? j.images : undefined,
    video:
      j.video && j.video.url
        ? { url: j.video.url, key: j.video.key ?? undefined, poster: j.video.poster ?? undefined, duration: j.video.duration ?? 0, width: j.video.width, height: j.video.height, watermarked: j.video.watermarked }
        : undefined,
    spoiler: j.spoiler ?? 'none',
    context: {
      dramaId: j.context?.dramaId ?? undefined,
      secondaryDramaId: j.context?.secondaryDramaId ?? undefined,
      season: j.context?.season ?? undefined,
      episode: j.context?.episode ?? undefined,
      actorIds: Array.isArray(j.context?.actorIds) && j.context.actorIds.length ? j.context.actorIds : undefined,
    },
    hashtags: j.hashtags ?? [],
    mentions: j.mentions ?? [],
    reactions: { ...zeroReactions(), ...(j.reactions ?? {}) },
    commentCount: j.commentCount ?? 0,
    saveCount: j.saveCount ?? 0,
    shareCount: j.shareCount ?? 0,
    state: j.state ?? 'active',
  };
  const author = post.authorId
    ? { id: post.authorId, handle: j.authorHandle ?? '', displayName: j.authorName ?? j.authorHandle ?? 'Member', avatarUrl: j.authorAvatar || undefined }
    : undefined;
  let drama: Drama | undefined;
  const did = post.context.dramaId;
  if (did) {
    const local = allDramas(getState()).find((x) => x.id === did);
    if (local) drama = local;
    else {
      const tmdbId = did.startsWith('tmdb-') ? Number(did.slice(5)) : undefined;
      drama = {
        id: did,
        title: j.dramaTitle ?? 'Untitled',
        year: 0,
        status: 'completed',
        genres: [],
        synopsis: '',
        posterUrl: j.dramaPosterPath ? `${TMDB_IMG}/w342${j.dramaPosterPath}` : undefined,
        backdropUrl: j.dramaPosterPath ? `${TMDB_IMG}/w780${j.dramaPosterPath}` : undefined,
        tone: '#221d2e',
        episodeCount: 0,
        seasons: [],
        episodes: [],
        cast: [],
        followerCount: 0,
        provider: tmdbId ? { name: 'tmdb', id: tmdbId } : undefined,
      };
    }
  }
  return { post, author, drama };
}

/** Merge a page of posts (+ denormalized authors/dramas) into the store and set the feed order. */
function ingestMapped(key: string | null, mapped: MappedPost[], opts: { append?: boolean; exhausted?: boolean; cursor?: unknown; owner?: string }) {
  if (opts.owner !== undefined && !isOwner(opts.owner)) return;
  const posts: Post[] = [];
  const authors: (Partial<User> & { id: string })[] = [];
  const dramas: Drama[] = [];
  for (const m of mapped) {
    if (m.post.state === 'deleted' || m.post.state === 'hidden') continue;
    posts.push(m.post);
    if (m.author) authors.push(m.author);
    if (m.drama) dramas.push(m.drama);
  }
  if (posts.length) dispatchLocal({ type: 'mergePosts', posts });
  if (authors.length) dispatchLocal({ type: 'mergeUsers', users: authors });
  if (dramas.length) dispatchLocal({ type: 'import', dramas });
  if (key) {
    dispatchLocal({
      type: 'setFeed',
      key,
      ids: posts.map((p) => p.id),
      append: opts.append,
      exhausted: opts.exhausted ?? posts.length === 0,
      cursor: opts.cursor as never,
    });
  }
}

function blockedSet(): Set<string> {
  const s = getState();
  return new Set([...s.blockedUsers, ...s.mutedUsers]);
}

/** Client-side paging over a fetched window: filter → sort → cursor → slice (index-free feeds). */
function windowPage(key: string, mapped: MappedPost[], opts: PullOptions | undefined, owner: string, docCount: number): void {
  const blocked = blockedSet();
  let items = mapped.filter((m) => m.post.state !== 'deleted' && m.post.state !== 'hidden' && !blocked.has(m.post.authorId));
  items.sort((x, y) => byNewest(x.post, y.post));
  const cursor = opts?.more ? (getState().feeds[key]?.cursor as { before?: string } | undefined) : undefined;
  if (cursor?.before) items = items.filter((m) => m.post.createdAt < (cursor.before as string));
  const page = items.slice(0, PAGE);
  ingestMapped(key, page, {
    append: !!opts?.more,
    exhausted: items.length <= PAGE || (docCount < WINDOW && items.length <= PAGE),
    owner,
    cursor: page.length ? { before: page[page.length - 1]!.post.createdAt } : cursor,
  });
}

/** Best-effort notification fan-out. NEVER fails the originating mutation. */
async function notify(
  targetUid: string | undefined,
  n: { id: string; group: Notification['group']; kind: Notification['kind']; postId?: string; commentId?: string; dramaId?: string; collectionId?: string; body?: string },
): Promise<void> {
  const me = optionalUid();
  if (!me || !targetUid || targetUid === me) return;
  const profile = getState().profile;
  const id = n.id.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 120);
  try {
    await setDoc(
      doc(fbDb(), 'users', targetUid, 'notifications', id),
      {
        id,
        group: n.group,
        kind: n.kind,
        actorIds: [me],
        actorName: profile.displayName || 'A member',
        actorAvatar: profile.avatarUrl || '',
        postId: n.postId ?? null,
        commentId: n.commentId ?? null,
        dramaId: n.dramaId ?? null,
        collectionId: n.collectionId ?? null,
        body: n.body ?? '',
        createdAt: now().toISOString(),
        read: false,
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('[hallyu:fb] notify skipped:', (e as Error)?.message ?? e);
  }
}

async function postAuthorId(postId: string): Promise<string | undefined> {
  const local = getState().posts.find((p) => p.id === postId);
  if (local?.authorId) return local.authorId;
  try {
    const snap = await getDoc(doc(fbDb(), 'posts', postId));
    const id = snap.exists() ? String(snap.data()?.authorId ?? '') : '';
    return id || undefined;
  } catch {
    return undefined;
  }
}

function myAuthorFields() {
  const p = getState().profile;
  return { authorHandle: p.handle || '', authorName: p.displayName || 'Member', authorAvatar: p.avatarUrl || '' };
}

// ---------------------------------------------------------------------------------------------
// PUSH — every mutation in the sync plan, for real
// ---------------------------------------------------------------------------------------------

async function pushAddPost(a: Extract<Mutation['action'], { type: 'addPost' }>): Promise<void> {
  const uid = requireUid();
  const p = a.post;
  const db = fbDb();

  let images = p.images;
  if (p.images?.length) {
    images = await Promise.all(
      p.images.map(async (img, idx) => {
        if (typeof img === 'string' && isLocalMediaUri(img)) {
          return uploadToFirebaseStorage(img, storagePaths.postImage(uid, p.id, idx));
        }
        return img;
      }),
    );
  }

  let video = p.video;
  if (p.video && isLocalMediaUri(p.video.url)) {
    const uploaded = await uploadVideo({ uri: p.video.url, duration: p.video.duration, width: p.video.width, height: p.video.height }, p.id);
    let poster = p.video.poster;
    if (typeof poster === 'string' && isLocalMediaUri(poster)) {
      poster = await uploadToFirebaseStorage(poster, storagePaths.postPoster(uid, p.id));
    }
    if (typeof poster === 'string' && isLocalMediaUri(poster)) {
      throw new BackendError('Video poster could not be uploaded — will retry', true);
    }
    video = { ...p.video, url: uploaded.url, key: uploaded.key, poster };
  }

  const drama = p.context.dramaId ? allDramas(getState()).find((d) => d.id === p.context.dramaId) : undefined;
  const finalPost: Post = { ...p, images, video, authorId: uid, state: 'active', createdAt: p.createdAt || now().toISOString() };
  const posterPath =
    drama?.posterUrl && drama.posterUrl.startsWith(TMDB_IMG) ? drama.posterUrl.slice(TMDB_IMG.length).replace(/^\/w\d+/, '') : null;

  await setDoc(doc(db, 'posts', p.id), {
    ...finalPost,
    userId: uid,
    ...myAuthorFields(),
    dramaTitle: drama?.title ?? null,
    dramaPosterPath: posterPath,
    bodyLower: (finalPost.body ?? '').toLowerCase().slice(0, 400),
    reactions: { ...zeroReactions(), ...(finalPost.reactions ?? {}) },
    commentCount: 0,
    saveCount: 0,
    shareCount: 0,
    updatedAt: now().toISOString(),
  });

  dispatchLocal({ type: 'mergePosts', posts: [finalPost] });

  // Mention fan-out (best-effort).
  for (const mentioned of (finalPost.mentions ?? []).slice(0, MAX_NOTIFICATION_FANOUT)) {
    void notify(mentioned, { id: `mention_${finalPost.id}_${uid}`, group: 'mentions', kind: 'mention', postId: finalPost.id });
  }
}

async function pushReact(a: Extract<Mutation['action'], { type: 'react' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const { targetId, kind, isComment } = a;
  if (!targetId) return;

  // Locate a comment's parent post (local cache first, then my commentRefs index).
  let postId: string | undefined;
  if (isComment) {
    postId = getState().comments.find((c) => c.id === targetId)?.postId;
    if (!postId) {
      const refSnap = await getDoc(doc(db, 'users', uid, 'commentRefs', targetId)).catch(() => null);
      postId = refSnap?.exists() ? String(refSnap.data()?.postId ?? '') || undefined : undefined;
    }
    if (!postId) throw new BackendError('Could not locate that comment — open the post first, then retry', true);
  }

  // Server truth for the previous kind (the optimistic store copy is not authoritative at flush
  // time): read my reaction doc so counter deltas stay exact across kind switches.
  const ownRef = doc(db, 'users', uid, 'reactions', targetId);
  const ownSnap = await getDoc(ownRef).catch(() => null);
  const prevKind = (ownSnap?.exists() ? (ownSnap.data()?.kind as ReactionKind | undefined) : undefined) ?? null;
  if (prevKind === kind) return; // already converged

  const counterRef = isComment ? doc(db, 'posts', postId!, 'comments', targetId) : doc(db, 'posts', targetId);
  const batch = writeBatch(db);
  if (kind) batch.set(ownRef, { targetId, kind, isComment: !!isComment, postId: postId ?? null, createdAt: now().toISOString() });
  else batch.delete(ownRef);
  const deltas: Json = { updatedAt: now().toISOString() };
  if (kind) deltas[`reactions.${kind}`] = increment(1);
  if (prevKind && prevKind !== kind) deltas[`reactions.${prevKind}`] = increment(-1);
  batch.update(counterRef, deltas);
  await batch.commit();

  if (!isComment && kind) {
    const author = await postAuthorId(targetId);
    void notify(author, { id: `react_${targetId}_${uid}`, group: 'social', kind: 'reaction', postId: targetId });
  }
}

async function pushAddComment(a: Extract<Mutation['action'], { type: 'addComment' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const c = a.comment;
  const batch = writeBatch(db);
  batch.set(doc(db, 'posts', c.postId, 'comments', c.id), {
    ...c,
    authorId: uid,
    ...myAuthorFields(),
    state: 'active',
    reactions: { ...zeroReactions(), ...(c.reactions ?? {}) },
    createdAt: c.createdAt || now().toISOString(),
  });
  batch.update(doc(db, 'posts', c.postId), { commentCount: increment(1), updatedAt: now().toISOString() });
  batch.set(doc(db, 'users', uid, 'commentRefs', c.id), { postId: c.postId, createdAt: now().toISOString() });
  await batch.commit();
  const author = await postAuthorId(c.postId);
  void notify(author, { id: `comment_${c.postId}_${uid}_${c.id}`, group: 'social', kind: c.parentId ? 'reply' : 'comment', postId: c.postId, commentId: c.id });
}

async function pushDeleteComment(id: string): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  let postId = getState().comments.find((c) => c.id === id)?.postId;
  if (!postId) {
    const refSnap = await getDoc(doc(db, 'users', uid, 'commentRefs', id)).catch(() => null);
    postId = refSnap?.exists() ? String(refSnap.data()?.postId ?? '') || undefined : undefined;
  }
  if (!postId) throw new BackendError('Could not locate that comment to delete it', false);
  const batch = writeBatch(db);
  batch.update(doc(db, 'posts', postId, 'comments', id), { state: 'deleted', updatedAt: now().toISOString() });
  batch.update(doc(db, 'posts', postId), { commentCount: increment(-1), updatedAt: now().toISOString() });
  await batch.commit();
}

async function pushFollow(a: Extract<Mutation['action'], { type: 'follow' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const on = a.on ?? true;
  const followId = `${a.kind}_${a.id}`;
  const batch = writeBatch(db);
  const ownRef = doc(db, 'users', uid, 'follows', followId);
  if (on) batch.set(ownRef, { kind: a.kind, targetId: a.id, createdAt: now().toISOString() });
  else batch.delete(ownRef);
  batch.update(doc(db, 'users', uid), { followingCount: increment(on ? 1 : -1), updatedAt: now().toISOString() });
  if (a.kind === 'users') {
    const revRef = doc(db, 'users', a.id, 'followers', uid);
    if (on) batch.set(revRef, { followerId: uid, createdAt: now().toISOString() });
    else batch.delete(revRef);
    batch.update(doc(db, 'users', a.id), { followersCount: increment(on ? 1 : -1), updatedAt: now().toISOString() });
  }
  if (a.kind === 'collections') {
    batch.update(doc(db, 'collections', a.id), { followerCount: increment(on ? 1 : -1), updatedAt: now().toISOString() });
  }
  await batch.commit();
  if (on && a.kind === 'users') void notify(a.id, { id: `follow_${a.id}_${uid}`, group: 'social', kind: 'follow' });
}

async function pushCollection(a: Extract<Mutation['action'], { type: 'upsertCollection' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const col = a.collection;
  const data: Json = { ...col, ownerId: uid, userId: uid, updatedAt: now().toISOString() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'collections', col.id), data, { merge: true });
  if (col.visibility === 'public') batch.set(doc(db, 'collections', col.id), data, { merge: true });
  await batch.commit();
  if (col.visibility === 'private') await deleteDoc(doc(db, 'collections', col.id)).catch(() => {});
}

async function pushCollectionItem(a: Extract<Mutation['action'], { type: 'collectionItem' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const ownRef = doc(db, 'users', uid, 'collections', a.collectionId);
  const snap = await getDoc(ownRef);
  if (!snap.exists()) throw new BackendError('That collection is no longer available — reopen it and retry', true);
  const current = snap.data() as Json;
  let items: Json[] = Array.isArray(current.items) ? current.items : [];
  if (a.on) {
    if (!items.some((i) => i.dramaId === a.dramaId)) items = [...items, { dramaId: a.dramaId, note: a.note ?? null, addedAt: now().toISOString() }];
    else items = items.map((i) => (i.dramaId === a.dramaId ? { ...i, note: a.note ?? i.note ?? null } : i));
  } else {
    items = items.filter((i) => i.dramaId !== a.dramaId);
  }
  const patch = { items, updatedAt: now().toISOString() };
  const batch = writeBatch(db);
  batch.update(ownRef, patch);
  if (current.visibility === 'public') batch.update(doc(db, 'collections', a.collectionId), patch);
  await batch.commit();
}

async function pushProfile(a: Extract<Mutation['action'], { type: 'profile' }>): Promise<void> {
  const uid = requireUid();
  const patch: Json = { ...a.patch };
  delete patch.id;
  delete patch.handle; // handles are immutable identity
  delete patch.followers;
  delete patch.following;
  delete patch.joinedAt;
  delete patch.verified;
  if (typeof patch.avatarUrl === 'string' && isLocalMediaUri(patch.avatarUrl)) {
    patch.avatarUrl = await uploadToFirebaseStorage(patch.avatarUrl, storagePaths.avatar(uid));
  }
  if (typeof patch.displayName === 'string') patch.displayName = patch.displayName.trim().slice(0, 100) || undefined;
  if (typeof patch.bio === 'string') patch.bio = patch.bio.slice(0, 500);
  const clean: Json = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  await setDoc(doc(fbDb(), 'users', uid), { ...clean, updatedAt: now().toISOString() }, { merge: true });
}

async function pushWatchlist(a: Extract<Mutation['action'], { type: 'watch' | 'progress' | 'note' }>): Promise<void> {
  const uid = requireUid();
  const wlRef = doc(fbDb(), 'users', uid, 'watchlist', a.dramaId);
  if (a.type === 'watch' && a.status === null) {
    await deleteDoc(wlRef);
    return;
  }
  const prev = getState().watchlist[a.dramaId];
  const ts = now().toISOString();
  const item: WatchlistItem =
    a.type === 'progress'
      ? {
          dramaId: a.dramaId,
          status: a.total > 0 && a.episode >= a.total ? 'completed' : 'watching',
          season: a.season,
          currentEpisode: a.episode,
          note: prev?.note,
          addedAt: prev?.addedAt ?? ts,
          updatedAt: ts,
          completedAt: a.total > 0 && a.episode >= a.total ? ts : prev?.completedAt,
        }
      : a.type === 'note'
        ? {
            dramaId: a.dramaId,
            status: prev?.status ?? 'want',
            season: prev?.season ?? 1,
            currentEpisode: prev?.currentEpisode ?? 0,
            note: a.note,
            addedAt: prev?.addedAt ?? ts,
            updatedAt: ts,
            completedAt: prev?.completedAt,
          }
        : {
            dramaId: a.dramaId,
            status: a.status!,
            season: a.season ?? prev?.season ?? 1,
            currentEpisode: a.status === 'completed' ? prev?.currentEpisode ?? 0 : a.status === 'want' ? 0 : prev?.currentEpisode ?? 0,
            note: prev?.note,
            addedAt: prev?.addedAt ?? ts,
            updatedAt: ts,
            completedAt: a.status === 'completed' ? ts : prev?.completedAt,
          };
  await setDoc(wlRef, { ...item }, { merge: true });
}

async function pushReadNotifications(a: Extract<Mutation['action'], { type: 'readNotifications' }>): Promise<void> {
  const uid = requireUid();
  const db = fbDb();
  const unread = await getDocs(query(collection(db, 'users', uid, 'notifications'), where('read', '==', false), fbLimit(400)));
  for (let i = 0; i < unread.docs.length; i += 400) {
    const batch = writeBatch(db);
    let touched = false;
    for (const d of unread.docs.slice(i, i + 400)) {
      const data = d.data() as Json;
      if (a.group && a.group !== 'all' && data.group !== a.group) continue;
      if (a.id && d.id !== a.id) continue;
      batch.update(d.ref, { read: true });
      touched = true;
    }
    if (touched) await batch.commit();
  }
  await setDoc(doc(db, 'users', uid, 'private', 'me'), { lastSeenActivity: now().toISOString(), updatedAt: now().toISOString() }, { merge: true });
}

async function push(m: Mutation): Promise<void> {
  const db = fbDb();
  const uid = requireUid();
  const a = m.action;
  try {
    switch (a.type) {
      case 'addPost':
        return pushAddPost(a);
      case 'editPost': {
        const patch: Json = { ...a.patch };
        for (const forbidden of ['id', 'authorId', 'createdAt', 'reactions', 'commentCount', 'saveCount', 'shareCount', 'state']) delete patch[forbidden];
        await updateDoc(doc(db, 'posts', a.id), { ...patch, editedAt: now().toISOString(), updatedAt: now().toISOString() });
        return;
      }
      case 'deletePost': {
        const author = await postAuthorId(a.id);
        if (author && author !== uid) throw new BackendError('You can only delete your own posts', false, 403);
        await updateDoc(doc(db, 'posts', a.id), { state: 'deleted', updatedAt: now().toISOString() });
        // Best-effort media cleanup (owner-scoped storage paths).
        void (async () => {
          try {
            const st = fbStorage();
            const dir = await listAll(storageRef(st, `posts/${uid}/${a.id}`)).catch(() => null);
            for (const item of dir?.items ?? []) await deleteObject(item).catch(() => {});
            await deleteObject(storageRef(st, storagePaths.video(uid, a.id))).catch(() => {});
          } catch {}
        })();
        return;
      }
      case 'addComment':
        return pushAddComment(a);
      case 'deleteComment':
        return pushDeleteComment(a.id);
      case 'react':
        return pushReact(a);
      case 'save': {
        const on = a.on ?? true;
        const batch = writeBatch(db);
        const saveRef = doc(db, 'users', uid, 'saved', a.postId);
        if (on) batch.set(saveRef, { postId: a.postId, createdAt: now().toISOString() });
        else batch.delete(saveRef);
        batch.update(doc(db, 'posts', a.postId), { saveCount: increment(on ? 1 : -1), updatedAt: now().toISOString() });
        await batch.commit();
        return;
      }
      case 'follow':
        return pushFollow(a);
      case 'dramaNotify': {
        const ref = doc(db, 'users', uid, 'dramaNotify', a.id);
        if (a.on) await setDoc(ref, { dramaId: a.id, notify: true, updatedAt: now().toISOString() });
        else await deleteDoc(ref);
        return;
      }
      case 'watch':
      case 'progress':
      case 'note':
        return pushWatchlist(a);
      case 'upsertCollection':
        return pushCollection(a);
      case 'deleteCollection': {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'users', uid, 'collections', a.id));
        batch.delete(doc(db, 'collections', a.id));
        await batch.commit();
        return;
      }
      case 'collectionItem':
        return pushCollectionItem(a);
      case 'profile':
        return pushProfile(a);
      case 'prefs':
        await setDoc(doc(db, 'users', uid, 'private', 'me'), { prefs: a.patch, updatedAt: now().toISOString() }, { merge: true });
        return;
      case 'onboarding':
        await setDoc(doc(db, 'users', uid, 'private', 'me'), { onboarding: a.patch, updatedAt: now().toISOString() }, { merge: true });
        return;
      case 'block': {
        const ref = doc(db, 'users', uid, 'blocks', a.userId);
        if (a.on) await setDoc(ref, { blockedUserId: a.userId, createdAt: now().toISOString() });
        else await deleteDoc(ref);
        return;
      }
      case 'muteUser': {
        const ref = doc(db, 'users', uid, 'mutes', `user_${a.userId}`);
        if (a.on) await setDoc(ref, { mutedUserId: a.userId, createdAt: now().toISOString() });
        else await deleteDoc(ref);
        return;
      }
      case 'muteDrama': {
        const ref = doc(db, 'users', uid, 'mutes', `drama_${a.dramaId}`);
        if (a.on) await setDoc(ref, { mutedDramaId: a.dramaId, createdAt: now().toISOString() });
        else await deleteDoc(ref);
        return;
      }
      case 'report': {
        const targetType = a.targetType ?? 'post';
        const rid = `${targetType}_${a.id}_${uid}`.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 150);
        await setDoc(doc(db, 'reports', rid), {
          id: rid,
          reporterId: uid,
          targetId: a.id,
          targetType,
          reason: a.reason ?? 'inappropriate',
          detail: (a.detail ?? '').slice(0, 1000),
          createdAt: now().toISOString(),
        });
        return;
      }
      case 'readNotifications':
        return pushReadNotifications(a);
      default:
        // No silent success: an unmapped action is a programming error and must surface.
        throw new BackendError(`Firebase backend: unsupported mutation "${(a as { type: string }).type}"`, false);
    }
  } catch (e) {
    if (e instanceof BackendError) throw e;
    throw mapFirebaseError(e, `push:${a.type}`);
  }
}

// ---------------------------------------------------------------------------------------------
// PULL — every scope the app uses, served from Firestore
// ---------------------------------------------------------------------------------------------

async function pullMe(): Promise<void> {
  const uid = optionalUid();
  if (!uid) return;
  const owner = readOwner();
  const db = fbDb();
  const [userSnap, privateSnap, watchlistSnap, savedSnap, followsSnap, collectionsSnap, blocksSnap, mutesSnap, notifySnap, reactionsSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'users', uid, 'private', 'me')),
    getDocs(collection(db, 'users', uid, 'watchlist')),
    getDocs(collection(db, 'users', uid, 'saved')),
    getDocs(collection(db, 'users', uid, 'follows')),
    getDocs(collection(db, 'users', uid, 'collections')),
    getDocs(collection(db, 'users', uid, 'blocks')),
    getDocs(collection(db, 'users', uid, 'mutes')),
    getDocs(collection(db, 'users', uid, 'dramaNotify')),
    getDocs(collection(db, 'users', uid, 'reactions')),
  ]);
  if (!isOwner(owner)) return;

  const u = (userSnap.exists() ? userSnap.data() : {}) as Json;
  const priv = (privateSnap.exists() ? privateSnap.data() : {}) as Json;
  const p: MePayload = {};
  p.profile = {
    id: uid,
    handle: u.handle ?? 'member',
    displayName: u.displayName ?? 'Member',
    avatarUrl: u.avatarUrl || undefined,
    bio: u.bio || undefined,
    favoriteGenres: u.favoriteGenres ?? [],
    favoriteDramaIds: u.favoriteDramaIds ?? [],
    followers: u.followersCount ?? 0,
    following: u.followingCount ?? 0,
    joinedAt: u.createdAt ?? new Date().toISOString(),
    verified: !!u.verified,
    isPrivate: !!u.isPrivate,
  };
  p.prefs = (priv.prefs ?? {}) as MePayload['prefs'];
  if (priv.onboarding && Object.keys(priv.onboarding).length) p.onboarding = priv.onboarding as MePayload['onboarding'];

  const wl: Record<string, WatchlistItem> = {};
  watchlistSnap.docs.forEach((d) => {
    const j = d.data() as Json;
    wl[d.id] = {
      dramaId: d.id,
      status: j.status ?? 'want',
      season: j.season ?? 1,
      currentEpisode: j.currentEpisode ?? 0,
      note: j.note ?? undefined,
      addedAt: j.addedAt ?? new Date().toISOString(),
      updatedAt: j.updatedAt ?? new Date().toISOString(),
      completedAt: j.completedAt ?? undefined,
    };
  });
  p.watchlist = wl;
  p.saves = savedSnap.docs.map((d) => d.id);
  const follows = { users: [] as string[], dramas: [] as string[], actors: [] as string[], collections: [] as string[] };
  followsSnap.docs.forEach((d) => {
    const j = d.data() as Json;
    const kind = (j.kind ?? 'dramas') as keyof typeof follows;
    if (follows[kind] && j.targetId) follows[kind].push(String(j.targetId));
  });
  p.follows = follows;
  p.dramaNotify = notifySnap.docs.map((d) => d.id);
  const rx: Record<string, ReactionKind> = {};
  reactionsSnap.docs.forEach((d) => {
    const kind = (d.data() as Json).kind as ReactionKind | undefined;
    if (kind) rx[d.id] = kind;
  });
  p.reactions = rx;
  p.blockedUsers = blocksSnap.docs.map((d) => d.id);
  const mutes: (Json & { id: string })[] = mutesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Json) }));
  p.mutedUsers = mutes.filter((x) => x.id.startsWith('user_')).map((x) => String(x.mutedUserId ?? x.id.slice(5)));
  p.mutedDramas = mutes.filter((x) => x.id.startsWith('drama_')).map((x) => String(x.mutedDramaId ?? x.id.slice(6)));
  p.collections = collectionsSnap.docs.map((d) => mapCollectionDoc(d.id, d.data() as Json, uid));

  dispatchLocal({ type: 'me', payload: p });
  dispatchLocal({ type: 'mergeUsers', users: [p.profile as User] });
}

function mapCollectionDoc(id: string, j: Json, fallbackOwner: string): Collection {
  return {
    id,
    ownerId: j.ownerId ?? j.userId ?? fallbackOwner,
    title: j.title ?? '',
    description: j.description ?? undefined,
    visibility: j.visibility === 'private' ? 'private' : 'public',
    items: (Array.isArray(j.items) ? j.items : []).map((i: Json) => ({ dramaId: i.dramaId, note: i.note ?? undefined, addedAt: i.addedAt ?? j.updatedAt ?? now().toISOString() })),
    followerCount: j.followerCount ?? 0,
    updatedAt: j.updatedAt ?? now().toISOString(),
  };
}

/** The chronological master feed with a true server cursor (auto-indexed orderBy + __name__). */
async function pullForYou(opts: PullOptions | undefined): Promise<void> {
  const owner = readOwner();
  const db = fbDb();
  const postsRef = collection(db, 'posts');
  const feed = getState().feeds['forYou'];
  const cursor = opts?.more ? (feed?.cursor as { before?: string; id?: string } | undefined) : undefined;
  const q =
    opts?.more && cursor?.before && cursor?.id
      ? query(postsRef, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(cursor.before, doc(db, 'posts', cursor.id)), fbLimit(PAGE))
      : query(postsRef, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), fbLimit(PAGE));
  const snap = await getDocs(q);
  if (!isOwner(owner)) return;
  const blocked = blockedSet();
  const mapped = snap.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json }));
  const visible = mapped.filter((m) => m.post.state !== 'deleted' && m.post.state !== 'hidden' && !blocked.has(m.post.authorId));
  const last = snap.docs[snap.docs.length - 1];
  ingestMapped('forYou', visible, {
    append: !!opts?.more,
    exhausted: snap.docs.length < PAGE,
    owner,
    cursor: last ? { before: String((last.data() as Json).createdAt ?? ''), id: last.id } : undefined,
  });
}

async function pullFollowing(opts: PullOptions | undefined): Promise<void> {
  const uid = optionalUid();
  if (!uid) return;
  const owner = readOwner();
  const db = fbDb();
  const followsSnap = await getDocs(query(collection(db, 'users', uid, 'follows'), where('kind', '==', 'users')));
  const authorIds = [...new Set(followsSnap.docs.map((d) => String((d.data() as Json).targetId ?? d.id.replace(/^users_/, ''))))];
  if (!authorIds.length) {
    if (isOwner(owner)) dispatchLocal({ type: 'setFeed', key: 'following', ids: [], exhausted: true });
    return;
  }
  // Equality-only 'in' chunks (zigzag — no composite index) merged into a window, paged client-side.
  const chunks: string[][] = [];
  for (let i = 0; i < authorIds.length; i += 30) chunks.push(authorIds.slice(i, i + 30));
  const pages = await Promise.all(chunks.slice(0, 5).map((c) => getDocs(query(collection(db, 'posts'), where('authorId', 'in', c), fbLimit(WINDOW)))));
  if (!isOwner(owner)) return;
  const mapped = pages.flatMap((s) => s.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json })));
  windowPage('following', mapped, opts, owner, pages.reduce((n, s) => n + s.docs.length, 0));
}

async function pullShorts(opts: PullOptions | undefined): Promise<void> {
  const owner = readOwner();
  const snap = await getDocs(query(collection(fbDb(), 'posts'), where('type', '==', 'short'), fbLimit(WINDOW)));
  if (!isOwner(owner)) return;
  windowPage('shorts', snap.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json })), opts, owner, snap.docs.length);
}

async function pullHome(): Promise<void> {
  const owner = readOwner();
  const db = fbDb();
  // One bounded recent window powers the For-You page AND the home rails (client-derived).
  const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), fbLimit(WINDOW)));
  if (!isOwner(owner)) return;
  const blocked = blockedSet();
  const mapped = snap.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json }));
  const visible = mapped.filter((m) => m.post.state !== 'deleted' && m.post.state !== 'hidden' && !blocked.has(m.post.authorId));
  const last = snap.docs[snap.docs.length - 1];
  ingestMapped('forYou', visible.slice(0, PAGE), {
    exhausted: snap.docs.length < PAGE,
    owner,
    cursor: last ? { before: String((last.data() as Json).createdAt ?? ''), id: last.id } : undefined,
  });

  // Rails: trending posts/discussions by heat; trending dramas by mention frequency in the window.
  const all = visible.map((m) => m.post);
  const trending = [...visible].sort((x, y) => heat(y.post) - heat(x.post)).slice(0, 12);
  ingestMapped(null, trending, { owner });
  dispatchLocal({ type: 'setFeed', key: 'trendingPosts', ids: trending.filter((m) => m.post.type !== 'discussion').map((m) => m.post.id), exhausted: true });
  dispatchLocal({ type: 'setFeed', key: 'trendingDiscussions', ids: trending.filter((m) => m.post.type === 'discussion').map((m) => m.post.id), exhausted: true });

  const dramaCounts = new Map<string, number>();
  for (const p of all) if (p.context.dramaId) dramaCounts.set(p.context.dramaId, (dramaCounts.get(p.context.dramaId) ?? 0) + 1);
  const trendingDramas = [...dramaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const dramas = trendingDramas.map(([id]) => visible.find((m) => m.post.context.dramaId === id)?.drama).filter(Boolean) as Drama[];
  if (dramas.length) dispatchLocal({ type: 'import', dramas });
  dispatchLocal({ type: 'setFeed', key: 'trendingDramas', ids: trendingDramas.map(([id]) => id), exhausted: true });
  // "Airing today" comes from TMDB via the catalog screens (external by design — never stored in
  // Firebase); the home rail renders from the local catalog once it has warmed.
  dispatchLocal({ type: 'setFeed', key: 'airingToday', ids: [], exhausted: true });
}

async function pullActivity(opts: PullOptions | undefined): Promise<void> {
  const uid = optionalUid();
  if (!uid) return;
  const owner = readOwner();
  const db = fbDb();
  const noteRef = collection(db, 'users', uid, 'notifications');
  const feed = getState().feeds['activity'];
  const cursor = opts?.more ? (feed?.cursor as { before?: string; id?: string } | undefined) : undefined;
  const q =
    opts?.more && cursor?.before && cursor?.id
      ? query(noteRef, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(cursor.before, doc(db, 'users', uid, 'notifications', cursor.id)), fbLimit(50))
      : query(noteRef, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), fbLimit(50));
  const snap = await getDocs(q);
  if (!isOwner(owner)) return;
  const notifs: Notification[] = snap.docs.map((d) => {
    const j = d.data() as Json;
    return {
      id: d.id,
      group: j.group ?? 'social',
      kind: j.kind ?? 'reaction',
      actorIds: Array.isArray(j.actorIds) && j.actorIds.length ? j.actorIds : undefined,
      postId: j.postId ?? undefined,
      commentId: j.commentId ?? undefined,
      dramaId: j.dramaId ?? undefined,
      episode: j.episode ?? undefined,
      collectionId: j.collectionId ?? undefined,
      title: j.title ?? undefined,
      body: j.body ?? undefined,
      createdAt: j.createdAt ?? new Date(0).toISOString(),
      read: !!j.read,
    };
  });
  // Denormalized actor cards keep the activity list join-free.
  const seenActors = new Map<string, Partial<User> & { id: string }>();
  snap.docs.forEach((d) => {
    const j = d.data() as Json;
    const id = Array.isArray(j.actorIds) ? String(j.actorIds[0] ?? '') : '';
    if (id && !seenActors.has(id)) seenActors.set(id, { id, handle: '', displayName: j.actorName ?? 'A member', avatarUrl: j.actorAvatar || undefined });
  });
  if (seenActors.size) dispatchLocal({ type: 'mergeUsers', users: [...seenActors.values()] });
  const prev = getState().notifications;
  const merged = notifs.concat(prev).filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).slice(0, 150);
  dispatchLocal({ type: 'mergeNotifications', notifications: merged });
  const lastDoc = snap.docs[snap.docs.length - 1];
  dispatchLocal({
    type: 'setFeed',
    key: 'activity',
    ids: [],
    exhausted: snap.docs.length < 50,
    cursor: lastDoc ? { before: String((lastDoc.data() as Json).createdAt ?? ''), id: lastDoc.id } : undefined,
  });
}

async function pullSaved(): Promise<void> {
  const s = getState();
  const missing = s.saves.filter((id) => !s.posts.some((p) => p.id === id));
  if (!missing.length) return;
  const db = fbDb();
  const snaps = await getAllDocs(missing.slice(0, 100).map((id) => doc(db, 'posts', id)));
  ingestMapped(null, snaps.map((x) => docToPost({ id: x.id, data: () => x.data() as Json })), {});
}

function userDocToPartial(id: string, j: Json): Partial<User> & { id: string } {
  return {
    id,
    handle: j.handle ?? '',
    displayName: j.displayName ?? j.handle ?? 'Member',
    avatarUrl: j.avatarUrl || undefined,
    bio: j.bio || undefined,
    favoriteGenres: j.favoriteGenres ?? [],
    favoriteDramaIds: j.favoriteDramaIds ?? [],
    followers: j.followersCount ?? 0,
    following: j.followingCount ?? 0,
    joinedAt: j.createdAt ?? new Date().toISOString(),
    verified: !!j.verified,
    isPrivate: !!j.isPrivate,
  };
}

async function pullCollectionsTab(): Promise<void> {
  const db = fbDb();
  const snap = await getDocs(query(collection(db, 'collections'), where('visibility', '==', 'public'), fbLimit(100)));
  const cols = snap.docs
    .map((d) => mapCollectionDoc(d.id, d.data() as Json, ''))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, 40);
  dispatchLocal({ type: 'mergeCollections', collections: cols });
  dispatchLocal({ type: 'setFeed', key: 'collections:community', ids: cols.map((c) => c.id), exhausted: snap.docs.length < 100 });
  const ownerIds = [...new Set(cols.map((c) => c.ownerId).filter(Boolean))].slice(0, 20);
  if (ownerIds.length) {
    const profs = await getAllDocs(ownerIds.map((id) => doc(db, 'users', id)));
    const users = profs.map((p) => userDocToPartial(p.id, p.data() as Json));
    if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  }
}

async function pullCollection(id: string): Promise<void> {
  const db = fbDb();
  let snap = await getDoc(doc(db, 'collections', id));
  if (!snap.exists()) {
    const uid = optionalUid();
    if (uid) snap = await getDoc(doc(db, 'users', uid, 'collections', id));
  }
  if (!snap.exists()) return;
  const col = mapCollectionDoc(id, snap.data() as Json, '');
  dispatchLocal({ type: 'mergeCollections', collections: [col] });
  if (col.ownerId) {
    const prof = await getDoc(doc(db, 'users', col.ownerId)).catch(() => null);
    if (prof?.exists()) dispatchLocal({ type: 'mergeUsers', users: [userDocToPartial(prof.id, prof.data() as Json)] });
  }
}

async function resolveUserByHandle(handle: string): Promise<{ uid: string; data: Json } | null> {
  const snap = await getDocs(query(collection(fbDb(), 'users'), where('handleLower', '==', handle.toLowerCase()), fbLimit(1)));
  const d = snap.docs[0];
  return d ? { uid: d.id, data: d.data() as Json } : null;
}

async function pullProfile(handle: string): Promise<void> {
  const owner = readOwner();
  const db = fbDb();
  const found = await resolveUserByHandle(handle);
  if (!found) return;
  dispatchLocal({ type: 'mergeUsers', users: [userDocToPartial(found.uid, found.data)] });
  const colsSnap = await getDocs(query(collection(db, 'users', found.uid, 'collections'), where('visibility', '==', 'public'), fbLimit(30))).catch(() => null);
  if (colsSnap?.docs.length) {
    dispatchLocal({ type: 'mergeCollections', collections: colsSnap.docs.map((d) => mapCollectionDoc(d.id, d.data() as Json, found.uid)) });
  }
  const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', found.uid), fbLimit(WINDOW)));
  if (!isOwner(owner)) return;
  windowPage(`user:${found.uid}`, postsSnap.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json })), undefined, owner, postsSnap.docs.length);
}

async function pullPost(id: string): Promise<void> {
  const owner = readOwner();
  const db = fbDb();
  const snap = await getDoc(doc(db, 'posts', id));
  if (snap.exists()) ingestMapped(null, [docToPost({ id: snap.id, data: () => snap.data() as Json })], { owner });
  const commentsSnap = await getDocs(query(collection(db, 'posts', id, 'comments'), orderBy('createdAt', 'desc'), fbLimit(50))).catch(() => null);
  if (!commentsSnap || !isOwner(owner)) return;
  const comments: Comment[] = [];
  const users: (Partial<User> & { id: string })[] = [];
  for (const d of commentsSnap.docs) {
    const j = d.data() as Json;
    if (j.state === 'deleted' && String(j.authorId ?? '') !== getState().profile.id) continue;
    comments.push({
      id: d.id,
      postId: id,
      authorId: j.authorId ?? '',
      parentId: j.parentId ?? undefined,
      replyToUserId: j.replyToUserId ?? undefined,
      body: j.body ?? '',
      createdAt: j.createdAt ?? new Date(0).toISOString(),
      spoiler: j.spoiler ?? 'none',
      reactions: { ...zeroReactions(), ...(j.reactions ?? {}) },
      state: j.state ?? 'active',
    });
    if (j.authorId) users.push({ id: String(j.authorId), handle: j.authorHandle ?? '', displayName: j.authorName ?? 'Member', avatarUrl: j.authorAvatar || undefined });
  }
  dispatchLocal({ type: 'mergeComments', postId: id, comments });
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
}

async function pullDrama(scope: string): Promise<void> {
  const owner = readOwner();
  const rest = scope.slice('drama:'.length);
  const [dramaId, tab = 'all'] = rest.split(':');
  const snap = await getDocs(query(collection(fbDb(), 'posts'), where('context.dramaId', '==', dramaId), fbLimit(WINDOW)));
  if (!isOwner(owner)) return;
  const blocked = blockedSet();
  const mapped = snap.docs
    .map((d) => docToPost({ id: d.id, data: () => d.data() as Json }))
    .filter((m) => m.post.state !== 'deleted' && !blocked.has(m.post.authorId));
  if (tab !== 'top') {
    ingestMapped(`drama:${dramaId}:latest`, [...mapped].sort((x, y) => byNewest(x.post, y.post)).slice(0, PAGE), { exhausted: mapped.length <= PAGE, owner });
  }
  if (tab !== 'latest') {
    ingestMapped(`drama:${dramaId}:top`, [...mapped].sort((x, y) => heat(y.post) - heat(x.post)).slice(0, PAGE), { exhausted: mapped.length <= PAGE, owner });
  }
}

/** In-memory live meter for episode rooms (parity with the legacy backend export). */
export const liveMeters = new Map<string, { counts: Record<string, number>; recentPosters: number }>();

async function pullEpisode(scope: string): Promise<void> {
  const owner = readOwner();
  const [, dramaId, season, episode] = scope.split(':');
  const snap = await getDocs(
    query(
      collection(fbDb(), 'posts'),
      where('context.dramaId', '==', dramaId),
      where('context.season', '==', Number(season)),
      where('context.episode', '==', Number(episode)),
      fbLimit(WINDOW),
    ),
  );
  if (!isOwner(owner)) return;
  const mapped = snap.docs.map((d) => docToPost({ id: d.id, data: () => d.data() as Json })).filter((m) => m.post.state !== 'deleted');
  ingestMapped(`episode:${dramaId}:${season}:${episode}`, [...mapped].sort((x, y) => byNewest(x.post, y.post)), { exhausted: true, owner });
  const counts: Record<string, number> = {};
  for (const m of mapped) counts[m.post.type] = (counts[m.post.type] ?? 0) + 1;
  const cutoff = Date.now() - 10 * 60_000;
  liveMeters.set(`${dramaId}:${season}:${episode}`, { counts, recentPosters: mapped.filter((m) => new Date(m.post.createdAt).getTime() > cutoff).length });
}

async function pullSearch(q: string): Promise<void> {
  const owner = readOwner();
  const needle = q.trim().toLowerCase();
  if (!needle) return;
  const db = fbDb();
  // People: handle prefix range (single-field index).
  const peopleSnap = await getDocs(query(collection(db, 'users'), where('handleLower', '>=', needle), where('handleLower', '<=', `${needle}\uf8ff`), fbLimit(12))).catch(() => null);
  const people = (peopleSnap?.docs ?? []).map((d) => userDocToPartial(d.id, d.data() as Json));
  if (!isOwner(owner)) return;
  if (people.length) {
    dispatchLocal({ type: 'mergeUsers', users: people });
    dispatchLocal({ type: 'setFeed', key: `searchPeople:${needle}`, ids: people.map((u) => u.id), exhausted: true });
  }
  // Posts: hashtag match + body-prefix match + a bounded recent-window text scan. Firestore has
  // no full-text index; a dedicated search service is the documented scale-up path (FIREBASE.md).
  const tag = needle.replace(/^#/, '');
  const [tagSnap, prefixSnap, recentSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('hashtags', 'array-contains', tag), fbLimit(20))).catch(() => null),
    getDocs(query(collection(db, 'posts'), where('bodyLower', '>=', needle), where('bodyLower', '<=', `${needle}\uf8ff`), fbLimit(20))).catch(() => null),
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), fbLimit(WINDOW))).catch(() => null),
  ]);
  const seen = new Set<string>();
  const collected: MappedPost[] = [];
  const collect = (docs: { id: string; data(): Json }[] | undefined, textScan: boolean) => {
    for (const d of docs ?? []) {
      if (seen.has(d.id)) continue;
      const m = docToPost(d);
      if (m.post.state === 'deleted') continue;
      if (textScan) {
        const hay = `${m.post.body} ${m.post.title ?? ''} ${m.post.hashtags.join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      seen.add(d.id);
      collected.push(m);
    }
  };
  collect(tagSnap?.docs.map((d) => ({ id: d.id, data: () => d.data() as Json })), false);
  collect(prefixSnap?.docs.map((d) => ({ id: d.id, data: () => d.data() as Json })), false);
  collect(recentSnap?.docs.map((d) => ({ id: d.id, data: () => d.data() as Json })), true);
  collected.sort((x, y) => byNewest(x.post, y.post));
  ingestMapped(`search:${needle}`, collected.slice(0, 20), { exhausted: collected.length <= 20, owner });
}

async function pull(scope: PullScope, opts?: PullOptions): Promise<void> {
  try {
    switch (true) {
      case scope === 'home': {
        await pullHome();
        if (optionalUid()) await pullMe().catch(() => {});
        return;
      }
      case scope === 'explore':
      case scope === 'trending':
        return pullHome();
      case scope === 'me':
        return pullMe();
      case scope === 'activity':
        return pullActivity(opts);
      case scope === 'saved':
        return pullSaved();
      case scope === 'collections':
        return pullCollectionsTab();
      case scope === 'feed:forYou':
        return pullForYou(opts);
      case scope === 'feed:following':
        return pullFollowing(opts);
      case scope === 'shorts':
        return pullShorts(opts);
      case scope.startsWith('drama:'):
        return pullDrama(scope);
      case scope.startsWith('episode:'):
        return pullEpisode(scope);
      case scope.startsWith('post:'):
        return pullPost(scope.slice(5));
      case scope.startsWith('user:'):
        return pullProfile(scope.slice(5));
      case scope.startsWith('search:'):
        return pullSearch(decodeURIComponent(scope.slice(7)));
      case scope.startsWith('collection:'):
        return pullCollection(scope.slice(11));
      default:
        return; // local-only scopes (catalog art etc.) are served by the TMDB catalog loader
    }
  } catch (e) {
    if (e instanceof BackendError) throw e;
    throw mapFirebaseError(e, `pull:${scope}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Public extras (screens + account deletion)
// ---------------------------------------------------------------------------------------------

/** Real follower/following lists (replaces the legacy api.connections_page RPC). */
export async function fetchConnections(handle: string, tab: 'followers' | 'following'): Promise<(Partial<User> & { id: string })[]> {
  const db = fbDb();
  const found = await resolveUserByHandle(handle);
  if (!found) return [];
  let ids: string[] = [];
  if (tab === 'followers') {
    const snap = await getDocs(query(collection(db, 'users', found.uid, 'followers'), fbLimit(60)));
    ids = snap.docs.map((d) => d.id);
  } else {
    const snap = await getDocs(query(collection(db, 'users', found.uid, 'follows'), where('kind', '==', 'users'), fbLimit(60)));
    ids = snap.docs.map((d) => String((d.data() as Json).targetId ?? d.id.replace(/^users_/, '')));
  }
  if (!ids.length) return [];
  const profs = await getAllDocs(ids.map((id) => doc(db, 'users', id)));
  const users = profs.map((p) => userDocToPartial(p.id, p.data() as Json));
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  return users;
}

/**
 * Delete every Firestore doc and Storage object owned by `uid` (account deletion step 1).
 * Bounded loops; best-effort per collection — the caller (lib/auth.tsx deleteAccount) proceeds to
 * delete the Firebase Auth account afterwards regardless, and logs anything we could not remove.
 */
export async function purgeUserData(uid: string): Promise<void> {
  const db = fbDb();
  const failed: string[] = [];
  const purgeCollection = async (path: string) => {
    try {
      const snap = await getDocs(query(collection(db, path), fbLimit(500)));
      for (const d of snap.docs) await deleteDoc(d.ref).catch(() => failed.push(`${path}/${d.id}`));
    } catch {
      failed.push(path);
    }
  };

  // Posts (hard delete, incl. their comments subcollections).
  try {
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), fbLimit(500)));
    for (const p of postsSnap.docs) {
      const comments = await getDocs(collection(db, 'posts', p.id, 'comments')).catch(() => null);
      for (const c of comments?.docs ?? []) await deleteDoc(c.ref).catch(() => {});
      await deleteDoc(p.ref).catch(() => failed.push(`posts/${p.id}`));
    }
  } catch {
    failed.push('posts');
  }

  for (const sub of ['watchlist', 'saved', 'follows', 'dramaNotify', 'collections', 'blocks', 'mutes', 'reactions', 'commentRefs', 'notifications', 'downloads']) {
    await purgeCollection(`users/${uid}/${sub}`);
  }
  // Remove my follower records from the people I followed.
  try {
    const followsSnap = await getDocs(query(collection(db, 'users', uid, 'follows'), where('kind', '==', 'users'), fbLimit(500)));
    for (const f of followsSnap.docs) {
      const target = String((f.data() as Json).targetId ?? '');
      if (target) await deleteDoc(doc(db, 'users', target, 'followers', uid)).catch(() => {});
    }
  } catch {}
  // My public collection mirrors.
  try {
    const cols = await getDocs(query(collection(db, 'users', uid, 'collections'), fbLimit(200)));
    for (const c of cols.docs) await deleteDoc(doc(db, 'collections', c.id)).catch(() => {});
  } catch {}
  await deleteDoc(doc(db, 'users', uid, 'private', 'me')).catch(() => failed.push('private/me'));
  await deleteDoc(doc(db, 'users', uid)).catch(() => failed.push('users/doc'));

  // Storage: everything under my scoped prefixes.
  try {
    const st = fbStorage();
    for (const prefix of [`users/${uid}`, `posts/${uid}`, `videos/${uid}`]) {
      const listed = await listAll(storageRef(st, prefix)).catch(() => null);
      for (const item of listed?.items ?? []) await deleteObject(item).catch(() => {});
    }
  } catch {
    failed.push('storage');
  }

  if (failed.length) console.warn('[hallyu:fb] purge incomplete for:', failed.slice(0, 10).join(', '));
}

export const firebaseBackend: Backend = {
  name: 'firebase_primary',
  push: (m) => push(m),
  pull: (scope, opts) => pull(scope, opts),
};
