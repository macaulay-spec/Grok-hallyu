# Hallyu backend

The Hallyu backend is defined, end to end, by the source in `supabase/`. There is no dashboard step
anywhere: every table, index, constraint, trigger, function, RLS policy and the storage bucket are
created by an ordered migration that replays on a fresh Supabase project.

The backend is **not connected**. There is no credential in this repository, the app still runs
device-local, and connecting it is the next phase. See
[docs/BACKEND-CREDENTIALS.md](BACKEND-CREDENTIALS.md) for the credential map and the connection
sequence, and [docs/BACKEND-CONNECTION-CONTRACT.md](BACKEND-CONNECTION-CONTRACT.md) for what the
client will consume once the project exists.

## Layout

```
supabase/
├── config.toml                     project configuration for `supabase start` / `db reset`
├── migrations/                     23 ordered migrations — the schema, applied in filename order
├── seed.sql                        reference rows only (4 worlds, 1 provider, 4 official rooms)
├── functions/
│   ├── _shared/                    CORS + service-role client + the service-role guard
│   ├── purge-deleted-accounts/     retention: hard-deletes tombstoned accounts and their objects
│   └── moderation-digest/          groups open reports into one decision per target
└── types/database.ts               the typed contract (tables, rows, inserts, updates, RPCs, enums)
```

## Migrations, in order

| # | File | What it creates |
| --- | --- | --- |
| 00 | `20260101120000_00_foundation.sql` | `pgcrypto`/`citext`/`pg_trgm`, `set_updated_at()`, `is_moderator()` |
| 01 | `20260101120100_01_reference.sql` | `visibility` enum, `worlds`, `providers` |
| 02 | `20260101120200_02_entertainment_catalog.sql` | `people`, `titles` (+ generated `search_document`), `title_people`, `title_episodes` |
| 03 | `20260101120300_03_profiles.sql` | `profiles`, handle generation, the `auth.users` → profile trigger |
| 04 | `20260101120400_04_user_preferences.sql` | `user_preferences` (one row per member), `title_alerts` |
| 05 | `20260101120500_05_collections.sql` | `collections`, `collection_items` |
| 06 | `20260101120600_06_social_graph.sql` | `follows`, `title_follows`, `person_follows`, `collection_follows`, `blocks`, `mutes` |
| 07 | `20260101120700_07_communities.sql` | `communities`, `community_members` |
| 08 | `20260101120800_08_posts.sql` | `posts`, `post_media` |
| 09 | `20260101120900_09_comments.sql` | `comments` (one level of threading) |
| 10 | `20260101121000_10_reactions.sql` | `reactions` + per-kind counters |
| 11 | `20260101121100_11_saves.sql` | `saves` |
| 12 | `20260101121200_12_watchlist.sql` | `watchlist_items` |
| 13 | `20260101121300_13_notifications.sql` | `notifications` |
| 14 | `20260101121400_14_push_tokens.sql` | `push_tokens` |
| 15 | `20260101121500_15_moderation.sql` | `reports` |
| 16 | `20260101121600_16_analytics.sql` | `analytics_events` (monthly partitions), `ensure_event_partition()` |
| 17 | `20260101121700_17_storage.sql` | the private `media` bucket and its policies |
| 18 | `20260101121800_18_notification_triggers.sql` | notification generation for follow/comment/reply/reaction/collection/moderation |
| 19 | `20260101121900_19_functions_social.sql` | `toggle_reaction`, `toggle_save`, `set_follow`, `set_block`, `set_mute`, `mark_notifications_read`, `register_push_token`, `report_content` |
| 20 | `20260101122000_20_functions_account.sql` | `merge_preferences`, `complete_onboarding`, `upsert_watchlist_item`, `handle_is_available`, `get_bootstrap`, `delete_account` |
| 21 | `20260101122100_21_functions_catalog_feed.sql` | `feed_posts`, `search_titles`, `record_event` |
| 22 | `20260101122200_22_retention.sql` | `purge_deleted_accounts()` + the documented `pg_cron` wiring |

## Design decisions worth knowing

- **Four edge tables, not one polymorphic `follows`.** A member follows a member, a title, a person
  or a collection. Separate tables mean four real foreign keys, so the database itself refuses a
  follow of something that does not exist.
- **The catalog is a cache, not a mirror.** `titles` and `people` are keyed by
  `(provider_id, external_id, media_type)` and hold only what a hub needs to render. Adding a second
  provider means inserting a row in `providers` — no schema change. TMDB is never re-fetched from the
  database itself.
- **Counters are owned by triggers.** `posts.loved_count`, `comment_count`, `save_count`,
  `profiles.follower_count`, `collections.item_count` and the rest are maintained by `AFTER`
  triggers, so no client can write a count, and a delete always decrements.
- **Notifications are written by the database.** There is no client `INSERT` grant on
  `notifications`; the only writers are the trigger functions in migration 18, which honour the
  recipient's preferences and never notify across a block.
- **No arbitrary SQL.** Every function is `SECURITY DEFINER` with `set search_path = public,
  pg_temp`, validates its arguments, and authenticates the caller. The only dynamic SQL in the schema
  is `ensure_event_partition()`, which quotes identifiers and literals with `%I`/`%L`.
- **Deletion is a two-step promise.** `delete_account()` scrubs the member immediately (private data
  deleted, media objects removed, profile turned into an anonymous tombstone so replies never dangle);
  `purge_deleted_accounts()` hard-deletes the tombstone after the retention window.
- **Events are partitioned and validated.** `analytics_events` is RANGE-partitioned by month with a
  default partition and a BRIN index; `record_event()` validates the event name, caps the property bag
  at 2 kB and requires either a session or an install-scoped anonymous id.

## Verification

```sh
node scripts/verify-sql.mjs        # parses all 23 migrations, checks RLS/search_path/dynamic SQL
node scripts/verify-db-types.mjs   # proves supabase/types/database.ts matches the migrations
node scripts/verify-backend.mjs    # live CRUD + RLS isolation + storage against a real project
npm run check                      # typecheck, lint, fandom checks, and both offline backend checks
```

`.github/workflows/backend-verification.yml` runs all of them on demand, on a weekly schedule, or as a
reusable workflow, reading credentials only from GitHub Secrets.