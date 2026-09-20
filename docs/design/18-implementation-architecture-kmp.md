# 18 · Implementation Architecture (Kotlin Multiplatform / Jetpack Compose)

The final product is a KMP core with Jetpack Compose on Android (Compose Multiplatform-ready for iOS/desktop). This document turns the design into an engineering plan: modules, the design-system module, navigation, data, media, backend contracts, pipelines, analytics, performance budgets, QA gates and delivery phases. The Expo prototype is not extended.

## 1. Module map

```
:app-android                      Android entry, DI wiring, deep links, notifications, Play Integrity
:core:designsystem                HallyuTheme (tokens → Kotlin), all Hallyu* components, previews, semantics tests
:core:ui                          Screen scaffolds, adaptive layout helpers (WindowSizeClass, fold info), list utilities
:core:model                       Domain model (02) — pure Kotlin, serializable
:core:data                        Repositories, offline cache (SQLDelight), write queue, sync
:core:network                     Supabase client (supabase-kt: postgrest, auth, storage, realtime, functions), DTO ↔ model mappers
:core:media                       Image loading (Coil 3), upload pipeline, compression, blurhash, video trim/transcode (expect/actual)
:core:auth                        Session, Google sign-in (Credential Manager), OTP flows, AuthGate intent store
:core:spoiler                     The veil rules (02 §3) as a pure, unit-tested function library shared by every feature
:core:analytics                   Event schema + PostHog/Sentry adapters
:core:i18n                        ICU strings (moko-resources), formatters (relative time, KST/local, numbers)
:feature:auth · :feature:onboarding · :feature:home · :feature:explore · :feature:search · :feature:drama
:feature:episode · :feature:actor · :feature:post · :feature:shorts · :feature:create · :feature:watchlist
:feature:collections · :feature:activity · :feature:profile · :feature:settings
```
Features depend on `core:*` only, never on each other; cross-feature navigation goes through typed routes in `:core:navigation`.

## 2. The design-system module

- **Tokens:** `tokens/hallyu.tokens.json` (W3C DTCG) is the single source. A Gradle task (Style Dictionary or a small Kotlin generator) emits `HallyuColors`, `HallyuTypography`, `HallyuSpacing`, `HallyuShapes`, `HallyuMotion`, `HallyuSizes` as `@Immutable` objects; `LocalHallyu*` composition locals; `HallyuTheme(trueBlack: Boolean, reducedMotion: Boolean)`.
- **Typography:** Pretendard Variable bundled (`FontVariation.weight`); `HallyuText` applies Hangul rules automatically (line-height ×1.55, tracking 0 when > 40% Hangul), `tnum` via `FontFeatureSettings`.
- **Components:** one composable per component in 05 with a `state` parameter object, slots for leading/trailing, `Modifier` first-class, `semantics` built in (labels, roles, custom actions), and `@Preview`s for every state (rest/pressed/disabled/loading/error, font scale 1.3/2.0, compact/expanded).
- **Skeletons:** every list item composable ships a `*.Skeleton()` sibling with identical measurements.
- **Motion:** `HallyuMotion` exposes durations/easings/springs; `AnimatedVisibility` presets (`fadeSlideIn`, `sheetEnter`) and the `LocalReducedMotion` switch.
- **Golden tests:** Paparazzi/Roborazzi screenshots for every component × state × 2 font scales.

## 3. Navigation

- **Navigation Compose with type-safe routes** (`@Serializable` route objects): `Home`, `Explore`, `Activity`, `You`, `Drama(slug, tab?)`, `Episode(slug, season, number)`, `Actor(slug)`, `Post(id, commentId?)`, `Shorts(seedId?, scope?)`, `Collection(id)`, `Profile(handle, tab?)`, `Search(q?, type?)`, `Settings.*`, composers as `dialog`/full-screen destinations.
- **Five back stacks** via `NavHost` per tab with `saveState/restoreState`; Create is a `ModalBottomSheet` in the scaffold, not a destination.
- **Adaptive:** `NavigationSuiteScaffold` picks bar vs rail by size class; `ListDetailPaneScaffold` for list-detail screens (16 §2).
- **Deep links:** Android App Links for `https://hallyu.app/*` + `hallyu://`; synthetic back stacks per 03 §3 using `navigate(..., popUpTo)` builders in `:core:navigation`.
- **Predictive back:** enabled (`android:enableOnBackInvokedCallback="true"`), custom `PredictiveBackHandler` for sheets, composers (discard dialog) and the media viewer.
- **Edge-to-edge:** enforced (target API 36); every scaffold consumes `WindowInsets.safeDrawing`; the tab bar and composer bars pad by navigation/IME insets.

