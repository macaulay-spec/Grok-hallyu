-- ============================================================
-- HALLYU · Full backend setup (paste into Supabase SQL Editor → Run)
-- Idempotent: safe to run more than once.
-- Adds: episodes table, drama metadata columns, mood tags,
--       RLS policies on EVERYTHING, auto-profile + notification
--       triggers, storage buckets & policies, realtime,
--       seed data (8 demo users, 16 dramas, episodes incl. a
--       LIVE one, posts, comments, likes, follows, notifications)
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================ TABLES ============================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text unique not null,
  avatar_url text,
  bio text default '',
  created_at timestamptz default now()
);

create table if not exists dramas (
  id uuid primary key default uuid_generate_v4(),
  title text not null unique,
  poster_url text,
  year int,
  country text default 'KR',
  status text default 'completed',          -- airing | completed | upcoming
  episodes_count int default 16,
  genres text[] default '{}',
  synopsis text default '',
  cast_text text[] default '{}',
  created_at timestamptz default now()
);
alter table dramas add column if not exists country text default 'KR';
alter table dramas add column if not exists status text default 'completed';
alter table dramas add column if not exists episodes_count int default 16;
alter table dramas add column if not exists created_at timestamptz default now();

create table if not exists episodes (
  id uuid primary key default uuid_generate_v4(),
  drama_id uuid not null references dramas(id) on delete cascade,
  number int not null,
  title text default '',
  aired_at timestamptz,
  unique (drama_id, number)
);

create table if not exists posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  body text default '',
  image_url text,
  mood text,                                 -- loved | cried | hype | hot_take | ship
  episode_id uuid references episodes(id) on delete set null,
  spoiler boolean default false,
  created_at timestamptz default now()
);
alter table posts add column if not exists mood text;
alter table posts add column if not exists episode_id uuid references episodes(id) on delete set null;
alter table posts add column if not exists spoiler boolean default false;

create table if not exists post_dramas (
  post_id uuid references posts(id) on delete cascade,
  drama_id uuid references dramas(id) on delete cascade,
  primary key (post_id, drama_id)
);

