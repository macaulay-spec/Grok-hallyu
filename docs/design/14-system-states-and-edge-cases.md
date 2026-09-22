# 14 · System States & Edge Cases

"A production application is mostly edge cases wearing a nice coat." This document defines the coat.

## 1. The state matrix (every screen must satisfy it)

| State | Rule | Component |
|---|---|---|
| **Loading (first)** | Skeleton matching the final layout, shown after 150ms; anything passed as navigation arguments (title, poster, avatar) renders immediately | HallyuSkeleton |
| **Loading (more)** | 2 skeleton items at the list end; never a spinner | HallyuSkeleton |
| **Refreshing** | Pull-to-refresh Signal indicator; content stays | PullToRefresh |
| **Empty** | Title + reason + a next action from the copy dictionary (§4). Never "No data found" | HallyuEmptyState |
| **Error (full)** | What happened · whether data was saved · what to do · Retry. Cached content preferred over the error | HallyuErrorState |
| **Error (section)** | One row with the message + Retry; other sections unaffected | ErrorState inline |
| **Error (action)** | Optimistic UI reverts + toast/snackbar with Retry where possible; input preserved | Toast/Snackbar |
| **Offline** | Persistent top banner + cached content; write actions queue (react/save/follow/watch progress/posts) and show "Will sync" | HallyuBanner |
| **No results** | Search-specific empty with spelling/Korean-title/import guidance | HallyuEmptyState |
| **First-time** | One inline module or one tooltip, dismissible, never a modal tour | Inline module |
| **Guest** | Read everything public; gated actions → AuthGate; personal tabs show sign-in prompts | AuthGate |
| **Deleted content** | Tombstone rows in threads; full-screen tombstone for direct links | Tombstone |
| **Blocked** | Symmetric "This account is unavailable"; own block list shows Unblock | Profile state |
| **Private content** | "This collection is private" / "This watchlist is private" | Full state |
| **Unavailable media** | Placeholder glyph on `surface.1` + "Couldn't load image · Retry"; video → inline ErrorState, swiping continues | Placeholder |
| **Processing** | Author-only card state with progress; hidden from others | Card banner |
| **Rate-limited** | Friendly copy with the wait time; button disabled with countdown | Inline |
| **Permission denied** | Explain + "Open settings"; never re-prompt in a loop | HallyuBanner |
| **Update available** | Non-blocking banner on Home ("Hallyu 1.1 is available · Update"); **Update required** full screen when the API version is unsupported | Banner / full screen |
| **Maintenance** | Full screen with the Signal, "Back in a bit", cached read-only browsing allowed | Full screen |
| **Session expired** | Silent refresh; if impossible → AuthGate-like sheet "Sign in again to continue" preserving the current screen | Sheet |
| **Stub catalog data** | "Just added — details are filling in" banner; sections show skeletons up to 10s | HallyuBanner |
| **Long content** | Bodies clamp (6 lines cards / full on detail); titles 2 lines; handles ellipsize middle | Text rules |
| **Huge numbers** | 1.2k · 34k · 1.2M (`caption` tabular); exact on long-press tooltip (v1.5) | Formatter |
| **Timezone edges** | Air times stored UTC; shown local + "KST" on schedule surfaces; "Tonight" uses the KST calendar day | Formatter |

## 2. Offline behaviour in detail
- **Readable offline:** last 100 Home items, visited drama/episode/actor pages (24h), Saved, Watchlist, Collections, Drafts, Settings.
- **Queued writes:** reactions, saves, follows, watch progress, posts (text + already-picked media), comments. Queue shows in a "Pending (3)" row under the offline banner; conflicts resolve last-write-wins except watch progress (max wins).
- **Never offline:** sign-in, account changes, uploads (queued until online), Shorts playback (unless cached), search (recents only).
- **Recovery:** on reconnect, banner turns to "Back online — syncing…" then disappears; failures surface as per-item "Not sent · Retry".

## 3. Error taxonomy → human copy

| Technical | Shown |
|---|---|
| Network unreachable | **You're offline.** Showing what we saved earlier. |
| Timeout / 5xx | **Something went wrong on our side.** Nothing was lost — try again. |
| 401 / expired | **Sign in again to continue.** |
| 403 (blocked / private) | **This isn't available to you.** |
| 404 | **This [post/drama/profile] doesn't exist anymore.** |
| 409 (handle taken, duplicate) | **That handle is taken.** Try @mina_kdrama2 |
| 413 / media too large | **That file is too big.** Photos up to 20 MB, videos up to 200 MB. |
| 415 / unsupported | **We can't use that file type.** JPG, PNG, WebP, HEIC or MP4. |
| 422 validation | Field-level message ("Add a title") |
| 429 | **You're doing that fast.** Try again in 12 minutes. |
| Upload interrupted | **Upload paused.** We'll resume when you're back online. |
| Video processing failed | **Couldn't process this video.** Try another file. |
| Provider import failed | **Couldn't import that drama.** Try again in a moment. |
| Play Integrity / device blocked | **This device can't use Hallyu right now.** Contact support. |

