# 01 — Codebase audit (sections 2–3 of the brief)

Audited at commit `47daaae` on 2026‑09‑21 by reading the code (not the older design docs). 140 TS/TSX files, ≈18.2K lines under `app/`, `components/`, `lib/`, `constants/`.

## 2.1 Stack and framework

| Item | Fact | Backend consequence |
|---|---|---|
| Framework | Expo SDK 51, React Native 0.74.5, React 18.2, expo‑router ~3.5 (file routes), TypeScript 5.3 `strict` | Any backend SDK must be SDK‑51 compatible; use `@supabase/supabase-js` (already a dep, pure JS) and `fetch`; avoid native modules unless SDK‑51 builds exist. |
| Platforms | Android (CI builds release APK), web export used for preview, iOS not built in CI | Sign in with Apple only when iOS ships; Google OAuth already done via `expo-web-browser` PKCE. |
| State | Custom zustand store `lib/store.tsx` (`AppState` slices, `Action` union, pure `reducer`), persisted to AsyncStorage; hydration flag `state.hydrated` | Server data must be *projected* into the same slices; the reducer stays the single writer. |
| Sync | `lib/data/sync.ts`: outbox of `Mutation {id, action, undo, label, key, attempts, status}` with coalescing keys, exponential backoff, `setBackend()` hook, `refresh(scope)` = `backend.pull(scope) + syncSeedCatalog() + flush()` | **This is the integration point.** A `SupabaseBackend` implements `push(mutation)` (one action → one RPC/insert) and `pull(scope)` (server → store projection). Nothing above this file changes. |
| Backend seam | `lib/data/backend.ts`: `interface Backend { name; push(mutation, signal); pull(scope: 'home'|'explore'|'activity'|'drama'|'profile', signal) }`, `BackendError{retryable,status}`; `createLocalBackend` simulates latency/failure per `prefs.devNetwork` | Keep `BackendError` semantics: `retryable=false` → mutation dropped + undo applied; `retryable=true` → backoff. HTTP mapping: 4xx (except 408/425/429) → non‑retryable, 5xx/429/network → retryable. |
| Auth | `lib/auth.tsx` + `lib/supabase.ts` (AsyncStorage session, `autoRefreshToken`, `detectSessionInUrl:false`): `signInWithPassword`, `signUp` (email verify + `/auth/callback`), `signInWithOAuth('google', PKCE, skipBrowserRedirect)`, `exchangeCodeForSession`, `resetPasswordForEmail`, `updateUser({password})`, `resend('signup')`, `signOut`, `functions.invoke('delete-account')`; plus **guest** and **demo** modes | Supabase project `psmxekrmoltwabefgqpd` exists with Auth only. The `delete-account` Edge Function does not exist yet. Guest mode must map to *anonymous read‑only* (no anon sign‑in needed: public RLS SELECT policies). |
| Keys in client | `constants/keys.ts`: TMDB v4 read token + v3 key, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `SHOW_DEMO`; overridable by `EXPO_PUBLIC_*` | All are public‑by‑design keys. No service‑role key anywhere (verified by grep). Keep it that way. |
| Catalog | `lib/catalog.ts` + `lib/catalogSync.ts`: TMDB search/detail/season/person calls from the device; dramas keyed by slug with `provider {tmdb,id}`; `import` action merges into store | Catalog stays client‑fetched (TMDB terms allow with attribution); the **server needs a mirror table** only for FK integrity, counts, episode air‑time scheduling and server‑side search joins. Populated by an Edge Function that re‑fetches TMDB with a server key (clients cannot write catalog rows directly). |
| Media | `expo-image-picker` (images: multi‑select, quality 0.85; video: `videoMaxDuration` 60/140 s, `allowsEditing`), `expo-image` for display, `expo-av` `FeedVideo` for inline playback of raw URLs; `ImageCarousel` for ≤6 images | No upload code exists. Local `file://` URIs are stored in posts today. Needs: client resize/compress → presigned upload → `post_media` rows → CDN URLs. |
| Notifications | `expo-notifications` used only for **local scheduled** episode reminders (`lib/reminders.ts`); no push token registration; `Notification` model with groups social/drama/mentions/system and 10 kinds | Server must own notifications (table + push). Local reminders remain as offline fallback. |
| Analytics | `lib/analytics.ts`: `track(event, props)` buffer + `setAnalyticsSink()` seam | Plug PostHog sink; no server work. |
| CI | `.github/workflows/build-apk.yml`: `npm ci` → `tsc --noEmit` → `expo prebuild` → `gradlew assembleRelease` | Add a `backend.yml`: `supabase db lint`/`db push` on merge; Worker `wrangler deploy`. Must not break the APK job. |
| Deps (runtime) | async‑storage, netinfo, supabase‑js, expo‑av, expo‑image, expo‑image‑picker, expo‑notifications, expo‑router, expo‑web‑browser, zustand, url‑polyfill (+ core expo) | For media we will add **`react-native-compressor`** (video/image compression + `createVideoThumbnail`, background upload) or `expo-image-manipulator` + `expo-video-thumbnails` — decided in `05-video-and-media.md`. |