create table if not exists comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists saves (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists follows_users (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists follows_dramas (
  user_id uuid references profiles(id) on delete cascade,
  drama_id uuid references dramas(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, drama_id)
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type text not null,                        -- like | comment | follow
  post_id uuid references posts(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);

-- indexes for feed/list performance
create index if not exists idx_posts_created on posts (created_at desc);
create index if not exists idx_posts_user on posts (user_id);
create index if not exists idx_posts_episode on posts (episode_id);
create index if not exists idx_comments_post on comments (post_id);
create index if not exists idx_likes_user on likes (user_id);
create index if not exists idx_episodes_drama on episodes (drama_id, number);
create index if not exists idx_notifs_user on notifications (user_id, created_at desc);

-- ============================ RLS ============================
-- Public community reads; writes restricted to the owner.
-- dramas/episodes are catalog data: everyone reads, only the
-- service role (you, via dashboard) writes.

alter table profiles       enable row level security;
alter table dramas         enable row level security;
alter table episodes       enable row level security;
alter table posts          enable row level security;
alter table post_dramas    enable row level security;
alter table comments       enable row level security;
alter table likes          enable row level security;
alter table saves          enable row level security;
alter table follows_users  enable row level security;
alter table follows_dramas enable row level security;
alter table notifications  enable row level security;
alter table reports        enable row level security;

drop policy if exists "profiles read"        on profiles;
create policy "profiles read" on profiles for select using (true);
drop policy if exists "profiles insert own"  on profiles;
create policy "profiles insert own" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles update own"  on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid());

drop policy if exists "dramas read" on dramas;
create policy "dramas read" on dramas for select using (true);
drop policy if exists "episodes read" on episodes;
create policy "episodes read" on episodes for select using (true);

drop policy if exists "posts read"    on posts;
create policy "posts read" on posts for select using (true);
drop policy if exists "posts write own" on posts;
create policy "posts write own" on posts for insert with check (user_id = auth.uid());
drop policy if exists "posts update own" on posts;
create policy "posts update own" on posts for update using (user_id = auth.uid());
drop policy if exists "posts delete own" on posts;
create policy "posts delete own" on posts for delete using (user_id = auth.uid());

drop policy if exists "post_dramas read" on post_dramas;
create policy "post_dramas read" on post_dramas for select using (true);
drop policy if exists "post_dramas write own post" on post_dramas;
create policy "post_dramas write own post" on post_dramas for insert
  with check (exists (select 1 from posts p where p.id = post_id and p.user_id = auth.uid()));
drop policy if exists "post_dramas delete own post" on post_dramas;
create policy "post_dramas delete own post" on post_dramas for delete
  using (exists (select 1 from posts p where p.id = post_id and p.user_id = auth.uid()));

drop policy if exists "comments read" on comments;
create policy "comments read" on comments for select using (true);
drop policy if exists "comments write own" on comments;
create policy "comments write own" on comments for insert with check (user_id = auth.uid());
drop policy if exists "comments delete own" on comments;
create policy "comments delete own" on comments for delete using (user_id = auth.uid());

drop policy if exists "likes read" on likes;
create policy "likes read" on likes for select using (true);
drop policy if exists "likes own" on likes;
create policy "likes own" on likes for insert with check (user_id = auth.uid());
drop policy if exists "likes delete own" on likes;
create policy "likes delete own" on likes for delete using (user_id = auth.uid());

drop policy if exists "saves read" on saves;
create policy "saves read" on saves for select using (true);
drop policy if exists "saves own" on saves;
create policy "saves own" on saves for insert with check (user_id = auth.uid());
drop policy if exists "saves delete own" on saves;
create policy "saves delete own" on saves for delete using (user_id = auth.uid());

drop policy if exists "follows_users read" on follows_users;
create policy "follows_users read" on follows_users for select using (true);
drop policy if exists "follows_users own" on follows_users;
create policy "follows_users own" on follows_users for insert with check (follower_id = auth.uid());
drop policy if exists "follows_users delete own" on follows_users;
create policy "follows_users delete own" on follows_users for delete using (follower_id = auth.uid());

drop policy if exists "follows_dramas read" on follows_dramas;
create policy "follows_dramas read" on follows_dramas for select using (true);
drop policy if exists "follows_dramas own" on follows_dramas;
create policy "follows_dramas own" on follows_dramas for insert with check (user_id = auth.uid());
drop policy if exists "follows_dramas delete own" on follows_dramas;
create policy "follows_dramas delete own" on follows_dramas for delete using (user_id = auth.uid());

drop policy if exists "notifications read own" on notifications;
create policy "notifications read own" on notifications for select using (user_id = auth.uid());
drop policy if exists "notifications update own" on notifications;
create policy "notifications update own" on notifications for update using (user_id = auth.uid());
-- inserts happen via security-definer triggers below (no user insert policy)

drop policy if exists "reports insert own" on reports;
create policy "reports insert own" on reports for insert with check (reporter_id = auth.uid());
-- reports are never selectable by clients (admin/service-role only)

-- ============================ TRIGGERS ============================

-- 1) auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := new.raw_user_meta_data->>'username';
  if uname is null or uname = '' then
    uname := split_part(new.email, '@', 1);
  end if;
  uname := lower(regexp_replace(uname, '[^a-z0-9_]', '', 'g'));
  if uname = '' then uname := 'fan'; end if;
  while exists (select 1 from profiles where username = uname) loop
    uname := uname || substr(md5(random()::text), 1, 3);
  end loop;
  insert into public.profiles (id, display_name, username, bio)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    uname,
    coalesce(new.raw_user_meta_data->>'bio', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) notifications: like
create or replace function public.notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, actor_id, type, post_id)
    values (owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end $$;

drop trigger if exists likes_notify on likes;
create trigger likes_notify after insert on likes
  for each row execute function public.notify_like();

-- 3) notifications: comment
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, actor_id, type, post_id)
    values (owner, new.user_id, 'comment', new.post_id);
  end if;
  return new;
end $$;

drop trigger if exists comments_notify on comments;
create trigger comments_notify after insert on comments
  for each row execute function public.notify_comment();

-- 4) notifications: follow
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow');
  return new;
end $$;

drop trigger if exists follows_notify on follows_users;
create trigger follows_notify after insert on follows_users
  for each row execute function public.notify_follow();

