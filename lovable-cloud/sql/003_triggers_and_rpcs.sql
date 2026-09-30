-- =============================================================================
-- HALLYU — LOVABLE CLOUD BACKEND
-- 003_triggers_and_rpcs.sql
-- Database Triggers, Counter Maintainers, Notification Dispatch & RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auth Sign-Up Trigger → Auto-create Profile & User Preferences
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  base_handle text;
  candidate text;
  suffix integer := 0;
begin
  raw_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, 'member'), '@', 1)
  );
  base_handle := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'handle', raw_name)), '[^a-z0-9_.]', '', 'g');
  if char_length(base_handle) < 2 then
    base_handle := 'member';
  end if;
  base_handle := left(base_handle, 20);
  candidate := base_handle;

  while exists (select 1 from public.profiles where lower(handle) = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_handle, 18) || suffix::text;
  end loop;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    candidate,
    left(trim(raw_name), 32),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Counter & Notification Triggers
-- -----------------------------------------------------------------------------

-- 2A. User Follows → update followers/following counts + notify target user
create or replace function public.on_user_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following = following + 1 where id = new.follower_id;
    update public.profiles set followers = followers + 1 where id = new.target_user_id;

    insert into public.notifications (recipient_id, kind, "group", actor_ids)
    values (new.target_user_id, 'follow', 'social', array[new.follower_id]);
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set following = greatest(0, following - 1) where id = old.follower_id;
    update public.profiles set followers = greatest(0, followers - 1) where id = old.target_user_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_user_follows on public.user_follows;
create trigger trg_user_follows
  after insert or delete on public.user_follows
  for each row execute function public.on_user_follow_change();

-- 2B. Drama Follows → update drama follower_count
create or replace function public.on_drama_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.dramas set follower_count = follower_count + 1 where id = new.drama_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.dramas set follower_count = greatest(0, follower_count - 1) where id = old.drama_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_drama_follows on public.drama_follows;
create trigger trg_drama_follows
  after insert or delete on public.drama_follows
  for each row execute function public.on_drama_follow_change();

-- 2C. Actor Follows → update actor follower_count
create or replace function public.on_actor_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.actors set follower_count = follower_count + 1 where id = new.actor_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.actors set follower_count = greatest(0, follower_count - 1) where id = old.actor_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_actor_follows on public.actor_follows;
create trigger trg_actor_follows
  after insert or delete on public.actor_follows
  for each row execute function public.on_actor_follow_change();

