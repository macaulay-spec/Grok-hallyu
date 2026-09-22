# 12 · Screens: Watchlist & Collections

---

## 12.1 Watchlist

### Purpose
Lightweight tracking that powers the veil and your identity: where you are, what's next, what you've finished — without becoming a spreadsheet.

### Hierarchy
1. **Up next** — the episodes you can watch now.
2. The status segments (Watching · Want to watch · Completed · Dropped).
3. Items with one-tap progress.

### Layout
- Top bar `stack`: title **Watchlist** · right: `sort` (Recently updated · Title · Next episode · Progress) · `visibility` toggle (public/private watchlist) · search within.
- **Up next** (Watching only, when any tracked drama has an unwatched aired episode): horizontal EpisodeCards `tonight` variant labelled "Ep 7 · aired yesterday · 214 talking" → Episode; "Mark watched" quick action on long-press.
- **HallyuSegmentedControl:** Watching (n) · Want to watch (n) · Completed (n) · Dropped (n); swipeable pages.
- **Rows (88dp):** poster S · title `titleSmall` · `caption` status-specific line:
  - Watching: progress bar + "Ep 6 of 16 · Next Sat 2:00 PM" + trailing **+1** button (48dp, `add`); at the last episode the trailing control becomes **Finish ✓**.
  - Want to watch: "Added Sep 3 · Airing · Sat–Sun" + trailing **Start** (sets Watching, Ep 0/1 sheet).
  - Completed: "Finished Aug 12 · your verdict 8/10" (or **Write a verdict** ghost) + trailing ⋯.
  - Dropped: "Dropped at Ep 4" + trailing **Resume**.
  A private note glyph shows when a note exists (tap → sheet).
- Swipe actions: right → +1 episode (Watching) / Start (Want); left → status menu. Long-press → WatchlistItemSheet.
- Footer stats line (Completed): "42 dramas · ~ 630 hours" (`caption`, `text.tertiary`).

### Components
HallyuSegmentedControl, EpisodeCard tonight, ListRow with poster, HallyuProgressBar, HallyuIconButton, WatchlistItemSheet, HallyuSnackbar, EmptyState.

### Actions
+1 (haptic, snackbar Undo); Finish → dialog **Mark Goblin completed?** + optional "Write a verdict" → Review composer; change status; set episode; add/edit note; remove (dialog only for Completed with a verdict; others: snackbar Undo); open drama/episode; share watchlist (public only → `/u/{handle}?tab=watchlist` v1.5).

### Navigation
Pushed from You/Profile ("Watching" strip), Home modules, DramaHub progress card. Back pops.

### Visual
Progress bars in `text.secondary` fill (accent reserved); Finish uses `success` on completion; posters small; rows separated by hairlines.

### Loading
Segment counts from cache instantly; 6 row skeletons per segment.

### Empty
- Watching: **Nothing in progress.** *Start a drama and we'll keep your place.* → **Browse airing now**.
- Want to watch: **Your next obsession belongs here.** → **Explore dramas**.
- Completed: **No finished dramas yet.** *Mark what you've watched to unlock verdicts and better recommendations.* → **Add finished dramas** (opens DramaPicker multi-select with quick "Completed" setting).
- Dropped: **Nothing dropped.** *No shame in it when it happens.* (no action)
- Up next: hidden when empty.

### Error
Load failure with cache → banner; without → ErrorState + Retry. Progress update failure → revert + toast "Couldn't update Ep 7 — try again".

### Motion
Progress roll; row reorder on status change (collapse from one segment, insert into another with a badge count bump); Finish check-fill.

---

## 12.2 Watchlist item sheet ("Update progress")