-- ============================ STORAGE ============================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-media', 'post-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/heic']),
  ('avatars',    'avatars',    true,  5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = true;

drop policy if exists "post media public read" on storage.objects;
create policy "post media public read" on storage.objects for select using (bucket_id = 'post-media');
drop policy if exists "post media own upload" on storage.objects;
create policy "post media own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "post media own delete" on storage.objects;
create policy "post media own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars own upload" on storage.objects;
create policy "avatars own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================ REALTIME ============================

do $$ begin
  alter publication supabase_realtime add table posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table comments;
exception when duplicate_object then null; end $$;

-- ============================ SEED: demo users ============================
-- 8 demo fans, password for ALL: hallyudemo123
-- (sign in as any of them to test; profiles auto-create via trigger)

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, email_change, email_change_token_new, recovery_token, is_sso_login)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
       crypt('hallyudemo123', gen_salt('bf')), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, v.meta::jsonb, now(), now(),
       '', '', '', '', false
from (values
  ('11111111-1111-1111-1111-111111111101'::uuid, 'mina@hallyu.demo',  '{"display_name":"Mina Park","username":"mina_kdrama","bio":"Cloy forever. Episode-night snack preparer 🍜"}'),
  ('11111111-1111-1111-1111-111111111102'::uuid, 'jisoo@hallyu.demo', '{"display_name":"Jisoo Lee","username":"jisoo_ships","bio":"I ship harder than the writers write"}'),
  ('11111111-1111-1111-1111-111111111103'::uuid, 'dayo@hallyu.demo',  '{"display_name":"Dayo Kim","username":"dayo_rewatches","bio":"Goblin rewatch #7. Still crying."}'),
  ('11111111-1111-1111-1111-111111111104'::uuid, 'hana@hallyu.demo',  '{"display_name":"Hana Choi","username":"hana_hot_takes","bio":"Professional hot-take dispenser 🌶️"}'),
  ('11111111-1111-1111-1111-111111111105'::uuid, 'erin@hallyu.demo',  '{"display_name":"Erin Jung","username":"erin_ost","bio":"If the OST hits, I forgive the plot holes"}'),
  ('11111111-1111-1111-1111-111111111106'::uuid, 'soyeon@hallyu.demo','{"display_name":"Soyeon Ahn","username":"soyeon_sageuk","bio":"Sageuk enthusiast. History nerd. Kimchi critic."}'),
  ('11111111-1111-1111-1111-111111111107'::uuid, 'yumi@hallyu.demo',  '{"display_name":"Yumi Seo","username":"yumi_fancam","bio":"Fancam archivist 📹 bias: everyone''s bias"}'),
  ('11111111-1111-1111-1111-111111111108'::uuid, 'aisha@hallyu.demo', '{"display_name":"Aisha Bello","username":"aisha_lagos","bio":"K-drama from Lagos 🇳🇬 watching since Heirs"}')
) as v(id, email, meta)
where not exists (select 1 from auth.users u where u.email = v.email);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select uuid_generate_v4(), lower(u.email), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@hallyu.demo'
  and not exists (select 1 from auth.identities i where i.provider_id = lower(u.email) and i.provider = 'email');

-- ============================ SEED: dramas ============================