## 2.2 Data model actually used (from `lib/model.ts`)

| Entity | Fields in use | Notes for schema |
|---|---|---|
| `User` | id, handle, displayName, avatarUrl, bio(≤160), favoriteGenres, favoriteDramaIds, followers, following, joinedAt, verified, isPrivate | `isPrivate` is a flag only — no follow‑request UI exists → **not enforced server‑side in v1** (column kept). |
| `Post` | id, authorId, type ∈ {post, reaction, discussion, review, recommendation, short}, body, title(discussion ≤90), kind, rating(review 1–10), verdict(≤120), images[≤6], video{url,poster,duration}, spoiler ∈ {none, episode, season, ending}, context{dramaId, season, episode, actorIds≤3, secondaryDramaId}, hashtags[], mentions[], reactions{loved,cried,screamed,swooned,laughed,furious}, commentCount, saveCount, shareCount, createdAt, editedAt, state | Body limits: post 1000, reaction 140, discussion 5000, review 5000, recommendation 500, short caption 300. Edit window 15 min. Video: short ≤60 s, post clip ≤140 s. |
| `Comment` | id, postId, authorId, parentId (one level), replyToUserId, body(≤1000), spoiler, reactions, createdAt, state | Depth 1 enforced in DB (parent must have null parent). |
| `WatchlistItem` | dramaId, status ∈ {watching, planned, completed, dropped, paused}, season, episode, note(≤200), updatedAt, rating? | One row per (user, drama). |
| `Collection` + items | id, ownerId, title(≤60), description(≤240), visibility public/private, coverDramaId, items[{dramaId, note, addedAt}], followerCount | Public collections followable; private visible to owner only. |
| `Notification` | id, kind ∈ {reaction, comment, reply, follow, mention, episode_aired, episode_live, drama_trending, collection_saved, system}, group ∈ {social, drama, mentions, system}, actorIds[], postId?, dramaId?, episode?, read, createdAt | Grouping (collapse actors) must be done server‑side. |
| `Prefs` | notifications toggles + quietHours, spoiler protection, autoplay, mutedWords, personalization, language, termsVersion, dataSaver, devNetwork/reduceMotion/trueBlack (device‑only) | Synced as one JSONB column (`profiles.prefs`) minus device‑only keys (already excluded by `sync.plan`). |
| `Draft`, seen/reveal memory, recent searches | local only | Never leave the device. |

## 2.3 Client mutations = the write API surface (from `lib/data/sync.ts plan()`)

| Action | Coalescing key (client) | Server operation |
|---|---|---|
| `follow {kind users/dramas/actors/collections, id, on}` | `follow:kind:id` | `rpc set_follow(target_type, target_id, on)` |
| `dramaNotify {dramaId, on}` | `notify:dramaId` | `rpc set_drama_notify(drama_id, on)` |
| `watch {dramaId, status}` / `progress {dramaId, season, episode}` / `note {dramaId, note}` | `watch:dramaId` | `rpc upsert_watchlist(...)` |
| `react {target post/comment, id, kind|null}` | `react:target:id` | `rpc set_reaction(target_type, target_id, kind)` |
| `save {postId, on}` | `save:postId` | `rpc set_save(post_id, on)` |
| `addPost {post}` / `editPost {id, patch}` / `deletePost {id}` | `post:id` | `rpc create_post(payload)` (media keys must be *uploaded first*), `rpc edit_post`, `update posts set state='deleted'` |
| `addComment` / `deleteComment` | `comment:id` | `rpc create_comment`, `update comments set state='deleted'` |
| `upsertCollection` / `deleteCollection` / `collectionItem {collectionId, dramaId, on, note}` | `collection:id` | `upsert collections`, `rpc set_collection_item` |
| `profile {patch}` | `profile` | `update profiles` (handle uniqueness, reserved handles) |
| `prefs {patch}` | `prefs` | `update profiles set prefs = prefs || patch` |
| `onboarding {...}` | `onboarding` | `update profiles set onboarding = ...` |
| `block {userId, on}` / `muteUser` / `muteDrama` | `block:id` etc. | `insert/delete blocks`, `mutes` |
| `report {kind, id, reason, detail≤500}` | none (never coalesced) | `insert reports` (rate limited) |
| `readNotifications {ids?}` | `readNotifications` | `rpc mark_notifications_read(ids)` |
| `seen`, `reveal`, `draft`, `recentSearch`, `import`, `hydrate`, `replace`, `restoreKey`, `postState`, `commentState`, `seenActivity`, `removePost`, `removeComment`, `deleteDraft` | not synced | local/reducer only |

