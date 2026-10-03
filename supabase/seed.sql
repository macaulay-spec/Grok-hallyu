-- Hallyu backend — seed data.
-- Reference rows only. There is no demo member, no fixture post and no fake community anywhere in
-- this repository: the app must be able to run against a database that contains nothing but these
-- four world rows and one catalog provider. `supabase db reset` replays this after the migrations,
-- and it is safe to run against a database that already has the rows.

insert into public.worlds (id, label, short_label, flag, tint, sort_order) values
  ('kdrama',    'K-Dramas',  'K-Drama',   '🇰🇷', '#FB7185', 10),
  ('cdrama',    'C-Dramas',  'C-Drama',   '🇨🇳', '#F2B84B', 20),
  ('anime',     'Anime',     'Anime',     '🇯🇵', '#60A5FA', 30),
  ('hollywood', 'Hollywood', 'Hollywood',  '🇺🇸', '#34D399', 40)
on conflict (id) do update
  set label = excluded.label,
      short_label = excluded.short_label,
      flag = excluded.flag,
      tint = excluded.tint,
      sort_order = excluded.sort_order;

insert into public.providers (id, label, base_url) values
  ('tmdb', 'TMDB', 'https://api.themoviedb.org/3')
on conflict (id) do update
  set label = excluded.label,
      base_url = excluded.base_url;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The first official room per world. Communities are product content rather than reference data,
-- so they are created here with `is_official = true` and can be edited in Studio afterwards; the
-- unique index in migration 07 keeps one official room per world.
-- ───────────────────────────────────────────────────────────────────────────��─────────────────

insert into public.communities (name, fandom, description, cover_tone, is_official) values
  ('The K-Drama room', 'kdrama', 'Sixteen episodes, one soundtrack you will never escape.', '#3B1220', true),
  ('The C-Drama room', 'cdrama', 'Wuxia, xianxia and slow-burn romance with forty-episode patience.', '#3A2A0B', true),
  ('Anime night',      'anime',  'Seasonal simulcasts, decade-old classics, immaculate fight choreography.', '#0F2A3A', true),
  ('Movie night',      'hollywood', 'The blockbuster and the awards-season slow burn.', '#0F2E24', true)
on conflict do nothing;

-- Note: `on conflict do nothing` covers the partial unique index on (fandom) where is_official,
-- so replaying the seed never duplicates a room.