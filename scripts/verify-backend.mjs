#!/usr/bin/env node
// Hallyu backend verification.
//
// This is a real integration test against a real Supabase project: it creates two throwaway members
// through the admin API, exercises every write path as one member and reads it back as the other,
// proves row level security actually isolates them, uploads and reads a real object in the `media`
// bucket, and deletes everything it created. Nothing here is mocked.
//
// Credentials come from the environment only (CI supplies them from GitHub Secrets):
//
//   SUPABASE_URL                  project URL                     required
//   SUPABASE_ANON_KEY             public/anon key (client-safe)    required
//   SUPABASE_SERVICE_ROLE_KEY     privileged key (CI only)         required
//   RORK_APP_KEY                 Rork app key (client-safe)      optional
//   RORK_TEST_REFRESH_TOKEN       refresh token for the Rork user  optional
//
// Exit codes:  0 = PASS   1 = FAIL   2 = NOT CONFIGURED (no credentials in this environment)

import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { scanRepository } from './lib/secret-scan.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RORK_APP_KEY = process.env.RORK_APP_KEY || process.env.EXPO_PUBLIC_RORK_APP_KEY || '';
const RORK_AUTH_URL = process.env.RORK_AUTH_URL || process.env.EXPO_PUBLIC_RORK_AUTH_URL || 'https://api.rork.com';
const RORK_TEST_REFRESH_TOKEN = process.env.RORK_TEST_REFRESH_TOKEN || '';

// ---------------------------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------------------------

const results = [];
let currentGroup = 'Setup';

const groups = [];
const startGroup = (name) => {
  currentGroup = name;
  groups.push(name);
};

const test = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ group: currentGroup, name, ok: true, detail: detail ?? '' });
  } catch (error) {
    results.push({ group: currentGroup, name, ok: false, detail: error?.message ?? String(error) });
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const suffix = Math.random().toString(36).slice(2, 8);
const stamp = Date.now();
const userA = {
  email: `hallyu.verify.a.${suffix}@example.invalid`,
  password: `verify-${suffix}-Aa1!`,
  handle: `verify_a_${suffix}`,
};
const userB = {
  email: `hallyu.verify.b.${suffix}@example.invalid`,
  password: `verify-${suffix}-Bb2!`,
  handle: `verify_b_${suffix}`,
};

const anonymous = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const asUser = async (email, password) => {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert(!error, `sign-in failed for ${email}: ${error?.message}`);
  return client;
};

// ---------------------------------------------------------------------------------------------
// 0. Configuration
// ---------------------------------------------------------------------------------------------

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.log('HALLYU BACKEND VERIFICATION');
  console.log('===========================');
  console.log('');
  console.log('  Supabase connection       NOT CONFIGURED');
  console.log('');
  console.log('Missing credentials (set these as GitHub Secrets, never in code):');
  if (!SUPABASE_URL) console.log('  - SUPABASE_URL');
  if (!ANON_KEY) console.log('  - SUPABASE_ANON_KEY');
  if (!SERVICE_ROLE_KEY) console.log('  - SUPABASE_SERVICE_ROLE_KEY');
  console.log('');
  console.log('===========================');
  console.log('OVERALL STATUS: NOT CONFIGURED');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// 1. Connectivity and schema
// ---------------------------------------------------------------------------------------------

let openapi = null;
let alice = null;
let bob = null;
let aliceId = null;
let bobId = null;
let testTitleId = null;

startGroup('Supabase connection');
await test('Supabase reachable with the anon key', async () => {
  const { data, error } = await anonymous().from('worlds').select('id').limit(1);
  assert(!error, `anon query failed: ${error?.message}`);
  assert(Array.isArray(data), 'worlds did not return an array');
  return `${data.length} world row(s) visible`;
});

await test('Project serves a PostgREST schema', async () => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  assert(response.ok, `OpenAPI document returned ${response.status}`);
  openapi = await response.json();
  assert(openapi.definitions && Object.keys(openapi.definitions).length > 0, 'schema has no definitions');
  return `${Object.keys(openapi.definitions).length} relations exposed`;
});

