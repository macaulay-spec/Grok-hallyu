-- ============================================================
-- Hallyu – Supabase Schema (Free tier ready)
-- Run this in the Supabase SQL editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Dramas
create table public.dramas (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  original_title text,
  poster_url text,
  year int,
  genres text[],
  synopsis text,
  cast_text text,
  episode_count int,
  created_at timestamptz default now()
);

-- Posts
create table public.posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  media_urls text[],
  media_type text check (media_type in ('image', 'video', 'none')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Post ↔ Drama many-to-many
create table public.post_dramas (
  post_id uuid references public.posts(id) on delete cascade,
  drama_id uuid references public.dramas(id) on delete cascade,
  primary key (post_id, drama_id)
);

-- Comments
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Likes
create table public.likes (
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

-- Saves
create table public.saves (
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

-- Follows users
create table public.follows_users (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

-- Follows dramas
create table public.follows_dramas (
  user_id uuid references public.profiles(id) on delete cascade,
  drama_id uuid references public.dramas(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, drama_id)
);

-- Notifications
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null,
  post_id uuid references public.posts(id),
  drama_id uuid references public.dramas(id),
  read boolean default false,
  created_at timestamptz default now()
);

-- Reports
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('post', 'user')),
  target_id uuid not null,
  reason text,
  created_at timestamptz default now()
);

-- Indexes
create index on public.posts (user_id, created_at desc);
create index on public.comments (post_id, created_at);
create index on public.likes (post_id);
create index on public.notifications (user_id, read, created_at desc);
create index on public.post_dramas (drama_id);
create index on public.follows_dramas (drama_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage buckets (run in dashboard or via API)
-- avatars (public)
-- posts (public)
