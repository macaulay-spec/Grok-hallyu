# 02 · Content Model & Rules

This is the product's vocabulary. The UI, the API and the database use these names. Provider (TMDB) names never leak past the ingestion layer.

## 1. Entities

### 1.1 User (Profile)
| Field | Notes |
|---|---|
| `id`, `handle` (3–20, `[a-z0-9_]`, unique, 30-day change cooldown), `displayName` (1–40) | Handle is shown as `@handle` |
| `avatar` (Media), `bio` (≤ 160), `link` (one URL, optional) | No cover image in v1 (restraint) |
| `favoriteDramas` (ordered ≤ 4), `favoriteGenres` (≤ 5), `intents` (onboarding signals) | Favourites shelf on profile |
| `counts`: followers, following, posts, shorts, reviews, collections, completedDramas | Denormalised, eventually consistent |
| `settings`: spoilerProtection (`strict` \| `balanced` \| `off`), blurMedia, autoplayShorts (`always` \| `wifi` \| `never`), dataSaver, notificationPrefs, appearance (`trueBlack`), language | Synced; also cached locally |
| `state`: `active` \| `suspended` \| `deleted` | Deleted → tombstone (see §5) |
| `roles`: `member` \| `editor` (Hallyu editorial) \| `moderator` | Editor posts get a small "Hallyu" mark |
| `termsAcceptedAt`, `onboardingCompletedAt`, `createdAt` | Terms must be accepted before first create action (Play UGC requirement) |

### 1.2 Drama
| Field | Notes |
|---|---|
| `id`, `slug`, `title`, `originalTitle` (Hangul), `alternativeTitles[]` | Slug is stable for deep links |
| `type`: `series` \| `movie` | Movies allowed in catalog; UI calls both "drama" only for series |
| `year`, `status`: `upcoming` \| `airing` \| `completed` \| `cancelled` \| `hiatus` | Status drives Tonight, badges, Episode gating |
| `network`, `streamingPlatforms[]` (name, region, deep link), `country`, `language` | Watch providers require JustWatch attribution if sourced via TMDB |
| `genres[]` (Hallyu taxonomy, §6), `tags[]` (tropes: enemies-to-lovers, sageuk, time-slip…) | Tags are ops-curated + community-suggested |
| `synopsis` (spoiler-free), `contentRating` | |
| `poster`, `backdrop`, `logo` (Media) | Poster 2:3 never cropped; backdrop 16:9 |
| `seasons[]` (Season), `episodeCount`, `runtimeMinutes` | Most K-dramas: one season (UI hides the season selector) |
| `airing`: `days[]` (Mon…Sun), `timeKst` ("22:00"), `nextEpisodeAt` (UTC) | Derived from episode air dates in ingestion; ops-editable |
| `cast[]` (CastCredit: actorId, character, order), `crew[]` (director, writer) | |
| `related[]` (dramaIds with reason: same writer, same lead, same trope) | |
| `counts`: fans (followers), posts, discussions, reviews, shorts, watching, completed, wantToWatch | |
| `fanScore` (avg verdict, null until ≥ 20 reviews), `recommendPct` | Shown small; never a leaderboard |
| `providerRefs[]` ({provider:"tmdb", externalId}) | Only the ingestion layer reads these |
| `ingestState`: `stub` \| `partial` \| `full`, `lastSyncedAt` | Stub = just imported from search; UI shows "Just added" |

### 1.3 Season
`dramaId`, `number`, `name` (e.g. "Part 2" for split releases), `episodeCount`, `airStart`, `airEnd`, `poster?`, `synopsis?`.

### 1.4 Episode
| Field | Notes |
|---|---|
| `id`, `dramaId`, `seasonNumber`, `number`, `title?`, `runtimeMinutes?` | Title often absent for K-dramas → UI shows "Episode 7" |
| `airDate` (UTC instant + KST calendar date) | Both stored; UI shows local time + "KST" hint on schedule surfaces |
| `synopsis?` (spoiler by definition → veiled until watched) | |
| `still?` (Media) | Veiled by default for unwatched |
| `counts`: posts, reactions, discussions, watchedBy | |
| `reactionMeter`: {loved, cried, screamed, swooned, laughed, furious} | Aggregated from reactions scoped to the episode |
| `isLive` (derived: aired within last 24h and drama.status = airing) | Drives the Signal |