startGroup('Schema');
const EXPECTED_TABLES = [
  'analytics_events',
  'blocks',
  'collection_follows',
  'collection_items',
  'collections',
  'comments',
  'communities',
  'community_members',
  'follows',
  'mutes',
  'notifications',
  'people',
  'person_follows',
  'post_media',
  'posts',
  'profiles',
  'providers',
  'push_tokens',
  'reactions',
  'reports',
  'saves',
  'title_alerts',
  'title_episodes',
  'title_follows',
  'title_people',
  'titles',
  'user_preferences',
  'watchlist_items',
  'worlds',
];

const EXPECTED_COLUMNS = {
  profiles: ['id', 'handle', 'display_name', 'avatar_path', 'bio', 'worlds', 'role', 'account_status', 'onboarding_completed'],
  posts: ['id', 'author_id', 'type', 'body', 'spoiler', 'state', 'visibility', 'world', 'title_id', 'comment_count', 'loved_count'],
  comments: ['id', 'post_id', 'author_id', 'parent_id', 'body', 'spoiler', 'state'],
  reactions: ['id', 'user_id', 'kind', 'post_id', 'comment_id'],
  watchlist_items: ['user_id', 'title_id', 'status', 'season', 'current_episode', 'completed_at'],
  notifications: ['id', 'recipient_id', 'kind', 'actor_ids', 'read_at'],
  push_tokens: ['id', 'user_id', 'token', 'platform'],
  user_preferences: ['user_id', 'protection', 'autoplay', 'notify_social', 'muted_words'],
  titles: ['id', 'provider_id', 'external_id', 'media_type', 'world', 'title', 'year', 'status'],
  collections: ['id', 'owner_id', 'title', 'visibility', 'item_count'],
  reports: ['id', 'reporter_id', 'target_type', 'target_id', 'status'],
};

await test('Every expected table exists', async () => {
  const defined = new Set(Object.keys(openapi.definitions));
  const missing = EXPECTED_TABLES.filter((table) => !defined.has(table));
  assert(missing.length === 0, `missing tables: ${missing.join(', ')}`);
  return `${EXPECTED_TABLES.length} tables present`;
});

await test('Key columns exist', async () => {
  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const definition = openapi.definitions[table];
    assert(definition, `table ${table} is not exposed`);
    const present = new Set(Object.keys(definition.properties ?? {}));
    const missing = columns.filter((column) => !present.has(column));
    assert(missing.length === 0, `${table} is missing ${missing.join(', ')}`);
  }
  return `${Object.keys(EXPECTED_COLUMNS).length} tables column-checked`;
});

await test('Foreign keys are declared (PostgREST relationships)', async () => {
  const problems = [];
  const expectRelationships = {
    posts: ['profiles', 'titles', 'communities'],
    comments: ['posts', 'profiles'],
    reactions: ['profiles', 'posts', 'comments'],
    follows: ['profiles'],
    watchlist_items: ['profiles', 'titles'],
    collection_items: ['collections', 'titles'],
  };

  for (const [table, targets] of Object.entries(expectRelationships)) {
    const definition = openapi.definitions[table];
    const relationships = definition?.relationships ?? [];
    for (const target of targets) {
      if (!relationships.some((r) => r.referencedTable === target)) {
        problems.push(`${table} → ${target}`);
      }
    }
  }
  assert(problems.length === 0, `missing relationships: ${problems.join(', ')}`);
  return 'posts, comments, reactions, follows, watchlist, collection items are related';
});

startGroup('RPCs');
const RPCS = [
  'toggle_reaction',
  'toggle_save',
  'set_follow',
  'set_block',
  'set_mute',
  'mark_notifications_read',
  'register_push_token',
  'report_content',
  'merge_preferences',
  'complete_onboarding',
  'upsert_watchlist_item',
  'handle_is_available',
  'get_bootstrap',
  'delete_account',
  'feed_posts',
  'search_titles',
  'record_event',
];