- **Purpose:** every status change in two taps from anywhere.
- **Layout:** HallyuBottomSheet `content`: header (poster S · title · `caption` "16 episodes · Airing") · **status segmented** (Want · Watching · Completed · Dropped) · when Watching: season chips (if any) + episode stepper `− Ep 6 / 16 +` + "Mark latest aired (Ep 7)" ghost · when Completed: rating prompt chips 1–10 (optional) + "Write a verdict" · **Note** field (private, 280) · **Remove from watchlist** ghost danger · **Done** primary.
- Changes apply immediately (optimistic) as the user taps; Done just closes. Setting Watching at Ep N when posts beyond N exist triggers nothing; setting Completed reveals everything for that drama (toast "Spoilers for Goblin are now visible").
- States: guest → AuthGate; error → inline "Couldn't save" + Retry (sheet stays).
- Motion: sheet; stepper ticks; segmented indicator.

---

## 12.3 Collections (list)

### Purpose
Curate and share taste: ordered lists of dramas with notes — organisational and social.

### Layout
- Top bar `stack`: **Collections** · right `add` → CollectionEditor.
- Segments: **Mine** · **Saved**.
- Mine: grid 2-up CollectionCards (cover mosaic, title, "12 dramas", lock glyph if private, "340 saves" if public). First position: a dashed "New collection" tile.
- Saved: grid of collections the user follows (owner line shown).
- Sort: Recently updated · A–Z · Most saved.

### Actions
Open; create; long-press → Edit · Share · Make private/public · Delete (dialog).

### States
Loading: 4 tile skeletons. Empty Mine: **No collections yet.** *Comfort dramas. Enemies to lovers. Dramas that destroyed you. Start one.* → **New collection** (with three tappable title suggestions that prefill). Empty Saved: **Nothing saved.** → Explore collections. Error: ErrorState + Retry.

---

## 12.4 Collection detail

- **Layout:** top bar `collapsing` · **header:** cover mosaic 16:9 (posters) with scrim · title `headline` · description `body` · owner row (avatar 32 · name · FollowButton `sm`) · counts `caption` "12 dramas · 340 saves · Updated Sep 10" · actions: **Save** (tonal toggle, "Saved ✓") · Share · ⋯ (Report · Copy link) — owner sees **Edit** instead of Save.
- **Items:** numbered rows (`display` `text.tertiary` "01") · poster S · title · year · genres `caption` · owner's note in `bodySmall` italic-free (quoted with a 2dp left hairline) · trailing WatchStatusButton `xs` (shows the viewer's own status) · long-press → quick actions.
- **Footer:** "More from Mina" (2 CollectionCards) · "Fans who saved this also saved" (2).
- **States:** loading = header + 6 rows skeleton; empty (owner) = **This collection is empty.** → **Add dramas** (DramaPicker multi-select); empty (viewer) = "Nothing here yet"; private collection opened via link by a non-owner = **This collection is private.**; deleted = **This collection was deleted.**; error = ErrorState + Retry.
- **Motion:** shared element from card mosaic; rows fade in staggered; Save toggle width animation.

---

## 12.5 Collection editor (new / edit)

- **Layout:** full-screen modal; top bar: Cancel · **New collection / Edit collection** · **Save** primary `sm`. Fields: Title (60, required) · Description (300) · Visibility switch (Public / Private with one-line explanation) · Cover (auto mosaic or **Choose poster** from items) · **Dramas** section: **Add dramas** button → DramaPicker multi-select; list of items with drag handles (reorder), per-item note field (140), remove ×.
- Autosave for edits (existing collection) on Save only; unsaved changes → discard dialog.
- **States:** Save disabled until title + ≥ 1 drama (new); error → inline + retry; offline → save queued with banner.

## 12.6 Add to collection (sheet)
- Opened from any drama (⋯, long-press, DramaHub overflow). List of the user's collections as checkbox rows (poster mosaic 40 · title · count · lock) with **New collection** at the top (inline title field → creates and checks it). Multi-check applies immediately; toast "Added to Comfort Dramas · View". Empty → the inline "New collection" row is focused with a placeholder suggestion.