### 1.5 Actor (Person)
`id`, `slug`, `name`, `koreanName?`, `alsoKnownAs[]`, `bio?`, `birthDate?`, `profile` (Media), `knownFor[]` (dramaIds), `filmography[]` ({dramaId | externalTitle, character, year, type}), `frequentCollaborators[]` (actorIds, derived), `counts` {fans, posts, shorts}, `providerRefs[]`.

### 1.6 Post (all content types share one table/model)
| Field | Notes |
|---|---|
| `id`, `authorId`, `type`: `post` \| `reaction` \| `discussion` \| `review` \| `recommendation` \| `short` | |
| `title?` (discussion ≤ 90; review verdict line ≤ 120) | |
| `body` (post ≤ 1,000; reaction ≤ 140; discussion ≤ 5,000; review ≤ 5,000; recommendation ≤ 500; short caption ≤ 300) | Markdown-lite: line breaks, @mentions, #hashtags, links |
| `media[]` (≤ 4 images, or 1 video for short) | Media object below |
| `context`: {dramaId?, seasonNumber?, episodeNumber?, actorIds[] ≤ 3, secondaryDramaId? (recommendation "if you liked")} | The Context strip |
| `spoiler`: {level: `none` \| `episode` \| `season` \| `ending`, seasonNumber?, episodeNumber?} | §3 |
| `reaction?` (one of six; required for `reaction` type) | |
| `rating?` (1–10, review), `recommendTags[]` (review/recommendation) | |
| `discussionKind?`: `general` \| `theory` \| `ending` \| `character` \| `scene` \| `question` | Optional tag chip |
| `hashtags[]`, `mentions[]` | |
| `counts`: reactions{six}, reactionsTotal, comments, saves, shares, views (shorts) | |
| `visibility`: `public` \| `followers` (v1.5) | |
| `state`: `active` \| `hidden` (auto/moderator) \| `removed` (policy) \| `deleted` (by author) \| `processing` (video) \| `failed` | §5 |
| `pinnedCommentId?`, `editedAt?`, `createdAt` | Edit window: 15 min for body; context/spoiler editable any time |

### 1.7 Comment
`id`, `postId`, `parentId?` (one level: replies attach to a top-level comment; replying to a reply @mentions and attaches to the same parent), `authorId`, `body` (≤ 1,000), `mentions[]`, `media?` (1 image, v1.5), `counts.likes`, `counts.replies`, `isAuthor` (derived), `state` (as post).

### 1.8 Short
A `Post` with `type = short` and one video Media: `{url, hlsUrl?, durationMs (≤ 60,000), width, height, coverUrl, coverAtMs, captionsUrl?, processingState}`. Inherits context and spoiler.

### 1.9 Collection
`id`, `ownerId`, `title` (≤ 60), `description?` (≤ 300), `visibility`: `public` \| `private`, `items[]` ({dramaId, note? ≤ 140, order}), `cover` (auto mosaic of first 4 posters, or a chosen poster), `counts` {items, saves}, `updatedAt`. Collections hold dramas in v1 (posts are saved via Saved).

### 1.10 WatchlistItem
`userId`, `dramaId`, `status`: `want` \| `watching` \| `completed` \| `dropped`, `seasonNumber`, `currentEpisode` (0…episodeCount), `note?` (≤ 280, private), `startedAt?`, `completedAt?`, `updatedAt`. Uniqueness: one per (user, drama). "Rewatching" is `watching` with `rewatchCount` (v1.5).

### 1.11 Follow
`followerId`, `targetType`: `user` \| `drama` \| `actor` \| `collection`, `targetId`, `createdAt`, `notify` (per-drama episode alerts on/off).

### 1.12 Notification
`id`, `userId`, `category`: `social` \| `drama` \| `mention` \| `system`, `type` (like, reaction, comment, reply, follow, mention, episodeAired, episodeTonight, dramaTrending, collectionSaved, postHidden, accountNotice…), `actorIds[]` (people who caused it, for grouping), `target` ({type, id}), `groupKey` (e.g. `reaction:post:123`), `count`, `read`, `seen`, `createdAt`, `updatedAt`.

### 1.13 Fandom context (implicit)
Every drama and actor *is* a fandom: its followers are fans; its community feed is the posts whose context includes it. There is no separate "community" object in v1. UI copy: "Goblin fandom", "12.4k fans", "Join the fandom" is **not** used — the button says **Follow**.

### 1.14 Media
`{id, kind: image | video, url, width, height, blurhash, dominantColor, alt?, source: provider | user, license?}`. User uploads are resized client-side (images ≤ 1,600px long edge, JPEG q≈0.82, EXIF stripped; video ≤ 720p, H.264, ≤ 60s).

