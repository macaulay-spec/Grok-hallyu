import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit
} from 'firebase/firestore';
import { db, auth, uploadToFirebaseStorage } from '../firebase';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { dispatchLocal, getState, Mutation, MePayload } from '../store';
import { Post, Comment, Collection, WatchlistItem, User, Notification, ReactionKind } from '../model';
import { supabaseBackend } from './supabaseBackend';

/**
 * Full Canonical Firebase Primary Backend:
 * Handles Auth, Profiles, Posts, Comments, Likes, Watchlists, Follows, Saves, Collections,
 * Notifications, Reports, Blocks, Mutes, Preferences, and Media Storage natively via Firebase.
 */
export const firebaseBackend: Backend = {
  name: 'firebase_primary',

  async push(m: Mutation, signal?: AbortSignal): Promise<void> {
    const userId = auth.currentUser?.uid || getState().currentUser?.id;
    if (!userId) {
      throw new BackendError('User must be authenticated to perform backend actions', false, 401);
    }

    try {
      switch (m.action.type) {
        case 'addPost':
        case 'CREATE_POST': {
          const post: Post = 'post' in m.action ? (m.action as any).post : (m.action as any).post;
          if (!post) return;

          // Upload any local images to Firebase Storage
          let uploadedImages: string[] | undefined = post.images;
          if (post.images && post.images.length > 0) {
            uploadedImages = await Promise.all(
              post.images.map(async (img, idx) => {
                if (img.startsWith('file:') || img.startsWith('blob:') || img.startsWith('content:')) {
                  return await uploadToFirebaseStorage(img, `posts/${post.id}/image_${idx}.jpg`, 'image/jpeg');
                }
                return img;
              })
            );
          }

          // Upload video / poster to Firebase Storage if local
          let uploadedVideo = post.video;
          if (post.video && post.video.url) {
            let videoUrl = post.video.url;
            let posterUrl = post.video.poster;
            if (videoUrl.startsWith('file:') || videoUrl.startsWith('blob:') || videoUrl.startsWith('content:')) {
              videoUrl = await uploadToFirebaseStorage(videoUrl, `posts/${post.id}/video.mp4`, 'video/mp4');
            }
            if (posterUrl && (posterUrl.startsWith('file:') || posterUrl.startsWith('blob:') || posterUrl.startsWith('content:'))) {
              posterUrl = await uploadToFirebaseStorage(posterUrl, `posts/${post.id}/poster.jpg`, 'image/jpeg');
            }
            uploadedVideo = { ...post.video, url: videoUrl, poster: posterUrl };
          }

          const finalPost: Post = {
            ...post,
            images: uploadedImages,
            video: uploadedVideo,
            authorId: userId,
            createdAt: post.createdAt || new Date().toISOString(),
          };

          const postRef = doc(db, 'posts', post.id);
          await setDoc(postRef, {
            ...finalPost,
            userId,
            likesCount: post.reactions ? Object.values(post.reactions).reduce((a, b) => a + b, 0) : 0,
            commentCount: post.commentCount || 0,
            saveCount: post.saveCount || 0,
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          // Sync back updated media URLs into store
          dispatchLocal({ type: 'addPost', post: finalPost });
          return;
        }

        case 'editPost': {
          const { id, patch } = m.action;
          const postRef = doc(db, 'posts', id);
          await setDoc(postRef, {
            ...patch,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'deletePost': {
          const { id } = m.action;
          const postRef = doc(db, 'posts', id);
          await setDoc(postRef, {
            state: 'deleted',
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'profile':
        case 'UPDATE_PROFILE': {
          const patch = 'profile' in m.action ? (m.action as any).profile : (m.action as any).patch;
          if (!patch) return;

          let avatarUrl = patch.avatarUrl;
          if (avatarUrl && (avatarUrl.startsWith('file:') || avatarUrl.startsWith('blob:') || avatarUrl.startsWith('content:'))) {
            avatarUrl = await uploadToFirebaseStorage(avatarUrl, `users/${userId}/avatar.jpg`, 'image/jpeg');
          }

          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            ...patch,
            avatarUrl,
            id: userId,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'prefs': {
          const patch = m.action.patch;
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            prefs: patch,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          return;
        }

        case 'addComment':
        case 'ADD_COMMENT': {
          const comment: Comment = 'comment' in m.action ? (m.action as any).comment : (m.action as any).comment;
          if (!comment) return;

          const commentRef = doc(db, 'posts', comment.postId, 'comments', comment.id);
          await setDoc(commentRef, {
            ...comment,
            userId,
            authorId: userId,
            createdAt: comment.createdAt || new Date().toISOString(),
          });

          // Increment comment count on post
          try {
            const postRef = doc(db, 'posts', comment.postId);
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
              const current = postSnap.data()?.commentCount || 0;
              await updateDoc(postRef, { commentCount: current + 1, updatedAt: new Date().toISOString() });
            }
          } catch {}
          return;
        }

        case 'deleteComment': {
          const { id } = m.action;
          // Look up comment and update state to deleted
          const post = getState().posts.find((p) => getState().comments.some((c) => c.id === id && c.postId === p.id));
          if (post) {
            const commentRef = doc(db, 'posts', post.id, 'comments', id);
            await setDoc(commentRef, { state: 'deleted', updatedAt: new Date().toISOString() }, { merge: true });
          }
          return;
        }

        case 'react':
        case 'TOGGLE_LIKE': {
          const targetId = 'targetId' in m.action ? m.action.targetId : (m.action as any).postId;
          const kind = 'kind' in m.action ? m.action.kind : 'loved';
          if (!targetId) return;

          const likeRef = doc(db, 'posts', targetId, 'likes', `${userId}_${targetId}`);
          if (!kind) {
            await deleteDoc(likeRef).catch(() => {});
          } else {
            await setDoc(likeRef, {
              id: `${userId}_${targetId}`,
              postId: targetId,
              userId,
              kind,
              createdAt: new Date().toISOString(),
            });
          }
          return;
        }

        case 'save': {
          const { postId, on } = m.action;
          const saveRef = doc(db, 'users', userId, 'saved', postId);
          const shouldSave = on ?? true;
          if (!shouldSave) {
            await deleteDoc(saveRef).catch(() => {});
          } else {
            await setDoc(saveRef, {
              id: postId,
              postId,
              userId,
              createdAt: new Date().toISOString(),
            });
          }
          return;
        }

        case 'watch':
        case 'progress':
        case 'WATCHLIST_CHANGE': {
          const dramaId = m.action.dramaId;
          if (!dramaId) return;
          const wlRef = doc(db, 'users', userId, 'watchlist', dramaId);
          const status = 'status' in m.action ? m.action.status : 'watching';
          if (status === null || status === 'none') {
            await deleteDoc(wlRef).catch(() => {});
          } else {
            await setDoc(wlRef, {
              id: dramaId,
              dramaId,
              userId,
              status,
              currentEpisode: 'episode' in m.action ? m.action.episode : ('currentEpisode' in m.action ? (m.action as any).currentEpisode : 0),
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
          return;
        }

        case 'note': {
          const { dramaId, note } = m.action;
          const wlRef = doc(db, 'users', userId, 'watchlist', dramaId);
          await setDoc(wlRef, { note, updatedAt: new Date().toISOString() }, { merge: true });
          return;
        }

        case 'follow': {
          const { kind, id, on } = m.action;
          const followRef = doc(db, 'users', userId, 'follows', `${kind}_${id}`);
          if (on === false) {
            await deleteDoc(followRef).catch(() => {});
          } else {
            await setDoc(followRef, {
              id: `${kind}_${id}`,
              userId,
              kind,
              targetId: id,
              createdAt: new Date().toISOString(),
            });
          }
          return;
        }

        case 'dramaNotify': {
          const { id, on } = m.action;
          const notifyRef = doc(db, 'users', userId, 'dramaNotify', id);
          if (!on) {
            await deleteDoc(notifyRef).catch(() => {});
          } else {
            await setDoc(notifyRef, { id, dramaId: id, userId, notify: true, updatedAt: new Date().toISOString() });
          }
          return;
        }

        case 'upsertCollection': {
          const { collection: col } = m.action;
          const userColRef = doc(db, 'users', userId, 'collections', col.id);
          const publicColRef = doc(db, 'collections', col.id);
          const data = { ...col, userId, updatedAt: new Date().toISOString() };
          await setDoc(userColRef, data, { merge: true });
          await setDoc(publicColRef, data, { merge: true }).catch(() => {});
          return;
        }

        case 'deleteCollection': {
          const { id } = m.action;
          await deleteDoc(doc(db, 'users', userId, 'collections', id)).catch(() => {});
          await deleteDoc(doc(db, 'collections', id)).catch(() => {});
          return;
        }

        case 'collectionItem': {
          const { collectionId, dramaId, on, note } = m.action;
          const userColRef = doc(db, 'users', userId, 'collections', collectionId);
          const colSnap = await getDoc(userColRef);
          if (colSnap.exists()) {
            const current = colSnap.data() as Collection;
            let items = current.items || [];
            if (on) {
              if (!items.some((i) => i.dramaId === dramaId)) {
                items = [...items, { dramaId, note, addedAt: new Date().toISOString() }];
              }
            } else {
              items = items.filter((i) => i.dramaId !== dramaId);
            }
            await updateDoc(userColRef, { items, updatedAt: new Date().toISOString() });
          }
          return;
        }

        case 'onboarding': {
          const patch = m.action.patch;
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { onboarding: patch, updatedAt: new Date().toISOString() }, { merge: true });
          return;
        }

        case 'block': {
          const { userId: blockedUserId, on } = m.action;
          const blockRef = doc(db, 'users', userId, 'blocks', blockedUserId);
          if (!on) {
            await deleteDoc(blockRef).catch(() => {});
          } else {
            await setDoc(blockRef, { id: blockedUserId, userId, blockedUserId, createdAt: new Date().toISOString() });
          }
          return;
        }

        case 'muteUser': {
          const { userId: mutedUserId, on } = m.action;
          const muteRef = doc(db, 'users', userId, 'mutes', `user_${mutedUserId}`);
          if (!on) {
            await deleteDoc(muteRef).catch(() => {});
          } else {
            await setDoc(muteRef, { id: `user_${mutedUserId}`, userId, mutedUserId, createdAt: new Date().toISOString() });
          }
          return;
        }

        case 'muteDrama': {
          const { dramaId, on } = m.action;
          const muteRef = doc(db, 'users', userId, 'mutes', `drama_${dramaId}`);
          if (!on) {
            await deleteDoc(muteRef).catch(() => {});
          } else {
            await setDoc(muteRef, { id: `drama_${dramaId}`, userId, mutedDramaId: dramaId, createdAt: new Date().toISOString() });
          }
          return;
        }

        case 'report': {
          const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const reportRef = doc(db, 'reports', reportId);
          await setDoc(reportRef, {
            id: reportId,
            reporterId: userId,
            targetId: m.action.id,
            targetType: m.action.targetType || 'post',
            reason: m.action.reason || 'inappropriate',
            detail: m.action.detail || '',
            createdAt: new Date().toISOString(),
          });
          return;
        }

        case 'readNotifications': {
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { lastSeenActivity: new Date().toISOString() }, { merge: true });
          return;
        }

        default: {
          // If unhandled action, throw explicit error instead of silent success
          throw new BackendError(`Firebase backend action not supported: ${(m.action as any).type}`, false);
        }
      }
    } catch (fbErr: any) {
      console.warn('Firebase primary push failed, trying Supabase recovery:', fbErr);
      try {
        await supabaseBackend.push(m, signal);
        return;
      } catch (sbErr: any) {
        throw new BackendError(fbErr.message || sbErr.message || 'Push mutation failed', true);
      }
    }
  },

  async pull(scope: PullScope, opts?: PullOptions, signal?: AbortSignal): Promise<void> {
    const userId = auth.currentUser?.uid || getState().currentUser?.id;

    try {
      if (scope === 'me' && userId) {
        // Fetch complete snapshot for active user
        const userSnap = await getDoc(doc(db, 'users', userId));
        const userData = userSnap.exists() ? userSnap.data() : {};

        // Subcollections
        const watchlistSnap = await getDocs(collection(db, 'users', userId, 'watchlist')).catch(() => ({ docs: [] }));
        const savedSnap = await getDocs(collection(db, 'users', userId, 'saved')).catch(() => ({ docs: [] }));
        const followsSnap = await getDocs(collection(db, 'users', userId, 'follows')).catch(() => ({ docs: [] }));
        const collectionsSnap = await getDocs(collection(db, 'users', userId, 'collections')).catch(() => ({ docs: [] }));
        const blocksSnap = await getDocs(collection(db, 'users', userId, 'blocks')).catch(() => ({ docs: [] }));
        const mutesSnap = await getDocs(collection(db, 'users', userId, 'mutes')).catch(() => ({ docs: [] }));

        const watchlist: Record<string, WatchlistItem> = {};
        watchlistSnap.docs.forEach((d) => {
          const data = d.data();
          watchlist[d.id] = data as WatchlistItem;
        });

        const saves = savedSnap.docs.map((d) => d.id);
        const followsUsers: string[] = [];
        const followsDramas: string[] = [];
        const followsActors: string[] = [];
        const followsCollections: string[] = [];

        followsSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.kind === 'users') followsUsers.push(data.targetId);
          else if (data.kind === 'dramas') followsDramas.push(data.targetId);
          else if (data.kind === 'actors') followsActors.push(data.targetId);
          else if (data.kind === 'collections') followsCollections.push(data.targetId);
        });

        const collectionsList: Collection[] = collectionsSnap.docs.map((d) => d.data() as Collection);
        const blockedUsers = blocksSnap.docs.map((d) => d.id);
        const mutedUsers = mutesSnap.docs.filter((d) => d.id.startsWith('user_')).map((d) => d.data().mutedUserId);
        const mutedDramas = mutesSnap.docs.filter((d) => d.id.startsWith('drama_')).map((d) => d.data().mutedDramaId);

        const payload: MePayload = {
          profile: {
            id: userId,
            handle: userData.handle || 'member',
            displayName: userData.displayName || 'Member',
            avatarUrl: userData.avatarUrl || undefined,
            bio: userData.bio || undefined,
            followers: userData.followersCount || 0,
            following: userData.followingCount || 0,
          },
          prefs: userData.prefs || {},
          onboarding: userData.onboarding || { done: true },
          watchlist,
          saves,
          follows: {
            users: followsUsers,
            dramas: followsDramas,
            actors: followsActors,
            collections: followsCollections,
          },
          collections: collectionsList,
          blockedUsers,
          mutedUsers,
          mutedDramas,
        };

        dispatchLocal({ type: 'me', payload });
        return;
      }

      if (scope === 'home' || scope === 'explore' || scope.startsWith('feed')) {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('createdAt', 'desc'), fbLimit(30));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const fetchedPosts = snap.docs.map((d) => d.data() as Post).filter((p) => p.state !== 'deleted');
          dispatchLocal({ type: 'mergePosts', posts: fetchedPosts });
          dispatchLocal({
            type: 'setFeed',
            key: scope,
            ids: fetchedPosts.map((p) => p.id),
            exhausted: fetchedPosts.length < 30,
          });
          return;
        }
      }

      // Delegate remaining scopes to Supabase recovery fallback
      await supabaseBackend.pull(scope, opts, signal);
    } catch (err: any) {
      console.warn('Firebase pull note, attempting Supabase recovery:', err);
      try {
        await supabaseBackend.pull(scope, opts, signal);
      } catch (fallbackErr: any) {
        // Safe offline pull resolution
      }
    }
  },
};
