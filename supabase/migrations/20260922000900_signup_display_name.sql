-- -------------------------------------------------------------------------------------
-- Fix: honour the display name chosen at sign-up.
--
-- The client (lib/auth.tsx signUp) sends user metadata as snake_case:
--   options.data = { display_name: <typed name>, handle: <derived handle> }
-- but the original handle_new_user() trigger only looked for the camelCase
-- `displayName` / `full_name` keys. For email sign-ups neither key is present, so the
-- profile's display_name silently fell back to the handle-derived base and the name the
-- member typed was dropped.
--
-- This recreates the trigger function to read `display_name` first (client convention),
-- while keeping `displayName` / `full_name` as fallbacks for other identity providers
-- (e.g. Google, which supplies full_name). Idempotent: safe to run on an existing DB.
-- -------------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 14);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) or exists (select 1 from public.reserved_handles where handle = candidate) loop
    n := n + 1; candidate := base || '_' || substr(md5(new.id::text || n::text), 1, 4);
  end loop;
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    candidate,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'displayName', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      base
    ), 40)
  );
  return new;
end $$;