Rules: sentence case; no exclamation marks; say whether data was saved; one action; log the technical code for the Report-a-problem form.

## 4. Copy dictionary (empty states)

| Screen | Title | Body | Action |
|---|---|---|---|
| Home (no follows) | Your drama universe is empty. | Follow a few dramas and people to fill it. | Explore dramas |
| Following (no posts) | Quiet for now. | Your people haven't posted recently. | Discover more fans |
| Explore section | *(collapses)* | | |
| Search | No results for "…". | Check the spelling, try the Korean title, or search our catalog provider. | Search provider |
| Drama › Community | Nothing here yet. | Be the first fan to say something about {drama}. | Post |
| Episode room | Nobody's said anything yet. | You just watched it — go first. | React / Start a discussion |
| Episode (pre-air) | Room opens when the episode airs. | Airs {day} at {time}. | Remind me |
| Actor posts | No posts about {actor} yet. | | Be the first |
| Watching | Nothing in progress. | Start a drama and we'll keep your place. | Browse airing now |
| Want to watch | Your next obsession belongs here. | | Explore dramas |
| Completed | No finished dramas yet. | Mark what you've watched to unlock verdicts and better recommendations. | Add finished dramas |
| Dropped | Nothing dropped. | No shame in it when it happens. | — |
| Collections (mine) | No collections yet. | Comfort dramas. Enemies to lovers. Dramas that destroyed you. Start one. | New collection |
| Collection (owner, empty) | This collection is empty. | | Add dramas |
| Saved | Nothing saved. | Tap the bookmark on any post to keep it here. | — |
| Activity | Nothing yet. | When fans react, reply or follow you — and when your dramas air — it shows up here. | Find people to follow |
| Profile (own, no posts) | You haven't posted yet. | Start with a reaction — it takes one tap. | React to something |
| Followers (own) | No followers yet. | Post a verdict or a reaction — fans find people through their takes. | — |
| Drafts | No drafts. | Half-written thoughts live here. | — |
| Shorts (for you) | Shorts are warming up. | Edits from your fandoms will show here. | Browse dramas |
| Blocked list | You haven't blocked anyone. | | — |
| Notifications off | Notifications are off. | You'll still see activity here. | Turn on |

## 5. Tombstones and unavailable entities

| Entity state | Direct link | In lists / threads |
|---|---|---|
| Post deleted | Full: **This post was deleted.** → Back to Home | Removed from feeds; in a thread: "Deleted post" row for context |
| Post removed | Full: **Removed for violating our Guidelines.** | Same as deleted |
| Post hidden (pending) | Author: banner; others: **This post is unavailable.** | Hidden |
| Comment deleted | — | "Deleted comment" row; replies remain |
| Account deleted | **This account is unavailable.** | Comments show "Deleted account" name, default avatar |
| Account suspended | **This account is unavailable.** | Same |
| Drama merged (duplicate) | Redirect to the canonical drama with toast "Moved to the main page for {drama}" | Links follow the redirect |
| Collection private / deleted | **This collection is private.** / **…was deleted.** | Removed from Saved with a tombstone row |
| Media 404 | Placeholder + Retry; if persistent, "Image no longer available" | Placeholder |

## 6. Interruptions
- **Incoming call / app backgrounded** during composing: draft autosaved; on return the composer restores including scroll position.
- **Process death:** all screens restore from saved state (query, scroll, form drafts, selected tab, sheet open state is *not* restored — sheets close).
- **Low memory:** image caches trimmed; Shorts preloads reduced to 1.
- **Rotation / fold:** state preserved; composers keep text; Shorts continues playback.
- **Deep link while composing:** dialog "Save draft and open link?".
- **Push tap while in a composer:** same dialog.

## 7. First-run overlays
Exactly three in the whole product, each once, each dismissible, none modal:
1. Home: tooltip on the Tonight rail (only if it exists) — "Your dramas' latest episodes live here."
2. First veiled card: tooltip on the Reveal button — "Spoilers hide based on your watch progress. Change it in Settings."
3. First DramaHub visit: tooltip on the Watch status button — "Track it so we can protect you from spoilers."