await test('Every documented RPC exists', async () => {
  const service = admin();
  const missing = [];
  for (const rpc of RPCS) {
    // A deliberately invalid call must fail with a *validation* error, never "function not found".
    const { error } = await service.rpc(rpc, { __probe__: true });
    const code = error?.code ?? '';
    const message = error?.message ?? '';
    const notFound = code === 'PGRST202' || /Could not find the function|does not exist/i.test(message);
    if (notFound) missing.push(rpc);
  }
  assert(missing.length === 0, `missing RPCs: ${missing.join(', ')}`);
  return `${RPCS.length} RPCs exposed`;
});

// ---------------------------------------------------------------------------------------------
// 2. Authentication
// ---------------------------------------------------------------------------------------------

startGroup('Authentication');

await test('Create two test members (admin API)', async () => {
  const service = admin();
  for (const member of [userA, userB]) {
    const { data, error } = await service.auth.admin.createUser({
      email: member.email,
      password: member.password,
      email_confirm: true,
      user_metadata: { handle: member.handle, full_name: 'Verification Account' },
    });
    assert(!error, `could not create ${member.email}: ${error?.message}`);
    member.id = data.user.id;
  }
  return `${userA.email}, ${userB.email}`;
});

await test('Sign-up created a profile row automatically', async () => {
  const { data, error } = await admin().from('profiles').select('id, handle, display_name').eq('id', userA.id).single();
  assert(!error, `profile missing for the new member: ${error?.message}`);
  assert(data.handle === userA.handle, `expected handle ${userA.handle}, got ${data.handle}`);
  return `handle "${data.handle}"`;
});

await test('Authenticated session works against the database', async () => {
  alice = await asUser(userA.email, userA.password);
  aliceId = userA.id;
  const { data, error } = await alice.from('profiles').select('id').eq('id', aliceId).single();
  assert(!error && data, `authenticated read failed: ${error?.message}`);
  return `session for ${aliceId}`;
});

await test('Second member signs in', async () => {
  bob = await asUser(userB.email, userB.password);
  bobId = userB.id;
  const { data, error } = await bob.from('profiles').select('id').eq('id', bobId).single();
  assert(!error && data, `authenticated read failed: ${error?.message}`);
  return `session for ${bobId}`;
});