## 4. Data layer

- **Repositories** expose `Flow<Resource<T>>` with cache-first semantics: emit cached → fetch → emit fresh. Feeds use Paging 3 (`RemoteMediator`) backed by SQLDelight tables so scroll position and offline reading survive process death.
- **Cache policy:** feeds (last 100 items, 24h), entity pages (24h), images (Coil disk 512 MB, memory 25% of heap), Shorts (no disk cache except cover; Media3 `SimpleCache` 200 MB when "Preload on Wi-Fi").
- **Write queue:** `outbox` table with idempotency keys; reactions/saves/follows/progress/comments/posts enqueue → optimistic UI → `WorkManager` sync with exponential backoff; conflict rules per 14 §2; per-item failure states surface to the UI.
- **Realtime:** Supabase Realtime channels only for: episode rooms (new post count → NewPostsPill), Activity badge, ingestion completion for stubs. Everything else is pull.
- **Spoiler evaluation:** `:core:spoiler` `Veil.evaluate(post, progress, settings)` runs on the client for instant results; the feed RPCs also compute `veiled` so ranking can down-weight.
- **Auth:** supabase-kt Auth with secure storage; Google via Credential Manager → `signInWithIdToken`; OTP for email verification/reset; session refresh in a foreground-aware coroutine; AuthGate stores a pending `Intent` (sealed class) and replays it after auth.
- **Settings:** DataStore (local, immediate) mirrored to `profiles.settings` JSON (sync).

## 5. Backend contract (Supabase) — delta from the existing SQL

Keep from `supabase/migrations/…_init.sql`: profiles, dramas, episodes, posts, post_dramas, comments, likes → **replace with `reactions`**, saves, follows_users/follows_dramas → **replace with `follows`**, notifications, reports, triggers pattern, storage buckets, RLS style. Remove the fictional seed and the `moods` vocabulary (replaced by reactions).

Add / change:
- `seasons`; `episodes.season_number`, `air_date_kst`, `runtime`, `still_url`, `synopsis`, `posts_count`, `reaction_meter jsonb`.
- `dramas`: `slug`, `original_title`, `alt_titles[]`, `type`, `network`, `platforms jsonb`, `tags[]`, `backdrop_url`, `logo_url`, `airing_days[]`, `airing_time_kst`, `next_episode_at`, `fan_score`, `recommend_pct`, `ingest_state`, `provider_refs jsonb`, counts.
- `actors`, `cast_credits(drama_id, actor_id, character, ord)`, `crew_credits`.
- `posts`: `type`, `title`, `context jsonb {dramaId, season, episode, actorIds[], secondaryDramaId}`, `spoiler jsonb {level, season, episode}`, `reaction`, `rating`, `tags[]`, `discussion_kind`, `media jsonb[]`, `state`, `pinned_comment_id`, `edited_at`, `hashtags[]`, `mentions[]`.
- `comments.parent_id`, `comment_likes`.
- `reactions(post_id, user_id, kind)`; `episode_reactions` view for the meter.
- `follows(follower_id, target_type, target_id, notify)`.
- `watchlist(user_id, drama_id, status, season, current_episode, note, started_at, completed_at)`.
- `collections`, `collection_items`, `collection_saves`.
- `blocks`, `mutes(user_id, target_type, target_id)`, `muted_words`, `hidden_posts`.
- `push_tokens`, `notification_prefs` (in profiles.settings), `catalog_requests`, `edit_suggestions`, `drafts` (optional server sync v1.5).
- RPCs: `feed_for_you(cursor)`, `feed_following(cursor, sources[])`, `episode_room(episode_id, sort, cursor)`, `drama_community(drama_id, filters, cursor)`, `search(q, type)`, `suggested_people()`, `trending_dramas()`, `trending_conversations()`, `set_progress(drama_id, season, episode)`, `react(post_id, kind)`, `delete_account()` (Edge Function).
- Triggers: notifications (grouping via `group_key` upsert), counts, auto-hide at 3 distinct reports, `posts_count` per episode, veil-independent `reaction_meter` refresh.
- Edge Functions: `ingest-drama`, `ingest-actor`, `sync-airing` (cron nightly), `send-push` (DB webhook → FCM via Expo-free HTTP v1 API), `episode-alerts` (cron every 10 min: episodes with `air_date ≤ now` and not yet notified), `delete-account`, `report-triage`.
- RLS: public read for catalog and active content; owner-only writes; blocks enforced in RPCs; hidden/removed content readable only by owner/moderators.