insert into dramas (id, title, year, country, status, episodes_count, genres, synopsis, cast_text) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Crash Landing on You',        2019, 'KR', 'completed', 16, array['Romance','Comedy','Drama'],       'A paragliding accident lands a South Korean heiress in North Korea, where an army officer hides her.', array['Hyun Bin','Son Ye-jin']),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'The Glory',                   2022, 'KR', 'completed', 16, array['Thriller','Revenge','Drama'],      'A woman who was brutally bullied in school devotes her life to an intricate revenge plan.',            array['Song Hye-kyo','Lee Do-hyun']),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Goblin',                      2016, 'KR', 'completed', 16, array['Fantasy','Romance','Drama'],       'An immortal goblin searches for his human bride to end his endless life.',                             array['Gong Yoo','Kim Go-eun']),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Business Proposal',           2022, 'KR', 'completed', 12, array['Romance','Comedy'],                'A food researcher goes on a blind date in her friend''s place — and meets her CEO.',                  array['Ahn Hyo-seop','Kim Se-jeong']),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Queen of Tears',              2024, 'KR', 'completed', 16, array['Romance','Drama','Melodrama'],     'A chaebol heiress and her small-town husband rediscover love amid a crisis.',                          array['Kim Soo-hyun','Kim Ji-won']),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Lovely Runner',               2024, 'KR', 'completed', 16, array['Romance','Fantasy','Comedy'],      'A superfan travels back in time to save her idol from his tragic fate.',                               array['Byeon Woo-seok','Kim Hye-yoon']),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'Alchemy of Souls',            2022, 'KR', 'completed', 20, array['Fantasy','Sageuk','Romance'],      'In a fictional era, a powerful soul-shifter lands in the body of a blind woman.',                      array['Lee Jae-wook','Jung So-min']),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'My Demon',                    2023, 'KR', 'completed', 16, array['Fantasy','Romance','Comedy'],      'A demon who has lived 200 years loses his powers after a contract marriage with a chaebol heiress.',  array['Song Kang','Kim You-jung']),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'Squid Game',                  2021, 'KR', 'completed',  9, array['Thriller','Survival','Drama'],     'Hundreds of cash-strapped players accept an invitation to compete in children''s games with deadly stakes.', array['Lee Jung-jae','Park Hae-soo']),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'It''s Okay to Not Be Okay',   2020, 'KR', 'completed', 16, array['Romance','Drama','Healing'],       'A psych ward caretaker and an antisocial children''s book author heal each other.',                   array['Kim Soo-hyun','Seo Ye-ji']),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'Descendants of the Sun',      2016, 'KR', 'completed', 16, array['Romance','Action','Melodrama'],   'A special forces captain and a surgeon fall in love in a war-torn country.',                           array['Song Joong-ki','Song Hye-kyo']),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'Reply 1988',                  2015, 'KR', 'completed', 20, array['Slice of Life','Comedy','Drama'],  'Five families in a Seoul neighborhood in 1988 — friendship, first love, and growing up.',              array['Park Bo-gum','Hyeri']),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'Hotel del Luna',              2019, 'KR', 'completed', 16, array['Fantasy','Romance','Drama'],       'A mysterious hotel for ghosts is run by a beautiful, moody CEO bound to it for a thousand years.',     array['IU','Yeo Jin-goo']),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'Healer',                      2014, 'KR', 'completed', 20, array['Action','Romance','Thriller'],     'A night courier with elite skills gets entangled with a tabloid reporter and past conspiracies.',      array['Ji Chang-wook','Park Min-young']),
  ('aaaaaaaa-0000-0000-0000-000000000015', 'Move to Heaven',              2021, 'KR', 'completed', 10, array['Drama','Healing','Slice of Life'], 'A trauma cleaner with Asperger''s and his uncle uncover the stories the dead leave behind.',           array['Lee Je-hoon','Tang Jun-sang']),
  ('aaaaaaaa-0000-0000-0000-000000000016', 'Starlight Serenade',          2026, 'KR', 'airing',    12, array['Romance','Melodrama','Music'],     'A washed-up idol and a classical cellist are forced to share a failing rooftop bar — and a playlist that rewrites both their lives.', array['Cha Eun-woo','Kim Tae-ri'])
on conflict (id) do update set
  title = excluded.title, year = excluded.year, status = excluded.status,
  episodes_count = excluded.episodes_count, genres = excluded.genres,
  synopsis = excluded.synopsis, cast_text = excluded.cast_text;

-- ============================ SEED: episodes ============================
-- completed classics get full runs; the airing drama gets a LIVE episode
-- (aired 40 minutes ago → watch-party banner activates in-app)

insert into episodes (drama_id, number, aired_at)
select d.id, n, d.created_at + (n || ' weeks')::interval
from dramas d cross join generate_series(1, d.episodes_count) n
where d.status = 'completed'
on conflict (drama_id, number) do nothing;

insert into episodes (drama_id, number, title, aired_at)
select d.id, n,
       case n when 7 then 'The Rooftop Confession' else '' end,
       case when n = 7 then now() - interval '40 minutes'
            else now() - ((7 - n) * interval '7 days') end
from dramas d cross join generate_series(1, 7) n
where d.title = 'Starlight Serenade'
on conflict (drama_id, number) do update set aired_at = excluded.aired_at;

