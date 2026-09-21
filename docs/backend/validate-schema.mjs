// Runs docs/backend/schema.sql inside PGlite (Postgres-in-WASM) with stubs for Supabase-specific pieces,
// then executes a functional smoke test of the RPCs. Usage:
//   npm i -D @electric-sql/pglite   (or run from a scratch dir that has it)
//   node docs/backend/validate-schema.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PGLITE_DIR ? process.env.PGLITE_DIR + '/package.json' : import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const { citext } = require('@electric-sql/pglite/contrib/citext');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const raw = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
// strip supabase-only blocks
const sql = raw.replace(/-- >>> supabase-only[\s\S]*?-- <<< supabase-only\n?/g, '');

const db = new PGlite({ extensions: { citext, pg_trgm, pgcrypto } });
const stubs = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  -- Supabase default privileges: API roles get table privileges up-front; RLS is the gate
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
`;
await db.exec(stubs);
// PGlite needs each `create extension` in its own exec before the types are used
for (const ext of ['citext', 'pg_trgm', 'pgcrypto']) await db.exec(`create extension if not exists ${ext};`);
try {
  await db.exec(sql.replace(/^create extension if not exists (citext|pg_trgm|pgcrypto);$/gm, ''));
} catch (e) {
  console.error('SCHEMA FAILED:', e.message);
  process.exit(1);
}
// trigger that Supabase creates on auth.users (inside supabase-only block)
await db.exec(`create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`);
console.log('schema loaded OK');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const as = (uid, role = 'authenticated') => db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role, app_metadata: { role: 'user' } })}', false)`);
const q = async (s, params) => (await db.query(s, params)).rows;

