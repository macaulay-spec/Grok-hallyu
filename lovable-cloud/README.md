# Hallyu — Lovable Cloud Backend

This directory contains the complete, clean-slate **Lovable Cloud** backend for Hallyu across all 4 fandom worlds (**K-Dramas, C-Dramas, Anime, and Hollywood**).

## Directory Structure

- `LOVABLE_PROMPT.md` — **Master Prompt**: copy and paste into Lovable to provision the entire Lovable Cloud database, RLS policies, storage buckets, RPCs, seed data, and Edge Functions.
- `sql/001_schema_and_types.sql` — PostgreSQL extensions, 13 domain enums, and 22 tables + GIN/trigram/B-tree indexes.
- `sql/002_rls_and_storage.sql` — Row-Level Security (RLS) policies on all tables + 4 Storage Buckets (`avatars`, `banners`, `post-images`, `shorts-videos`) and storage RLS policies.
- `sql/003_triggers_and_rpcs.sql` — Auth sign-up auto-profile trigger, counter & notification triggers, and RPCs (`pull_me_state`, `toggle_reaction`, `upsert_watchlist`, `mark_notifications_read`, `export_my_account_data`).
- `sql/004_seed_four_worlds.sql` — Initial 4-world catalog seed (`dramas`, `actors`, `drama_cast`) with trailers, streaming providers, and multi-season metadata.
- `functions/catalog-sync/index.ts` — Edge Function for syncing TMDB 4-world dramas, episodes, and cast.
- `functions/media-upload/index.ts` — Edge Function for minting signed upload URLs and recording media assets.
- `functions/episode-airing-cron/index.ts` — Scheduled Edge Function for dispatching `episode_live` notifications.
- `functions/delete-account/index.ts` — Edge Function for purging storage objects and deleting a user account.

## How the Frontend Connects (`lib/data/lovableBackend.ts`)

1. By default, `LOVABLE_CLOUD_URL` and `LOVABLE_CLOUD_ANON_KEY` in `constants/keys.ts` are empty (`''`), so the app runs offline-first on `demoBackend` without requiring credentials.
2. Once your Lovable Cloud project is ready, set:
   ```bash
   EXPO_PUBLIC_LOVABLE_CLOUD_URL="https://<your-project>.supabase.co"
   EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY="<your-anon-key>"
   ```
   (or paste them into `constants/keys.ts`), and `lib/data/sync.ts` automatically switches to `lovableBackend`.