## 2. Relationships the UI must make walkable

```
User ── follows ──► User / Drama / Actor / Collection
User ── tracks ───► Drama (WatchlistItem: status, season, episode)
User ── owns ─────► Post / Comment / Collection
Post ── about ────► Drama [Season [Episode]] · Actor(s)
Drama ── has ─────► Season ── has ──► Episode
Drama ── cast ────► Actor (character)  ◄── filmography ── Actor
Collection ── contains ──► Drama (+ note)
Notification ── points to ──► Post / Comment / User / Episode / Collection
```

Guaranteed traversals (each is a tap): Drama → Actor → Actor's other drama → that drama's Community → Episode → Discussion → Post author → Profile → their Collections → Drama. Every entity screen ends with a "Where next" section that links outward.

## 3. The spoiler system

### 3.1 Levels
| Level | Attached to | Means | Auto-suggested when |
|---|---|---|---|
| `none` | — | Safe for anyone | No context, or author says so |
| `episode` (S, E) | drama + season + episode | Reveals events up to and including episode E of season S | An episode is attached (default = that episode) |
| `season` (S) | drama + season | Reveals the whole season | Season attached without an episode; drama attached and viewer's context says "completed season" |
| `ending` | drama | Reveals how it ends | Discussion kind = `ending`; drama status completed and author picks it |

The author can always lower the level (e.g. talk about Ep 12 without spoilers). The community can raise it: report reason *"Contains unmarked spoilers"* — 3 distinct reports auto-apply `episode` at the attached episode (or `season` if none) pending moderator review.

### 3.2 The viewer's position
`progress(drama)` = `{status, season, episode}` from WatchlistItem; `untracked` if none.

### 3.3 Veil rule (evaluated client-side for instant results, mirrored server-side for feeds)
```
veil = false
if post.spoiler.level == none: veil = false
elif viewer.progress.status in {completed, dropped}: veil = false           // dropped: they chose not to care
elif viewer.progress.status == watching:
     episode: veil = (S,E) > (viewer.season, viewer.episode)
     season : veil = S >= viewer.season and not seasonCompleted(S)
     ending : veil = true
elif viewer.progress.status == want: veil = true                            // planning to watch → protect all levels
elif untracked:
     veil = (viewer.settings.spoilerProtection == strict)                    // balanced/off → show, but label it
if viewer.settings.spoilerProtection == off: veil = false
```
Label is always rendered when `level != none`, even when not veiled (`Ep 8 spoiler` tag on the Context strip).

### 3.4 What the veil looks like and does
- Covers body, media and comments preview; keeps author, Context strip and actions visible so the card is still identifiable.
- Says exactly what is hidden: **"Episode 8 spoiler"** + reason line **"You're on Episode 6"** (or "You plan to watch this", or "Strict protection is on").
- Actions: **Reveal** (this post, remembered for 24h on device) · **Reveal & mark Ep 8 watched** (when watching) · **Protect me** (adds to Want to Watch, for untracked in balanced mode — appears on the label, not the veil).
- Revealed content animates in (06 › Spoiler reveal). Comments under a revealed post are revealed too.
- The composer previews the veil: "This is how it looks to fans who haven't reached Episode 12."

### 3.5 Episode gate
Entering an Episode screen for an episode beyond the viewer's progress (while `watching` or `want`) shows a one-time gate: **"Have you watched Episode 8?"** → *I've watched it* (sets progress, unveils) · *Just peeking* (everything stays veiled, banner persists). Guests get the gate in strict mode with local-only progress.

### 3.6 Shorts
Same rule. A veiled Short shows its blurred cover with the label; tapping reveals and plays. Autoplay never reveals.

## 4. Visibility, safety and moderation

### 4.1 Blocks and mutes
| Action | Effect |
|---|---|
| **Block user** | Neither sees the other's posts, comments, shorts, collections or profile details ("This account is unavailable"); existing follows removed; cannot mention or reply; blocked user is not told. |
| **Mute user** | Their content disappears from my feeds and Activity; they can still see me. |
| **Mute drama / actor** | Content with that context disappears from my Home/Explore; the entity page still works. Auto-suggested when a user hits "Not interested" twice on the same drama. |
| **Mute words** | Client-side filter on body/title/hashtags; veiled with "Contains a muted word". |
| **Hide post** | Removes one item from my feeds; feeds a negative signal. |