await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'mina@example.com', '{"displayName":"Mina"}'), ('${B}', 'joon@example.com', '{}')`);
console.log('profiles:', await q('select id, handle, display_name from public.profiles order by handle'));
await db.exec(`insert into public.catalog_dramas (id, tmdb_id, title, genres, status) values ('queen-of-tears', 219246, 'Queen of Tears', '{Romance,Melodrama}', 'ended')`);
await db.exec(`insert into public.catalog_episodes (drama_id, season, number, title, air_at) values ('queen-of-tears', 1, 16, 'Finale', now() + interval '30 minutes')`);

await as(A);
await q(`select api.claim_handle('mina_k')`);
await q(`select api.set_follow('drama', 'queen-of-tears', true)`);
await q(`select api.set_follow('user', '${B}', true)`);
await q(`select api.upsert_watchlist('queen-of-tears', 'watching', 1, 12, 'so good')`);
const postId = '33333333-3333-4333-8333-333333333333';
console.log('create_post:', await q(`select api.create_post($1::jsonb)`, [JSON.stringify({ id: postId, type: 'discussion', title: 'That ending', body: 'Episode 16 broke me #QueenOfTears', spoiler: 'episode', context: { dramaId: 'queen-of-tears', season: 1, episode: 16 }, hashtags: ['QueenOfTears'], mentionIds: [B] })]));
console.log('dup create_post:', await q(`select api.create_post($1::jsonb)`, [JSON.stringify({ id: postId, type: 'discussion', title: 'x', body: 'y' })]));
try { await q(`select api.create_post($1::jsonb)`, [JSON.stringify({ id: '44444444-4444-4444-8444-444444444444', type: 'reaction', body: 'x'.repeat(141), context: { dramaId: 'queen-of-tears' } })]); } catch (e) { console.log('expected 422:', e.message); }

await as(B);
await q(`select api.set_reaction('post', '${postId}', 'cried')`);
await q(`select api.set_reaction('post', '${postId}', 'loved')`); // switch
await q(`select api.set_save('${postId}', true)`);
const commentId = '55555555-5555-4555-8555-555555555555';
await q(`select api.create_comment($1::jsonb)`, [JSON.stringify({ id: commentId, postId, body: 'same 😭' })]);
try { await q(`select api.create_comment($1::jsonb)`, [JSON.stringify({ id: '66666666-6666-4666-8666-666666666666', postId, parentId: commentId, body: 'reply' })]); } catch (e) { console.log('unexpected', e.message); }
try {
  await q(`select api.create_comment($1::jsonb)`, [JSON.stringify({ id: '77777777-7777-4777-8777-777777777777', postId, parentId: '66666666-6666-4666-8666-666666666666', body: 'too deep' })]);
} catch (e) { console.log('expected depth error:', e.message); }

console.log('post counters:', await q(`select loved, cried, comment_count, save_count from public.posts where id = '${postId}'`));
console.log('episode meter:', await q(`select kind, count from public.episode_reaction_counts order by kind`));
console.log('notifications for A:', await q(`select kind, "group", array_length(actor_ids,1) actors from public.notifications where user_id = '${A}' order by kind`));
console.log('notifications for B:', await q(`select kind from public.notifications where user_id = '${B}' order by kind`));

await as(A);
const feed = (await q(`select api.feed_for_you() as f`))[0].f;
console.log('feed_for_you cards:', feed.length, 'first:', JSON.stringify(feed[0]).slice(0, 220), '…');
console.log('feed_following cards:', (await q(`select api.feed_following() as f`))[0].f.length);
console.log('search_posts:', (await q(`select api.search_posts('#queenoftears') as f`))[0].f.length, (await q(`select api.search_posts('ending') as f`))[0].f.length);
console.log('search_people:', (await q(`select api.search_people('mina') as f`))[0].f.map((p) => p.handle));
console.log('me():', Object.keys((await q(`select api.me() as m`))[0].m));
console.log('profile_page:', JSON.stringify((await q(`select api.profile_page('mina_k') as p`))[0].p).slice(0, 160));
console.log('episode_room:', JSON.stringify((await q(`select api.episode_room('queen-of-tears', 1, 16) as r`))[0].r).slice(0, 200));
console.log('notifications_page:', (await q(`select api.notifications_page() as n`))[0].n.map((n) => n.kind));
await q(`select api.mark_notifications_read()`);
console.log('unread after mark:', (await q(`select api.me() as m`))[0].m.unread);
await db.exec(`refresh materialized view public.mv_trending_posts; refresh materialized view public.mv_trending_dramas;`);
console.log('home_rails keys:', Object.keys((await q(`select api.home_rails() as h`))[0].h), 'live rooms:', (await q(`select api.home_rails() as h`))[0].h.liveRooms.length);
console.log('episode notifications scheduled:', await q(`select public.schedule_episode_notifications() as n`));

// rate limit
try { for (let i = 0; i < 25; i++) await q(`select api.create_report('post', '${postId}', 'spam', null)`); } catch (e) { console.log('expected 429:', e.message); }
// block hides
await as(B); await q(`select api.set_block('${A}', true)`);
await as(A); console.log('feed after being blocked by B (B has no posts, expect 1 own):', (await q(`select api.feed_for_you() as f`))[0].f.length, 'B profile visible?', (await q(`select api.profile_page('joon') as p`))[0].p);
// RLS: anon cannot see private prefs; authenticated cannot update counters
await db.exec(`select set_config('request.jwt.claims', '', false)`);
console.log('anon api.profiles prefs column:', await q(`select handle, prefs from api.profiles order by handle`));
await db.exec(`set role authenticated`); await as(A);
try { await db.exec(`update api.profiles set follower_count = 999 where id = '${A}'`); console.log('UNEXPECTED: counter update allowed'); } catch (e) { console.log('expected privilege error:', e.message.split('\n')[0]); }
await db.exec(`update api.profiles set bio = 'K-drama forever' where id = '${A}'`);
console.log('bio updated:', await q(`select bio from api.profiles where id = '${A}'`));
try { await db.exec(`insert into public.posts (id, author_id, type) values (gen_random_uuid(), '${A}', 'post')`); console.log('UNEXPECTED: direct insert allowed'); } catch (e) { console.log('expected RLS/priv error on direct insert:', e.message.split('\n')[0]); }
await db.exec(`reset role`);

// collections, edit window, push tokens, media ledger via service role
await as(A);
const colId = '88888888-8888-4888-8888-888888888888';
await q(`select api.upsert_collection($1::jsonb)`, [JSON.stringify({ id: colId, title: 'Ugly-cry finales', visibility: 'public', coverDramaId: 'queen-of-tears' })]);
await q(`select api.set_collection_item('${colId}', 'queen-of-tears', true, 'ep 16')`);
await q(`select api.edit_post('${postId}', $1::jsonb)`, [JSON.stringify({ body: 'Episode 16 broke me (edited) #QueenOfTears', hashtags: ['QueenOfTears', 'finale'] })]);
await q(`select api.register_push_token('ExponentPushToken[abc123]', 'android', 'pixel-1')`);
await as(B);
await q(`select api.set_block('${A}', false)`);
await q(`select api.set_follow('collection', '${colId}', true)`);
console.log('collection counters:', await q(`select item_count, follower_count from public.collections where id = '${colId}'`));
console.log('post edited:', await q(`select edited_at is not null as edited, hashtags from public.posts where id = '${postId}'`));
console.log('A notifications now:', (await q(`select kind from public.notifications where user_id = '${A}' order by kind`)).map((r) => r.kind));
// service role media flow
await as(A, 'service_role');
const key = `video/${A}/01J8Z9K2M3N4P5Q6R7S8T9V0WX.mp4`, poster = `video/${A}/01J8Z9K2M3N4P5Q6R7S8T9V0WX_p.jpg`;
await q(`select api.media_reserve('${A}', '${key}', 'video', 'video/mp4', 20000000, 'mp-1')`);
await q(`select api.media_reserve('${A}', '${poster}', 'poster', 'image/jpeg', 50000)`);
try { await q(`select api.media_reserve('${A}', 'video/${A}/01J8Z9K2M3N4P5Q6R7S8T9V0WY.mp4', 'video', 'video/mp4', 200000000)`); } catch (e) { console.log('expected 413:', e.message); }
await q(`select api.media_finalize('${key}', 19999000, true, 720, 1280, 44000)`);
await as(A);
try { await q(`select api.create_post($1::jsonb)`, [JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', type: 'short', body: 'clip', media: [{ key, kind: 'video', posterKey: poster, durationMs: 44000 }] })]); console.log('UNEXPECTED: poster not ready accepted'); } catch (e) { console.log('expected poster-not-ready:', e.message); }
await as(A, 'service_role'); await q(`select api.media_finalize('${poster}', 49000, true, 640, 1136)`); await as(A);
console.log('short created:', await q(`select api.create_post($1::jsonb)`, [JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', type: 'short', body: 'clip', media: [{ key, kind: 'video', posterKey: poster, durationMs: 44000, width: 720, height: 1280 }] })]));
console.log('shorts feed:', (await q(`select api.feed_shorts() as f`))[0].f.map((c) => c.media));
await q(`select api.delete_post('99999999-9999-4999-8999-999999999999')`);
await db.exec(`update public.posts set deleted_at = now() - interval '25 hours' where id = '99999999-9999-4999-8999-999999999999'`);
console.log('retention sweep:', await q(`select public.retention_sweep()`));
console.log('media marked for purge:', await q(`select key, status from public.media_uploads order by key`));
try { await as(A); await q(`select api.media_reserve('${A}', 'avatars/${A}/01J8Z9K2M3N4P5Q6R7S8T9V0WZ.jpg', 'avatar', 'image/jpeg', 1000)`); console.log('UNEXPECTED: user could reserve'); } catch (e) { console.log('expected 403 for non-service role:', e.message); }
console.log('ALL SMOKE TESTS DONE');
