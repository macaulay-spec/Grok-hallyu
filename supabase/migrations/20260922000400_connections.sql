-- Migration 20260922000400 (connections): real follower/following lists for profile pages.
-- The api.follows view is readable only to the follower themselves (RLS), so the list is exposed
-- through a SECURITY DEFINER RPC that mirrors what is publicly visible: profiles who follow the user
-- (followers) and profiles the user follows (following), minus private accounts on the other side.

create or replace function api.connections_page(p_handle text, p_tab text default 'followers', p_before timestamptz default now(), p_limit int default 30)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid), tgt as (
    select id from public.profiles where handle = lower(p_handle) and state <> 'deleted'
  ),
  src as (
    select case p_tab when 'followers' then f.follower_id else f.target_id::uuid end as person_id, f.created_at
    from public.follows f, tgt
    where f.target_type = 'user' and (case p_tab when 'followers' then f.target_id else f.follower_id::text end) = (select id::text from tgt)
  ),
  page as (
    select s.person_id, s.created_at
    from src s
    join public.profiles pr on pr.id = s.person_id and pr.state = 'active' and (not pr.is_private or pr.id = (select uid from v))
    where (s.created_at, s.person_id) < (p_before, coalesce((select uid from v), '00000000-0000-0000-0000-000000000000'::uuid))
    order by s.created_at desc, s.person_id desc
    limit least(p_limit, 60)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'handle', pr.handle, 'displayName', pr.display_name, 'avatarKey', pr.avatar_key, 'verified', pr.verified,
    'followers', pr.follower_count, 'followedAt', p.created_at
  ) order by p.created_at desc, p.person_id desc), '[]'::jsonb)
  from page p join public.profiles pr on pr.id = p.person_id
$$;

grant execute on function api.connections_page(text, text, timestamptz, int) to anon, authenticated;