-- ============================ SEED: posts ============================

insert into posts (id, user_id, body, mood, episode_id, spoiler, created_at) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111101', 'Rewatching Cloy for the 5th time and the village aunties still carry the whole show. Episode 7 dinner scene = peak comfort TV 🍲', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000001' and number=7),  false, now() - interval '25 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111102', 'EPISODE 7 OF STARLIGHT SERENADE?? The rooftop scene just ended and I am NOT okay. Someone talk to me 😭😭', 'cried',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000016' and number=7),  false, now() - interval '12 minutes'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111104', 'Hot take: the second lead in Starlight Serenade was written better than the first lead and I will die on this hill 🌶️', 'hot_take', (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000016' and number=6), false, now() - interval '2 hours'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111103', 'Goblin ep 9. The field of buckwheat. You know what it did. Nine rewatch later I still sob like it''s the first time 🌾', 'cried',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000003' and number=9),  false, now() - interval '5 hours'),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111105', 'The OST dropped at EXACTLY the right moment in tonight''s episode. Music director, take my whole salary 🎶', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000016' and number=7),  false, now() - interval '8 minutes'),
  ('cccccccc-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111107', 'Business Proposal is the perfect 12-episode meal. No filler, pure rom-com nutrition. The office kiss scene still undefeated 💼', 'hype',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000004' and number=8),  false, now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111106', 'Queen of Tears finale rewatch: the hospital scene acting masterclass. Kim Soo-hyun deserved every award and more 👑', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000005' and number=16), false, now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111108', 'Started Lovely Runner from Lagos last night, ended up watching 8 episodes straight. My sleep schedule is gone and I regret nothing ⏰💜', 'hype',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000006' and number=8),  false, now() - interval '2 days'),
  ('cccccccc-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111102', 'Sunjae and Im Sol are the standard. Every other couple is just renting space in the romcom genre 🚢', 'ship',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000006' and number=12), false, now() - interval '2 days'),
  ('cccccccc-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111104', 'The Glory: nobody talks enough about how the weather in this drama is a character. That grey sky did more acting than most casts 🌫️', 'hot_take', null, false, now() - interval '3 days'),
  ('cccccccc-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111101', 'Move to Heaven episode 5 broke me open. Every object tells a story. If you haven''t watched, clear your evening and get tissues 🧡', 'cried',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000015' and number=5),  false, now() - interval '3 days'),
  ('cccccccc-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111105', 'Reply 1988 is not a drama, it is a family reunion I attend twice a year. Deok-sun''s dad apologizing scene. Every. Single. Time. 🏠', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000012' and number=18), false, now() - interval '4 days'),
  ('cccccccc-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111106', 'Alchemy of Souls: the soul-shift lore is so well written I made a 4-page timeline document. Send help (or don''t, I''m continuing) ⚔️', 'hype',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000007' and number=14), false, now() - interval '4 days'),
  ('cccccccc-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111103', 'My Demon: Song Kang falling from the sky in slow motion waspeak cinema. The contract marriage trope never gets old 🔥', 'ship',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000008' and number=4),  false, now() - interval '5 days'),
  ('cccccccc-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111107', 'Squid Game S1 rewatch before the new season: the glass bridge episode is still the most stressful 40 minutes in television history 🪟', 'hype',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000009' and number=7),  false, now() - interval '5 days'),
  ('cccccccc-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111108', 'Hotel del Luna: IU''s outfits deserved their own credits sequence. Also that pear blossom scene. Chef''s kiss 👗🌸', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000013' and number=10), false, now() - interval '6 days'),
  ('cccccccc-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111102', 'It''s Okay to Not Be Okay: ''I''m your fan'' scene. The way she says it. Kang Tae''s whole personality shift in one line 🦋', 'loved',   (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000010' and number=6),  false, now() - interval '6 days'),
  ('cccccccc-0000-0000-0000-000000000018', '11111111-1111-1111-1111-111111111101', 'Healer is the most underrated action romance EVER. Park Min-young and Ji Chang-wook chemistry should be studied in labs 🧪', 'ship',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000014' and number=11), false, now() - interval '7 days'),
  ('cccccccc-0000-0000-0000-000000000019', '11111111-1111-1111-1111-111111111104', 'Descendants of the Sun: yes the CGI earthquake aged like milk, but ''did you catch me?'' is immortal 🔫', 'hot_take', (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000011' and number=13), false, now() - interval '8 days'),
  ('cccccccc-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111105', 'Watching Starlight Serenade ep 6 and the female lead chose the CELLIST over the idol?? Best decision of 2026 television 🎻', 'hype',    (select id from episodes where drama_id='aaaaaaaa-0000-0000-0000-000000000016' and number=6),  true,  now() - interval '9 days')
on conflict (id) do nothing;

insert into post_dramas (post_id, drama_id)
select p.id, coalesce(e.drama_id, 'aaaaaaaa-0000-0000-0000-000000000002')
from posts p left join episodes e on e.id = p.episode_id
where p.id::text like 'cccccccc%'
on conflict do nothing;

-- ============================ SEED: comments / likes / follows ============================

insert into comments (post_id, user_id, body, created_at) values
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111101', 'THE ROOFTOP SCENE. I screamed. My neighbors now think I''m in a K-drama too 😭', now() - interval '9 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111105', 'That OST cue when she turned around?? Chills. Actual chills.', now() - interval '6 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111108', 'Lagos is shaking with you sis 🇳🇬😭', now() - interval '4 minutes'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111102', 'This is your hill and I brought a tent ⛺ (you''re right btw)', now() - interval '1 hour'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111106', 'Counter hot take: first lead''s silence in ep 5 was the better writing. Fight me 🌶️', now() - interval '50 minutes'),
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111103', 'The aunties are the real main characters, we all know it 😂', now() - interval '20 minutes'),
  ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111102', 'Welcome to the no-sleep club, meetings are nightly 💜', now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111101', 'The buckwheat field owns property in my heart rent free 🌾', now() - interval '4 hours')
;

insert into likes (post_id, user_id, created_at) values
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111101', now() - interval '10 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111103', now() - interval '9 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111105', now() - interval '7 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111107', now() - interval '5 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111108', now() - interval '3 minutes'),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111102', now() - interval '6 minutes'),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111104', now() - interval '4 minutes'),
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111103', now() - interval '22 minutes'),
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111106', now() - interval '18 minutes'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111102', now() - interval '1 hour'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111106', now() - interval '45 minutes'),
  ('cccccccc-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111101', now() - interval '20 hours'),
  ('cccccccc-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111102', now() - interval '22 hours'),
  ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111105', now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111101', now() - interval '2 days'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111105', now() - interval '3 hours')
on conflict do nothing;

insert into follows_users (follower_id, following_id) values
  ('11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102'),
  ('11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103'),
  ('11111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111101'),
  ('11111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111104'),
  ('11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111101'),
  ('11111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111102'),
  ('11111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111101'),
  ('11111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111104'),
  ('11111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111102'),
  ('11111111-1111-1111-1111-111111111108', '11111111-1111-1111-1111-111111111101'),
  ('11111111-1111-1111-1111-111111111108', '11111111-1111-1111-1111-111111111102')
on conflict do nothing;

insert into follows_dramas (user_id, drama_id)
select u.id::uuid, d.id
from (values ('11111111-1111-1111-1111-111111111101'),('11111111-1111-1111-1111-111111111102'),
             ('11111111-1111-1111-1111-111111111103'),('11111111-1111-1111-1111-111111111105'),
             ('11111111-1111-1111-1111-111111111108')) u(id)
cross join dramas d
where d.title in ('Crash Landing on You','Starlight Serenade','Goblin')
on conflict do nothing;

insert into saves (post_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111102'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111101')
on conflict do nothing;

-- notification feed for Mina (1101) so the tab isn't empty on demo login
insert into notifications (user_id, actor_id, type, post_id, read, created_at)
select '11111111-1111-1111-1111-111111111101', l.user_id, 'like', l.post_id, false, l.created_at
from likes l where l.post_id = 'cccccccc-0000-0000-0000-000000000001'
on conflict do nothing;

-- ============================ DONE ============================
-- Verify: select count(*) from dramas;   → 16
--         select count(*) from posts;     → 20+
--         select count(*) from profiles;  → 8
-- Demo logins: mina@hallyu.demo / hallyudemo123 (and 7 more)