## 6. Media pipeline

- **Images (user):** Android Photo Picker → `:core:media` resize (long edge 1,600px, JPEG q 0.82, EXIF stripped, blurhash computed, dominant colour) → Supabase Storage `user-media/{uid}/{uuid}.jpg` → media JSON stored on the post. Display via Coil 3 with `crossfade(200)` and blurhash placeholder painter.
- **Catalog images:** ingestion copies provider images to `catalog/{dramaId}/poster-{size}.jpg` / `backdrop-{size}.jpg` on Hallyu's storage/CDN so the app never hits provider hosts; sizes w342/w500/w780/w1280.
- **Video (Shorts, v2.0):** picker → Media3 Transformer trim + transcode to 720p H.264 ≤ 4 Mbps, AAC → upload with resumable TUS (Supabase) → server `processing` → (later) HLS via a transcoding worker; cover frame extracted client-side. Playback via Media3 ExoPlayer with a `PreloadManager` for next 1–3 items; captions as WebVTT.
- **Share cards:** rendered client-side from a Compose layout (`ComposeView` → bitmap) using the spec in 04 §1.4.

## 7. Catalog ingestion (provider abstraction)

`:backend:ingestion` (Edge Functions, TypeScript or Deno) implements `CatalogProvider` with one adapter today (`TmdbProvider`): `searchSeries(q)`, `getSeries(id)`, `getSeason(id, n)`, `getPerson(id)`, `getImages(id)`, `getWatchProviders(id, region)`. Mapping per 02 §7. Scheduling: nightly `sync-airing`, weekly top-500 refresh, on-demand imports (rate-limited per user), actor enrichment on first open. All provider calls server-side; the API key never ships in the app.

## 8. Trust, safety & moderation pipeline
- Client: report sheet → `reports` insert; block/mute → local filter + server; word filter for handles/display names; link posting disabled for accounts < 24h.
- Server: auto-hide at 3 distinct reports (`state = hidden`), `report-triage` Edge Function summarises for the moderator inbox (Supabase table + simple web view), decisions: restore / remove / suspend; notifications to reporter/author via System category; appeal link in the author's banner.
- DMCA: web form → ticket; removals recorded with `removed_reason = copyright`.
- Play compliance checklist (must be green before any store submission): Terms acceptance before UGC ✔ · report content & users ✔ · block users ✔ · in-app + web account deletion ✔ · Data safety form ✔ · target API 36 ✔ · notification permission rationale ✔.

## 9. Notifications
FCM (HTTP v1) from `send-push`; channels on Android: `episodes` (high importance, sound), `social` (default), `highlights` (low), `system` (default). Payload carries the deep link; tapping builds the synthetic stack. Grouping: Android notification groups per category with summary text matching Activity's grouped copy. Token refresh via `push_tokens` upsert.

## 10. Analytics (PostHog) & observability (Sentry)

Event schema (snake_case, properties in braces):
`app_open{source}` · `onboarding_step{step, selections}` · `onboarding_complete` · `auth{method, outcome}` · `guest_gate{action}` · `feed_view{tab}` · `card_impression{type, source, reason}` · `card_open{type}` · `react{kind, surface}` · `comment{reply}` · `save` · `share{format}` · `follow{target_type}` · `watch_status{status, from}` · `progress_set{delta}` · `veil_impression{level}` · `veil_reveal{level, method}` · `episode_gate{answer}` · `room_enter{live}` · `search{type, results}` · `provider_import{outcome}` · `compose_open{type}` · `compose_publish{type, has_media, has_episode, spoiler}` · `compose_abandon{type, saved_draft}` · `collection_create` · `collection_save` · `notification_open{category, type}` · `settings_change{key}` · `report{reason}` · `block` · `error_shown{code, screen}`.
No PII in properties; user id is the Hallyu id; analytics can be disabled in Settings.