### 4.2 Reports
Reasons (posts, comments, shorts, profiles, collections): *Spam · Harassment or hate · Sexual content · Violence or threats · Unmarked spoilers · Misinformation about a person · Impersonation · Copyright (link to DMCA form) · Something else (text)*. Flow: sheet → reason → optional detail → confirm → toast "Thanks — we'll review this" + inline options *Mute* / *Block*. Reporter never sees outcome details; Activity › System sends "We removed content you reported" when applicable.

### 4.3 Content states and how each renders
| State | Author sees | Others see | In feeds |
|---|---|---|---|
| `active` | normal | normal | yes |
| `processing` (video) | card with progress "Processing your Short…" | not visible | no |
| `failed` | card with Retry / Delete | not visible | no |
| `hidden` (auto-threshold or moderator) | banner "Hidden pending review" | "This post is unavailable" (only via direct link) | no |
| `removed` (policy) | banner "Removed for violating Guidelines" + Appeal | "This post was removed" (direct link) | no |
| `deleted` | gone | "This post was deleted" tombstone in threads only | no |
| author `suspended` / `deleted` | — | tombstone "Account unavailable" / "Deleted account" on their comments; posts hidden | no |

### 4.4 Rate limits (mirrored in UI with friendly copy)
Posts 20/day, comments 200/day, reactions 1,000/day, follows 200/day, reports 50/day, new accounts (< 24h): half of each and no links. UI: "You're posting fast — try again in 12 minutes."

## 5. Deletion & privacy

- **Account deletion** (Settings › Account › Delete account): type DELETE → server job → posts/comments/collections/reactions removed (tombstones for thread integrity), media purged, follows removed, handle released after 30 days. Also available via a web form (Play requirement).
- **Private collections** are visible only to the owner. **Saved** is always private. **Watchlist** is public by default with a per-user toggle (v1: public/private switch for the whole watchlist; notes are always private).
- Guests are never tracked beyond anonymous analytics; local progress set as a guest is offered for import on sign-up.

## 6. Genre & tag taxonomy (Hallyu's own; provider genres are mapped in ingestion)

**Genres (14):** Romance · Romantic comedy · Melodrama · Thriller · Crime · Mystery · Fantasy · Sci-fi · Historical (sageuk) · Slice of life · Family · Medical · Legal · Action.
**Tag families:** Tropes (enemies-to-lovers, contract marriage, time-slip, second-lead syndrome, revenge, chaebol, coming-of-age, found family, healing) · Mood (comfort, devastating, addictive, slow burn, cosy, tense) · Format (16-ep, 12-ep, 8-ep, daily, webtoon adaptation, remake).

## 7. Catalog provider abstraction

```
Provider (TMDB today) ──► Ingestion (Edge Functions / workers) ──► Hallyu catalog (Postgres) ──► App
   raw JSON, provider IDs        map · normalise · dedupe            Hallyu model (this doc)       never sees provider names
```
- **Ingestion jobs:** nightly refresh of `airing` + `upcoming` dramas (episodes, air dates, status); weekly refresh of top 500 by fans; on-demand import from Search ("Not in Hallyu yet → Import"); actor enrichment when an actor page is first opened; image re-check when a 404 is observed.
- **Mapping rules:** `koreanName` = first `alsoKnownAs` entry in Hangul script; `airing.days` = weekday set of the last 4 episode air dates; `airing.timeKst` from ops or network default (22:00); `status` from provider status + last air date; provider genres → Hallyu genres via a maintained table; posters/backdrops copied to Hallyu's own CDN path (`/catalog/{dramaId}/poster-w500.jpg`) so the app never loads provider hosts directly (and a provider swap is invisible).
- **Ops overrides:** any field can be pinned by an editor; pins survive re-sync.
- **Attribution:** About › Credits shows the provider logo (less prominent than Hallyu's) and the required notice; JustWatch credit if watch-provider data is shown. Nothing on product surfaces.
- **Second provider later:** add a mapper; the catalog schema and every screen stay unchanged.

## 8. Derived/computed fields the UI relies on
`episode.isLive`, `drama.nextEpisodeAt`, `drama.airingLabel` ("Sat–Sun · 21:20 KST" → localised "Sat–Sun · 1:20 PM your time"), `post.veil` (per viewer), `post.contextLabel` ("Goblin · Ep 9" / "Goblin · S1" / "Gong Yoo"), `notification.groupedText` ("Mina, Jae and 14 others reacted to your post"), `drama.communityLine` ("1.2k fans · 214 posts today · Ep 7 tonight").