-- 2D. Collection Follows → update collection follower_count + notify owner
create or replace function public.on_collection_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.collections
    set follower_count = follower_count + 1
    where id = new.collection_id
    returning owner_id into v_owner;

    if v_owner is not null and v_owner <> new.user_id then
      insert into public.notifications (recipient_id, kind, "group", actor_ids, collection_id)
      values (v_owner, 'collection_saved', 'social', array[new.user_id], new.collection_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.collections
    set follower_count = greatest(0, follower_count - 1)
    where id = old.collection_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_collection_follows on public.collection_follows;
create trigger trg_collection_follows
  after insert or delete on public.collection_follows
  for each row execute function public.on_collection_follow_change();

-- 2E. Saved Posts → update post save_count
create or replace function public.on_saved_post_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set save_count = greatest(0, save_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_saved_posts on public.saved_posts;
create trigger trg_saved_posts
  after insert or delete on public.saved_posts
  for each row execute function public.on_saved_post_change();

-- 2F. Post Reactions → recompute JSONB reactions on post + notify author
create or replace function public.recompute_post_reactions(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  select jsonb_build_object(
    'loved', count(*) filter (where kind = 'loved'),
    'cried', count(*) filter (where kind = 'cried'),
    'screamed', count(*) filter (where kind = 'screamed'),
    'swooned', count(*) filter (where kind = 'swooned'),
    'laughed', count(*) filter (where kind = 'laughed'),
    'furious', count(*) filter (where kind = 'furious')
  )
  into v_counts
  from public.post_reactions
  where post_id = p_post_id;

  update public.posts
  set reactions = coalesce(v_counts, '{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb)
  where id = p_post_id;
end;
$$;

create or replace function public.on_post_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    perform public.recompute_post_reactions(new.post_id);
    if tg_op = 'INSERT' then
      select author_id into v_author from public.posts where id = new.post_id;
      if v_author is not null and v_author <> new.user_id then
        insert into public.notifications (recipient_id, kind, "group", actor_ids, post_id)
        values (v_author, 'reaction', 'social', array[new.user_id], new.post_id);
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.recompute_post_reactions(old.post_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_reactions on public.post_reactions;
create trigger trg_post_reactions
  after insert or update or delete on public.post_reactions
  for each row execute function public.on_post_reaction_change();

-- 2G. Comment Reactions → recompute JSONB reactions on comment
create or replace function public.recompute_comment_reactions(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  select jsonb_build_object(
    'loved', count(*) filter (where kind = 'loved'),
    'cried', count(*) filter (where kind = 'cried'),
    'screamed', count(*) filter (where kind = 'screamed'),
    'swooned', count(*) filter (where kind = 'swooned'),
    'laughed', count(*) filter (where kind = 'laughed'),
    'furious', count(*) filter (where kind = 'furious')
  )
  into v_counts
  from public.comment_reactions
  where comment_id = p_comment_id;

  update public.comments
  set reactions = coalesce(v_counts, '{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb)
  where id = p_comment_id;
end;
$$;

create or replace function public.on_comment_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    perform public.recompute_comment_reactions(new.comment_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.recompute_comment_reactions(old.comment_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_reactions on public.comment_reactions;
create trigger trg_comment_reactions
  after insert or update or delete on public.comment_reactions
  for each row execute function public.on_comment_reaction_change();

-- 2H. Comments → update post comment_count + notify OP / reply target
create or replace function public.on_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
begin
  if tg_op = 'INSERT' then
    if new.state = 'active' then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id
      returning author_id into v_post_author;

      if new.reply_to_user_id is not null and new.reply_to_user_id <> new.author_id then
        insert into public.notifications (recipient_id, kind, "group", actor_ids, post_id, comment_id)
        values (new.reply_to_user_id, 'reply', 'mentions', array[new.author_id], new.post_id, new.id);
      elsif v_post_author is not null and v_post_author <> new.author_id then
        insert into public.notifications (recipient_id, kind, "group", actor_ids, post_id, comment_id)
        values (v_post_author, 'comment', 'social', array[new.author_id], new.post_id, new.id);
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.state = 'active' and new.state <> 'active' then
      update public.posts set comment_count = greatest(0, comment_count - 1) where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.state = 'active' then
      update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comments on public.comments;
create trigger trg_comments
  after insert or update or delete on public.comments
  for each row execute function public.on_comment_change();

-- -----------------------------------------------------------------------------
-- 3. RPC Functions for Hallyu Sync Engine (pull & push)
-- -----------------------------------------------------------------------------

-- 3A. Pull complete viewer state (/me)
create or replace function public.pull_me_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_prefs jsonb;
  v_follows jsonb;
  v_drama_notify jsonb;
  v_watchlist jsonb;
  v_reactions jsonb;
  v_saves jsonb;
  v_blocks jsonb;
  v_muted_users jsonb;
  v_muted_dramas jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select to_jsonb(p.*) into v_profile from public.profiles p where p.id = v_uid;
  select to_jsonb(up.*) into v_prefs from public.user_preferences up where up.user_id = v_uid;

  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(target_user_id) from public.user_follows where follower_id = v_uid), '[]'::jsonb),
    'dramas', coalesce((select jsonb_agg(drama_id) from public.drama_follows where user_id = v_uid), '[]'::jsonb),
    'actors', coalesce((select jsonb_agg(actor_id) from public.actor_follows where user_id = v_uid), '[]'::jsonb),
    'collections', coalesce((select jsonb_agg(collection_id) from public.collection_follows where user_id = v_uid), '[]'::jsonb)
  ) into v_follows;

  select coalesce(jsonb_object_agg(drama_id, notify_episodes), '{}'::jsonb)
  into v_drama_notify
  from public.drama_follows
  where user_id = v_uid;

  select coalesce(
    jsonb_object_agg(
      drama_id,
      jsonb_build_object(
        'dramaId', drama_id,
        'status', status,
        'season', season,
        'currentEpisode', current_episode,
        'rating', rating,
        'note', note,
        'startedAt', started_at,
        'completedAt', completed_at,
        'updatedAt', updated_at
      )
    ),
    '{}'::jsonb
  )
  into v_watchlist
  from public.watchlist_items
  where user_id = v_uid;

  select coalesce(jsonb_object_agg(target_id, kind), '{}'::jsonb)
  into v_reactions
  from (
    select post_id::text as target_id, kind from public.post_reactions where user_id = v_uid
    union all
    select comment_id::text as target_id, kind from public.comment_reactions where user_id = v_uid
  ) r;

  select coalesce(jsonb_agg(post_id order by created_at asc), '[]'::jsonb)
  into v_saves
  from public.saved_posts
  where user_id = v_uid;

  select coalesce(jsonb_agg(blocked_user_id), '[]'::jsonb) into v_blocks from public.user_blocks where user_id = v_uid;
  select coalesce(jsonb_agg(muted_user_id), '[]'::jsonb) into v_muted_users from public.user_mutes where user_id = v_uid;
  select coalesce(jsonb_agg(drama_id), '[]'::jsonb) into v_muted_dramas from public.drama_mutes where user_id = v_uid;

  return jsonb_build_object(
    'authenticated', true,
    'profile', v_profile,
    'prefs', v_prefs,
    'follows', v_follows,
    'dramaNotify', v_drama_notify,
    'watchlist', v_watchlist,
    'reactions', v_reactions,
    'saves', v_saves,
    'blockedUsers', v_blocks,
    'mutedUsers', v_muted_users,
    'mutedDramas', v_muted_dramas
  );
end;
$$;

-- 3B. Toggle reaction on a Post or Comment (idempotent)
create or replace function public.toggle_reaction(
  p_target_id uuid,
  p_kind public.reaction_kind default null,
  p_is_comment boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_is_comment then
    if p_kind is null then
      delete from public.comment_reactions where user_id = v_uid and comment_id = p_target_id;
    else
      insert into public.comment_reactions (user_id, comment_id, kind)
      values (v_uid, p_target_id, p_kind)
      on conflict (user_id, comment_id) do update set kind = excluded.kind, created_at = now();
    end if;
  else
    if p_kind is null then
      delete from public.post_reactions where user_id = v_uid and post_id = p_target_id;
    else
      insert into public.post_reactions (user_id, post_id, kind)
      values (v_uid, p_target_id, p_kind)
      on conflict (user_id, post_id) do update set kind = excluded.kind, created_at = now();
    end if;
  end if;
end;
$$;

-- 3C. Upsert or remove Watchlist item (supports status, episode progress & private notes)
create or replace function public.upsert_watchlist(
  p_drama_id text,
  p_status public.watch_status default null,
  p_season integer default null,
  p_episode integer default null,
  p_note text default null,
  p_clear_status boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_clear_status then
    delete from public.watchlist_items where user_id = v_uid and drama_id = p_drama_id;
    return;
  end if;

  insert into public.watchlist_items (
    user_id,
    drama_id,
    status,
    season,
    current_episode,
    note,
    started_at,
    completed_at,
    updated_at
  )
  values (
    v_uid,
    p_drama_id,
    coalesce(p_status, 'watching'),
    coalesce(p_season, 1),
    coalesce(p_episode, 0),
    p_note,
    case when coalesce(p_status, 'watching') = 'watching' then now() else null end,
    case when p_status = 'completed' then now() else null end,
    now()
  )
  on conflict (user_id, drama_id) do update set
    status = coalesce(p_status, watchlist_items.status),
    season = coalesce(p_season, watchlist_items.season),
    current_episode = coalesce(p_episode, watchlist_items.current_episode),
    note = case when p_note is not null then nullif(trim(p_note), '') else watchlist_items.note end,
    started_at = coalesce(watchlist_items.started_at, case when coalesce(p_status, watchlist_items.status) = 'watching' then now() else null end),
    completed_at = case when coalesce(p_status, watchlist_items.status) = 'completed' then coalesce(watchlist_items.completed_at, now()) else watchlist_items.completed_at end,
    updated_at = now();
end;
$$;

-- 3D. Mark notifications read
create or replace function public.mark_notifications_read(
  p_notification_id uuid default null,
  p_group text default 'all'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  if p_notification_id is not null then
    update public.notifications set read = true where id = p_notification_id and recipient_id = v_uid;
  elsif p_group = 'all' or p_group is null then
    update public.notifications set read = true where recipient_id = v_uid and read = false;
  else
    update public.notifications
    set read = true
    where recipient_id = v_uid
      and "group" = p_group::public.notification_group
      and read = false;
  end if;
end;
$$;

-- 3E. GDPR / Account Data Export
create or replace function public.export_my_account_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'state', public.pull_me_state(),
    'posts', coalesce((select jsonb_agg(to_jsonb(p.*)) from public.posts p where p.author_id = v_uid), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(c.*)) from public.comments c where c.author_id = v_uid), '[]'::jsonb),
    'collections', coalesce((select jsonb_agg(to_jsonb(col.*)) from public.collections col where col.owner_id = v_uid), '[]'::jsonb)
  );
end;
$$;