## 11. Performance budgets
| Metric | Budget |
|---|---|
| Cold start to first Home frame (cached) | ≤ 1.2s on a mid-range device (e.g. Snapdragon 6-series) |
| Cold start to fresh feed | ≤ 2.5s on 4G |
| Feed scroll | 60fps; ≤ 1% janky frames on a 1,000-item feed |
| Image decode | posters ≤ 30ms; no full-size decodes in lists |
| Shorts start | ≤ 500ms to first frame when preloaded; ≤ 1.5s cold |
| APK size | ≤ 45 MB (R8 full mode, resource shrinking, one font family, no bundled videos) |
| Memory | ≤ 250 MB in feed; ≤ 400 MB in Shorts |
| Battery | no wakeups outside WorkManager; realtime channels closed in background |
| Offline | Home, Watchlist, Saved, Drafts, visited pages readable |
Baseline Profiles generated for startup + feed scroll; Macrobenchmark in CI on a Pixel-class emulator.

## 12. Quality gates
- Unit: spoiler rules (table-driven, 100% branch coverage), formatters (KST/local), grouping copy, ranking helpers, outbox conflict rules.
- UI: Compose semantics tests per component; screenshot goldens (component × state × font scale); screen-level goldens for the 12 core flows in compact and expanded.
- E2E (Maestro): sign up → onboarding → Home; react + veil reveal; episode room gate; compose post with image; watchlist +1 → finish; collection create; activity → post; settings → delete account (staging).
- Accessibility: TalkBack manual protocol (15 §3), lint for contentDescription and touch targets.
- Release: crash-free ≥ 99.5% in internal track for 7 days; performance budgets met; Play compliance checklist green.

## 13. Delivery phases (engineering)

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **P0 Foundations** | 1–3 | Module skeleton, design-system module from tokens (all components + goldens), navigation shell, adaptive scaffold, Supabase schema v2 + RLS, ingestion (TMDB adapter, top 300 + airing), CI (build, tests, goldens, release signing) | Every route reachable with mock data; catalog populated; APK installs |
| **P1 Identity** | 4–6 | Auth (email OTP, Google, recovery), guest mode + AuthGate, onboarding 1–5, profile/edit, settings root + account/notifications/content/privacy/appearance/about/delete | A stranger signs up, onboards, lands on a real Home |
| **P2 Catalog** | 7–9 | Drama Hub (all sections), Episode, Actor, Search (grouped + import), Explore, Airing schedule, Genre browse, watchlist + progress, veil engine | Any real K-drama findable, followable, trackable; veil verified by tests |
| **P3 Conversation** | 10–13 | Post/Reaction/Discussion composers, feeds (For You RPC, Following), post detail, threaded comments, reactions + meter, saves, shares, share cards, activity + push, Tonight | Two accounts converse about Ep 9; the one on Ep 6 sees the veil; push on air |
| **P4 Curation & safety** | 14–16 | Collections (all), Saved, report/block/mute/hidden, moderation inbox, offline queue, all empty/error/offline states, first-run overlays, a11y pass, perf pass | Play compliance green; budgets met; TalkBack protocol passed |
| **P5 v1.0 launch** | 17–18 | Editorial prompts per airing episode, legal pages, internal → closed testing → production | v1.0 |
| **v1.5** | +6 | Review & Recommendation composers, fan verdict, hashtags/mentions autocomplete, drafts sync, Korean UI, per-drama reminders | |
| **v2.0** | +10 | Shorts end-to-end (creator tools, viewer, feeds, processing), Media tab Shorts, profile Shorts tab | |

## 14. Security & privacy notes
Anon key only in the client (RLS is the boundary); Play Integrity on sensitive writes (optional); secure storage for sessions; no provider keys in the app; media URLs public-read but unguessable; account deletion purges storage; analytics opt-out honoured; logs scrubbed of tokens/emails.

## 15. What engineers should *not* need to ask
- Colours/type/spacing: tokens file. Component behaviour: 05. Any screen's states: 07–13 + 14. Copy: 04 §7 + 14 §4. Navigation results: 03 §5. Spoiler behaviour: 02 §3 (+ unit tests). Adaptive rules: 16. Motion: 06. Accessibility: 15. Analytics names: §10 here.
If something is genuinely missing, add it to this document set in the same format rather than deciding in code.