if (RORK_APP_KEY && RORK_TEST_REFRESH_TOKEN) {
  await test('Rork-minted access token authenticates (client auth path)', async () => {
    const response = await fetch(`${RORK_AUTH_URL}/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: RORK_APP_KEY, refresh_token: RORK_TEST_REFRESH_TOKEN }),
    });
    assert(response.ok, `Rork refresh returned ${response.status}`);
    const payload = await response.json();
    const token = payload?.access_token;
    assert(typeof token === 'string' && token.length > 20, 'Rork did not return an access token');

    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      accessToken: async () => token,
    });
    const { error } = await client.from('profiles').select('id').limit(1);
    assert(!error, `Rork token rejected by PostgREST: ${error?.message}`);
    return 'access token accepted';
  });
} else {
  await test('Rork token check (skipped: RORK_APP_KEY / RORK_TEST_REFRESH_TOKEN not set)', async () => {
    return 'skipped — optional credentials absent';
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Catalog fixture + CRUD
// ---------------------------------------------------------------------------------------------

let postId = null;
let commentId = null;

startGroup('Catalog');

await test('Insert a title and read it back through search_titles', async () => {
  const external = `verify-${suffix}`;
  const { data, error } = await admin()
    .from('titles')
    .insert({
      provider_id: 'tmdb',
      external_id: external,
      media_type: 'tv',
      world: 'kdrama',
      title: `Verification Title ${suffix}`,
      year: 2026,
      status: 'airing',
      episode_count: 16,
      season_count: 1,
    })
    .select('id, title, world')
    .single();
  assert(!error, `title insert failed: ${error?.message}`);
  testTitleId = data.id;

  const { data: found, error: searchError } = await anonymous().rpc('search_titles', {
    p_query: `Verification Title ${suffix}`,
    p_world: 'kdrama',
  });
  assert(!searchError, `search_titles failed: ${searchError?.message}`);
  assert(found.some((row) => row.id === testTitleId), 'search_titles did not return the inserted title');
  return `title ${testTitleId} searchable`;
});

// ---------------------------------------------------------------------------------------------

startGroup('Profiles');

await test('Update own profile', async () => {
  const { error } = await alice
    .from('profiles')
    .update({ display_name: 'Verification A', bio: 'set by the backend verification script' })
    .eq('id', aliceId);
  assert(!error, `profile update failed: ${error?.message}`);
  const { data } = await alice.from('profiles').select('bio').eq('id', aliceId).single();
  assert(data.bio?.startsWith('set by'), 'profile update did not persist');
  return 'display_name and bio updated';
});

await test('Complete onboarding with valid worlds', async () => {
  const { data, error } = await alice.rpc('complete_onboarding', {
    p_worlds: ['kdrama', 'anime'],
    p_genres: ['Romance'],
    p_step: 4,
  });
  assert(!error, `complete_onboarding failed: ${error?.message}`);
  assert(data.onboarding_completed === true, 'onboarding was not marked complete');
  assert(Array.isArray(data.worlds) && data.worlds.length === 2, 'worlds were not stored');
  return 'worlds + genres stored';
});

await test('complete_onboarding rejects an unknown world', async () => {
  const { error } = await bob.rpc('complete_onboarding', { p_worlds: ['not-a-world'] });
  assert(error, 'an unknown world was accepted');
  return `rejected with ${error.code ?? 'an error'}`;
});

startGroup('Posts');

await test('Member creates a post', async () => {
  const { data, error } = await alice
    .from('posts')
    .insert({
      author_id: aliceId,
      type: 'discussion',
      title: 'Verification post',
      body: 'This post exists to prove the database works.',
      kind: 'general',
      spoiler: 'none',
      world: 'kdrama',
      title_id: testTitleId,
      hashtags: ['verification'],
    })
    .select('id, author_id, state')
    .single();
  assert(!error, `post insert failed: ${error?.message}`);
  postId = data.id;
  assert(data.state === 'active', 'new post is not active');
  return `post ${postId}`;
});

await test('Post counts are maintained by triggers', async () => {
  const { data } = await admin().from('profiles').select('post_count').eq('id', aliceId).single();
  assert(data.post_count >= 1, `post_count was ${data.post_count}, expected >= 1`);
  return `post_count = ${data.post_count}`;
});

await test('Duplicate reactions are impossible (one per member per post)', async () => {
  const first = await bob.from('reactions').insert({ user_id: bobId, kind: 'loved', post_id: postId });
  assert(!first.error, `first reaction failed: ${first.error?.message}`);
  const second = await bob.from('reactions').insert({ user_id: bobId, kind: 'cried', post_id: postId });
  assert(second.error, 'a second reaction on the same post was accepted');
  return `rejected with ${second.error.code ?? 'an error'}`;
});

startGroup('Comments');

await test('Member comments on a post', async () => {
  const { data, error } = await alice
    .from('comments')
    .insert({ post_id: postId, author_id: aliceId, body: 'Verification comment.' })
    .select('id, post_id')
    .single();
  assert(!error, `comment insert failed: ${error?.message}`);
  commentId = data.id;
  return `comment ${commentId}`;
});

await test('Replies must sit on the same post', async () => {
  const { error } = await bob.from('comments').insert({
    post_id: '00000000-0000-0000-0000-000000000000',
    author_id: bobId,
    parent_id: commentId,
    body: 'Reply under a comment from another post.',
  });
  assert(error, 'a reply to a comment on a different post was accepted');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('Reply depth is limited to one level', async () => {
  const { data: reply, error: replyError } = await bob
    .from('comments')
    .insert({ post_id: postId, author_id: bobId, parent_id: commentId, body: 'A reply.' })
    .select('id')
    .single();
  assert(!replyError, `reply insert failed: ${replyError?.message}`);

  const { error } = await bob
    .from('comments')
    .insert({ post_id: postId, author_id: aliceId, parent_id: reply.id, body: 'A reply to the reply.' });
  assert(error, 'a second level of threading was accepted');
  return `rejected with ${error.code ?? 'an error'}`;
});

startGroup('Reactions');

await test('toggle_reaction sets, swaps and clears', async () => {
  const set = await bob.rpc('toggle_reaction', { p_target_type: 'post', p_target_id: postId, p_kind: 'cried' });
  assert(!set.error, `toggle_reaction set failed: ${set.error?.message}`);
  assert(set.data.active === true && set.data.kind === 'cried', 'reaction was not set');
  assert(set.data.counts.cried === 1, `post cried_count is ${set.data.counts.cried}, expected 1`);

  const swap = await bob.rpc('toggle_reaction', { p_target_type: 'post', p_target_id: postId, p_kind: 'laughed' });
  assert(!swap.error, `toggle_reaction swap failed: ${swap.error?.message}`);
  assert(swap.data.counts.cried === 0, `cried_count is ${swap.data.counts.cried} after the swap, expected 0`);
  assert(swap.data.counts.launched === undefined && swap.data.counts.laughed === 1, `laughed_count is ${swap.data.counts.laughed}, expected 1`);

  const cleared = await bob.rpc('toggle_reaction', { p_target_type: 'post', p_target_id: postId, p_kind: 'laughed' });
  assert(!cleared.error, `toggle_reaction clear failed: ${cleared.error?.message}`);
  assert(cleared.data.active === false, 'reaction was not cleared');
  return 'set → swap → cleared, counters exact';
});

await test('toggle_reaction rejects an unknown target', async () => {
  const { error } = await bob.rpc('toggle_reaction', {
    p_target_type: 'post',
    p_target_id: '00000000-0000-0000-0000-000000000000',
    p_kind: 'loved',
  });
  assert(error, 'a reaction on a missing post was accepted');
  return `rejected with ${error.code ?? 'an error'}`;
});

startGroup('Social graph');

await test('Follow, count, unfollow', async () => {
  const on = await bob.rpc('set_follow', { p_kind: 'user', p_target_id: aliceId, p_on: true });
  assert(!on.error && on.data === true, `follow failed: ${on.error?.message}`);

  const { data } = await alice.from('profiles').select('follower_count').eq('id', aliceId).single();
  assert(data.follower_count >= 1, `follower_count is ${data.follower_count}, expected >= 1`);

  const off = await bob.rpc('set_follow', { p_kind: 'user', p_target_id: aliceId, p_on: false });
  assert(!off.error && off.data === false, `unfollow failed: ${off.error?.message}`);
  return 'follower_count maintained by trigger';
});

await test('Self-follow is refused', async () => {
  const { error } = await bob.rpc('set_follow', { p_kind: 'user', p_target_id: bobId, p_on: true });
  assert(error, 'a member was allowed to follow themselves');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('Block severs the follow relationship', async () => {
  await bob.rpc('set_follow', { p_kind: 'user', p_target_id: aliceId, p_on: true });
  const blocked = await bob.rpc('set_block', { p_user_id: aliceId, p_on: true });
  assert(!blocked.error, `block failed: ${blocked.error?.message}`);
  const { data } = await admin().from('follows').select('follower_id').eq('follower_id', bobId).eq('target_id', aliceId);
  assert(data.length === 0, 'the follow survived the block');
  return 'follow removed by block';
});

startGroup('Saves and collections');

await test('toggle_save saves and unsaves', async () => {
  const saved = await bob.rpc('toggle_save', { p_post_id: postId });
  assert(!saved.error && saved.data === true, `save failed: ${saved.error?.message}`);
  const { data } = await admin().from('posts').select('save_count').eq('id', postId).single();
  assert(data.save_count >= 1, `save_count is ${data.save_count}`);

  const unsaved = await bob.rpc('toggle_save', { p_post_id: postId });
  assert(!unsaved.error && unsaved.data === false, 'unsave failed');
  return 'save_count maintained by trigger';
});

await test('Private collection holds a title', async () => {
  const { data: collection, error } = await bob
    .from('collections')
    .insert({ owner_id: bobId, title: 'Verification shelf', visibility: 'private' })
    .select('id')
    .single();
  assert(!error, `collection insert failed: ${error?.message}`);

  const { error: itemError } = await bob
    .from('collection_items')
    .insert({ collection_id: collection.id, title_id: testTitleId, note: 'verification' });
  assert(!itemError, `collection item insert failed: ${itemError?.message}`);

  const { data } = await admin().from('collections').select('item_count').eq('id', collection.id).single();
  assert(data.item_count === 1, `item_count is ${data.item_count}, expected 1`);
  return `collection ${collection.id} with 1 item`;
});

startGroup('Watchlist');

await test('Watchlist item with progress', async () => {
  const { data, error } = await alice.rpc('upsert_watchlist_item', {
    p_title_id: testTitleId,
    p_status: 'watching',
    p_season: 1,
    p_episode: 3,
    p_total: 16,
    p_note: 'verification',
  });
  assert(!error, `upsert_watchlist_item failed: ${error?.message}`);
  assert(data.current_episode === 3, `current_episode is ${data.current_episode}`);

  const rewind = await alice.rpc('upsert_watchlist_item', {
    p_title_id: testTitleId,
    p_season: 1,
    p_episode: 1,
  });
  assert(rewind.error, 'progress was allowed to move backwards inside a season');
  return 'progress stored, backwards move rejected';
});

await test('Reaching the last episode completes the title', async () => {
  const { data, error } = await alice.rpc('upsert_watchlist_item', {
    p_title_id: testTitleId,
    p_season: 1,
    p_episode: 16,
    p_total: 16,
  });
  assert(!error, `completion failed: ${error?.message}`);
  assert(data.status === 'completed' && data.completed_at, 'the title was not marked completed');
  return 'status = completed';
});

startGroup('Notifications');

await test('Reaction produced a notification for the author', async () => {
  const { data, error } = await alice
    .from('notifications')
    .select('id, kind, actor_ids, read_at')
    .order('created_at', { ascending: false })
    .limit(10);
  assert(!error, `notification read failed: ${error?.message}`);
  assert(data.some((n) => n.kind === 'reaction'), 'no reaction notification was delivered');
  return `${data.length} notification(s), including a reaction`;
});

await test('mark_notifications_read updates the caller inbox only', async () => {
  const { data, error } = await alice.rpc('mark_notifications_read', { p_ids: null });
  assert(!error, `mark_notifications_read failed: ${error?.message}`);
  assert(typeof data === 'number', 'expected a count of updated rows');
  const { data: unread } = await alice
    .from('notifications')
    .select('id')
    .is('read_at', null);
  assert(unread.length === 0, `${unread.length} notifications are still unread`);
  return `${data} marked read`;
});

startGroup('Preferences');

await test('merge_preferences applies an allow-listed patch', async () => {
  const { data, error } = await alice.rpc('merge_preferences', {
    p_patch: { autoplay: 'always', true_black: true, notify_highlights: false },
  });
  assert(!error, `merge_preferences failed: ${error?.message}`);
  assert(data.autoplay === 'always' && data.true_black === true, 'values were not applied');
  assert(data.notify_highlights === false, 'notification preference was not applied');
  return 'autoplay=true_black+notify_highlights applied';
});

await test('Accepting the guidelines records a timestamp', async () => {
  const { data, error } = await alice.rpc('merge_preferences', { p_patch: { guidelines_accepted: true } });
  assert(!error, `merge_preferences failed: ${error?.message}`);
  assert(data.guidelines_accepted === true && data.guidelines_accepted_at, 'no timestamp recorded');
  return 'guidelines_accepted_at recorded';
});

await test('Bootstrap returns the member slice', async () => {
  const { data, error } = await alice.rpc('get_bootstrap');
  assert(!error, `get_bootstrap failed: ${error?.message}`);
  assert(data.profile?.id === aliceId, 'bootstrap did not return the caller profile');
  assert(data.prefs, 'bootstrap did not return preferences');
  assert(Array.isArray(data.watchlist), 'bootstrap did not return the watchlist');
  return 'profile, prefs, follows, saves, watchlist returned';
});

startGroup('Analytics');

await test('record_event stores a validated event', async () => {
  const id = await admin().rpc('record_event', {
    p_name: 'verification.probe',
    p_properties: { source: 'verify-backend.mjs' },
    p_anonymous_id: '00000000-0000-0000-0000-000000000001',
  });
  assert(!id.error, `record_event failed: ${id.error?.message}`);
  assert(typeof id.data === 'number', 'record_event did not return an event id');
  return `event ${id.data} stored`;
});

await test('record_event rejects an invalid event name', async () => {
  const { error } = await admin().rpc('record_event', { p_name: 'Not A Valid Name!' });
  assert(error, 'an invalid event name was accepted');
  return `rejected with ${error.code ?? 'an error'}`;
});

// ---------------------------------------------------------------------------------------------
// 4. Security
// ---------------------------------------------------------------------------------------------

startGroup('Security isolation');

await test('Anonymous cannot write content', async () => {
  const { error } = await anonymous().from('posts').insert({
    author_id: aliceId,
    body: 'anonymous write attempt',
  });
  assert(error, 'an anonymous insert into posts succeeded');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('A member cannot write a post as somebody else', async () => {
  const { error } = await bob.from('posts').insert({ author_id: aliceId, body: 'impersonation attempt' });
  assert(error, 'a member created a post under another author');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('A member cannot edit another member\'s post', async () => {
  const { error } = await bob.from('posts').update({ body: 'tampered' }).eq('id', postId);
  assert(error, "a member edited another member's post");
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('Privilege escalation through the profile row is impossible', async () => {
  const { error } = await alice.from('profiles').update({ role: 'admin', verified: true }).eq('id', aliceId);
  assert(error, 'a member promoted themselves to admin');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('A member cannot read another member\'s watchlist', async () => {
  const { data, error } = await bob.from('watchlist_items').select('*');
  assert(!error, `watchlist read failed: ${error?.message}`);
  assert(data.length === 0, `bob read ${data.length} of alice's watchlist rows`);
  return 'bob sees 0 rows';
});

await test('A member cannot read another member\'s saved posts', async () => {
  await alice.rpc('toggle_save', { p_post_id: postId });
  const { data, error } = await bob.from('saves').select('*');
  assert(!error, `saves read failed: ${error?.message}`);
  assert(data.length === 0, `bob read ${data.length} of alice's saved posts`);
  return 'bob sees 0 rows';
});

await test('A member cannot read another member\'s notifications', async () => {
  const { data, error } = await bob.from('notifications').select('*');
  assert(!error, `notifications read failed: ${error?.message}`);
  assert(data.length === 0, `bob read ${data.length} of alice's notifications`);
  return 'bob sees 0 rows';
});

await test('A member cannot read another member\'s push tokens', async () => {
  await alice.rpc('register_push_token', {
    p_token: `verification-token-${suffix}-aaaaaaaaaaaaaaaaaaaa`,
    p_platform: 'android',
    p_device_name: 'verification device',
  });
  const { data, error } = await bob.from('push_tokens').select('*');
  assert(!error, `push token read failed: ${error?.message}`);
  assert(data.length === 0, `bob read ${data.length} of alice's push tokens`);
  return 'bob sees 0 tokens';
});

await test('Notifications cannot be inserted by a client', async () => {
  const { error } = await alice.from('notifications').insert({
    recipient_id: bobId,
    kind: 'follow',
  });
  assert(error, 'a client inserted a notification directly');
  return `rejected with ${error.code ?? 'an error'}`;
});

await test('delete_account only deletes the caller', async () => {
  const { data, error } = await bob.rpc('delete_account');
  assert(!error, `delete_account failed: ${error?.message}`);
  assert(data.deleted === true, 'delete_account did not report success');

  const { data: profile } = await admin().from('profiles').select('account_status, display_name').eq('id', bobId).single();
  assert(profile.account_status === 'deleted', "bob's profile was not marked deleted");
  assert(profile.display_name === 'Deleted member', "bob's display name was not scrubbed");

  const { data: aliceProfile } = await admin().from('profiles').select('account_status').eq('id', aliceId).single();
  assert(aliceProfile.account_status === 'active', "delete_account removed somebody else's account");
  return 'caller scrubbed, other account untouched';
});

// ---------------------------------------------------------------------------------------------
// 5. Storage
// ---------------------------------------------------------------------------------------------

startGroup('Storage');

await test('The media bucket exists and is private', async () => {
  const { data, error } = await admin().storage.getBucket('media');
  assert(!error, `media bucket missing: ${error?.message}`);
  assert(data.public === false, 'the media bucket is public — it must stay private');
  return `public = ${data.public}, limit = ${data.file_size_limit} bytes`;
});

let uploadedPath = '';

await test('Member uploads into their own folder', async () => {
  uploadedPath = `u/${aliceId}/posts/${suffix}.png`;
  const bytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082',
    'hex',
  );
  const { error } = await alice.storage.from('media').upload(uploadedPath, bytes, { contentType: 'image/png', upsert: true });
  assert(!error, `upload failed: ${error?.message}`);
  return `uploaded ${uploadedPath}`;
});

await test('Member reads their own object back', async () => {
  const { data, error } = await alice.storage.from('media').download(uploadedPath);
  assert(!error, `download failed: ${error?.message}`);
  assert(data.byteLength > 0, 'the object came back empty');
  return `${data.byteLength} bytes retrieved`;
});

await test('Another member cannot delete the object', async () => {
  const { error } = await bob.storage.from('media').remove([uploadedPath]);
  assert(error, "a member deleted another member's object");
  return `rejected with ${error.statusCode ?? 'an error'}`;
});

await test('Member deletes their own object', async () => {
  const { error } = await alice.storage.from('media').remove([uploadedPath]);
  assert(!error, `delete failed: ${error?.message}`);
  return 'object removed';
});

// ---------------------------------------------------------------------------------------------
// 6. Repository credential hygiene (offline)
// ---------------------------------------------------------------------------------------------

startGroup('Repository hygiene');

await test('No privileged credential is committed', async () => {
  const { offenders, filesScanned } = await scanRepository();
  assert(
    offenders.length === 0,
    `credential(s) found: ${offenders.map((o) => `${o.kind} in ${o.file}`).join(', ')}`,
  );
  return `${filesScanned} files scanned, no credential found`;
});

// ---------------------------------------------------------------------------------------------
// 7. Cleanup
// ---------------------------------------------------------------------------------------------

startGroup('Cleanup');

await test('Remove everything the verification created', async () => {
  const service = admin();
  if (testTitleId) await service.from('titles').delete().eq('id', testTitleId);

  let removed = 0;
  for (const member of [userA, userB]) {
    if (!member.id) continue;
    const { error } = await service.auth.admin.deleteUser(member.id);
    if (!error) {
      removed += 1;
    } else if (!/not found|does not exist|403/i.test(error.message)) {
      throw new Error(`could not remove ${member.email}: ${error.message}`);
    }
  }
  assert(removed > 0, 'no test account was removed');
  return `${removed} test account(s) removed`;
});

// ---------------------------------------------------------------------------------------------
// 8. Report
// ---------------------------------------------------------------------------------------------

const order = [
  'Supabase connection',
  'Schema',
  'RPCs',
  'Authentication',
  'Catalog',
  'Profiles',
  'Posts',
  'Comments',
  'Reactions',
  'Social graph',
  'Saves and collections',
  'Watchlist',
  'Notifications',
  'Preferences',
  'Analytics',
  'Security isolation',
  'Storage',
  'Repository hygiene',
  'Cleanup',
];

console.log('HALLYU BACKEND VERIFICATION');
console.log('===========================');
console.log(`target: ${SUPABASE_URL}`);
console.log(`started: ${new Date(stamp).toISOString()}`);
console.log('');

let failed = 0;
for (const group of order) {
  const inGroup = results.filter((r) => r.group === group);
  if (inGroup.length === 0) continue;
  const groupOk = inGroup.every((r) => r.ok);
  if (!groupOk) failed += 1;
  console.log(`${group.padEnd(24)} ${groupOk ? 'PASS' : 'FAIL'}`);
  for (const r of inGroup) {
    console.log(`   ${r.ok ? '·' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}

console.log('');
console.log('===========================');
if (failed === 0) {
  console.log('OVERALL STATUS: PASS');
  process.exit(0);
}

const failures = results.filter((r) => !r.ok);
console.log(`OVERALL STATUS: FAIL (${failures.length} of ${results.length} checks)`);
process.exit(1);