## 2.4 Reads the client needs (`pull(scope)` today is a no‑op round‑trip)

| Scope | Screens | Server read (see `08-api-spec.md`) |
|---|---|---|
| `home` | Home (For You / Following rails), Up Next, airing episodes, trending discussions, live rooms | `rpc feed_for_you(cursor)`, `rpc feed_following(cursor)`, `rpc home_rails()` (up‑next from watchlist + catalog, airing today, live rooms) |
| `explore` | Explore, Trending, Search | `rpc trending(kind)`, `rpc search_posts(q)`, `rpc search_people(q)`; dramas/actors via TMDB |
| `activity` | Activity tab (grouped notifications) | `select notifications` (RLS: own), unread count |
| `drama` | Drama page (posts by tab, fandom counts, live episode room, related) | `rpc drama_page(drama_id)`, `rpc drama_posts(drama_id, tab, cursor)`, `rpc episode_room(drama_id, season, ep)` |
| `profile` | Profile, connections, collections, saved, watchlist | `rpc profile_page(handle)`, `rpc user_posts(...)`, `select saves/watchlist/collections` |

## 3. Existing features → backend status

| Feature (as shipped in UI) | Client status | Backend today | Backend required |
|---|---|---|---|
| Sign up / sign in / Google / verify / reset / sign out | done | Supabase Auth live | custom SMTP, redirect allow‑list, profile row trigger on sign‑up, handle generation |
| Guest browse, demo mode | done | — | public SELECT policies; demo stays client‑side (`SHOW_DEMO`) |
| Onboarding (genres, favourite dramas, follows) | done | — | `profiles.onboarding`, `follows` |
| Profile edit (avatar, name, handle, bio, favourites) | done | — | `profiles` + avatar upload |
| Home For You / Following / Shorts | done, client ranking in `lib/selectors.ts` | — | server feed RPCs replicating the same scoring (see `06-architecture.md` §Feed) |
| Composer (6 post types, images ≤6, video, spoiler level, drama/episode/actor context, hashtags, mentions, drafts) | done | — | media pipeline + `create_post` validation mirroring `LIMITS` |
| Comments (1 level), reactions (6 kinds) on posts and comments, saves | done | — | tables + counters via triggers |
| Collections (public/private, follow) | done | — | tables |
| Watchlist (status, progress, note), Up Next, schedule | done | — | `watchlist_items` + catalog episodes mirror |
| Drama pages, actor pages, episode pages, live episode room (simulated ambience `LiveReactions`) | done | — | `episode_reaction_counts`, Realtime broadcast for open rooms |
| Trending dramas / discussions, recommendations | done, heuristics client‑side | — | materialised views refreshed by pg_cron |
| Search (local posts/people + TMDB) | done | — | Postgres FTS RPCs |
| Notifications (grouped), episode reminders | UI done; reminders local only | — | notification triggers, push tokens, pg_cron scheduler, Expo push dispatch |
| Report / block / mute / muted words | done | — | `reports`, `blocks`, `mutes`; muted words stay client‑side (prefs) |
| Settings (notifications, content, privacy, data, language, legal, delete account) | done; `/delete` public page | delete Edge Function missing | `delete-account` function, terms version, data export (optional) |
| Sharing / deep links `hallyu://` + `https://hallyu.app/{d,a,u,p,s,c}` | done | — | none (link previews later) |
| Offline outbox with undo + coalescing | done | simulated | real `Backend` adapter |
| Direct messages, communities/membership, admin console, payments | **not in UI** | — | **out of scope** (moderator tooling = Supabase Studio + SQL views + a role‑gated `/admin` route later) |

## 2.5 Known gaps found in the audit (must be fixed by the backend work, not the UI)

1. `lib/auth.tsx` calls `functions.invoke('delete-account')` — the function does not exist; account deletion currently only signs out.
2. Posts store `file://` URIs for media; they render only on the authoring device.
3. Switching accounts drops pending outbox mutations (documented limitation) — the adapter must key the outbox per user id.
4. Live rooms and trending are simulated from seed heuristics; the seed (`lib/seed.ts`) is only loaded when `SHOW_DEMO`/demo mode.
5. No rate limiting or abuse controls exist anywhere (client cannot be trusted for this).
6. TMDB key is public in the bundle by the owner's explicit decision; this is permitted for TMDB's read API but the server must never trust client‑supplied catalog data (hence `ensure-catalog`).
