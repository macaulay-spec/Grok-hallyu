# 13 · Screens: Activity, Profile, Edit profile, Follow lists, Saved, Settings

---

## 13.1 Activity

### Purpose
What happened that involves you or your fandoms — grouped so it reads like a story, not a graveyard of unread counts.

### Hierarchy
1. Things that need you (mentions, replies, follow requests → v1.5).
2. Social recognition (grouped reactions, comments, follows).
3. Drama events (episodes aired / tonight, trending in your fandoms).
4. System.

### Layout
- Top bar `root`: `headline` **Activity** · right: **Mark all read** (ghost, appears when unread > 0) · `settings` → Settings › Notifications.
- **HallyuTabRow:** All · Social · Drama · Mentions · System (badge dots per tab for unread).
- **Time sections:** Today · Yesterday · This week · Earlier (`overline`).
- **NotificationRows** (05 §C), grouped by `groupKey` within 24h windows:
  - Reactions: "**Mina, Jae and 14 others** reacted ❤😭 to your post" + post thumbnail.
  - Comments: "**Hana** commented: 'The rooftop scene…'" + thumbnail; multiple → "**Hana and 3 others** commented on your post".
  - Replies: "**Jae** replied to your comment".
  - Follows: "**Sora and 2 others** started following you" + Follow back buttons (expands to show up to 3 rows inline).
  - Mentions: "**Dayo** mentioned you in a discussion".
  - Drama: poster S · "**Goblin · Ep 9** just aired · 214 fans talking" → Episode; "**The Scandal** airs tonight at 2:00 PM" → Episode (pre-air) ; "**Trending in your fandom:** 'Was the ending earned?'" → PostDetail; "**Lovely Runner** starts streaming on Netflix in your region" (v1.5).
  - System: "Your Short is live", "We removed content you reported", "Welcome to Hallyu — add a photo", "New sign-in from a new device".
- Unread: Signal + `surface.1` background; `seen` clears the tab dot on open; `read` on tap or Mark all read.
- Swipe left on a row → **Mute this** (thread/drama/person) · **Delete**.

### Components
HallyuTabRow, NotificationRow, FollowButton, SectionHeader (time), HallyuBanner (permission off), EmptyState.

### Actions
Tap → target (post scrolled to the comment when relevant; profile; episode; collection); follow back; mute; delete; mark all read; permission banner → system settings.

### Navigation
Root of the Activity tab. Push notifications deep-link to the target with a synthetic stack (Home → target) unless the app was already on Activity.

### Visual
Text-first rows, 72dp; avatars stacked; thumbnails right; drama rows use posters. No red numbers anywhere.

### Loading
6 row skeletons; cached items shown instantly.

### Empty
- All: **Nothing yet.** *When fans react, reply or follow you — and when your dramas air — it shows up here.* → **Find people to follow**.
- Drama: **No drama activity.** *Follow dramas to get episode alerts.* → Explore airing now.
- Mentions: **No mentions yet.**
- System: **All clear.**
- Notifications disabled at OS level: top banner "Notifications are off — you'll still see activity here · Turn on".

### Error
ErrorState with Retry; cached list stays visible with a "Couldn't refresh" banner; follow-back failure reverts.

### Motion
Rows mark read with a background fade 260ms; new items insert at top with fade; tab dots pop.

---

## 13.2 Profile (own and others)

### Purpose
A fandom identity: who this person is, what they love, what they're watching, what they've made.

### Hierarchy
1. Identity (avatar, name, handle, bio).
2. Taste (favourites shelf, genres, currently watching).
3. Their content (tabs).

### Layout
- Top bar `collapsing` (name fades in); own: right `settings` + `bookmark` (Saved); others: right `share` + ⋯ (Share · Mute · Block · Report · Copy link).
- **Header:** avatar 96 (tap → MediaViewer) · `headline` name · `caption` @handle · editor mark if any · bio `body` (3 lines, More) · link (`accent.text`, domain only) · `caption` "Joined Sep 2026".
- **Stats row** (tappable): **Posts** · **Followers** · **Following** · **Finished** (dramas completed) — `title` numbers tabular + `caption` labels.
- **Primary action:** own → **Edit profile** (secondary `md`, full width) · others → FollowButton `md` (+ "Follows you" tag when true).
- **Favourites shelf:** `overline` "FAVOURITES" · 4 DramaPosters M in a row (empty slots on own profile show a dashed "+" tile; others see only filled slots; section hidden when none) ; long-press to reorder (own).
- **Currently watching:** `overline` "WATCHING" · horizontal DramaCards compact with "Ep 6/16" captions → DramaHub; "See watchlist" (own, or others if public).
- **Favourite genres:** chips (non-interactive on others; tap on own → Edit profile).
- **HallyuTabRow (sticky):** **Posts** · **Shorts** (v2.0) · **Reviews** · **Collections**.
  - Posts: PostCards (all types except review) — filter chips: All · Discussions · Reactions · Recommendations.
  - Shorts: 3-up ShortCard grid.
  - Reviews: review cards (verdict-led) sorted newest; "Fan verdicts: 42 · avg 7.9".
  - Collections: CollectionCards grid (public only for others; private tagged for own).

### Components
HallyuTopBar collapsing, HallyuAvatar 96, FollowButton, DramaPoster, DramaCard compact, HallyuChip tag, HallyuTabRow, PostCard, ShortCard, CollectionCard, EmptyState, HallyuDialog (block).

### Actions
Edit; follow/unfollow; open stats lists; open dramas; open content; share profile (URL + profile card image); mute/block/report; copy handle.

### Navigation
Own profile is the You tab root; others push on the current stack. Tapping @mentions anywhere pushes Profile.

### Visual
No cover image; the avatar and the favourites shelf carry the personality. Editor mark is a 12dp H glyph in `text.secondary`.

### Loading
Header from arguments (avatar/name); stats and shelves skeleton; tabs skeleton 3 cards.

### Empty
- Own, no posts: **You haven't posted yet.** *Start with a reaction — it takes one tap.* → **React to something** (opens Home Tonight or Explore).
- Own, no favourites: dashed tiles with "Pick your favourites" tooltip once.
- Own, not watching anything: strip replaced by "Track what you're watching" → Watchlist.
- Others, no posts: **Nothing posted yet.** (no action).
- Others, no public collections: section hidden; tab shows "No public collections".
- Blocked (you blocked them): header shows **You've blocked @handle** · Unblock; content hidden.
- Blocked (they blocked you) / suspended / deleted: **This account is unavailable.** (single state; no distinction revealed).

### Error
ErrorState with Retry; header stays.

### Motion
Avatar scales into MediaViewer; tabs slide; shelf reorder with drag lift (shadow) — the one place a shadow is allowed on content.

---

## 13.3 Edit profile

- **Layout:** full-screen modal; top bar: Cancel · **Edit profile** · **Save** `sm` primary. Sections: avatar (96, tap → Take photo / Choose photo / Remove; crop 1:1) · Display name (40) · Handle (with availability, cooldown notice "You can change this again in 23 days") · Bio (160, counter) · Link (URL validation) · **Favourite dramas** (4 slots with DramaPicker; drag to reorder) · **Favourite genres** (chips ≤ 5) · Watchlist visibility switch (mirror of Watchlist toggle).
- **States:** Save disabled until dirty & valid; uploading avatar shows ring; handle taken → inline error with suggestions; error → inline + retry; offline → "Connect to save changes" banner, fields editable.
- **Motion:** modal; avatar crossfade after upload.

## 13.4 Followers / Following

- Top bar title = **Followers** / **Following** with the person's name as subtitle; HallyuTabRow between the two; Following has segments **People · Dramas · Actors · Collections** (own and others' public follows).
- Rows: avatar/poster · name · `caption` (handle · "Follows you" / drama year · "Airing") · FollowButton `sm`. Search within list at the top (≥ 20 rows). Mutual follows first.
- **States:** skeleton rows; empty (Followers, own) → **No followers yet.** *Post a verdict or a reaction — fans find people through their takes.*; empty (Following) → **Not following anyone yet.** → Find people; error → retry.

## 13.5 Saved (private)

- Top bar **Saved** · filter chips: All · Posts · Discussions · Reviews · Shorts · Recommendations · sort Newest saved.
- PostCards (compact) with a "Saved Sep 10" caption; swipe left → Unsave (Undo).
- **States:** skeleton; empty → **Nothing saved.** *Tap the bookmark on any post to keep it here.*; error → retry. Deleted originals show a tombstone row "This post is no longer available · Remove".

## 13.6 Settings

### Root
ListRows grouped with `overline` headers:
- **ACCOUNT:** Account (email, password, connected accounts) · Notifications · Content & spoilers · Privacy & safety · Blocked & muted.
- **APP:** Appearance · Language · Data & storage.
- **SUPPORT:** Help & feedback · Report a problem · Community Guidelines · Terms · Privacy Policy · **About & credits**.
- **Sign out** (ghost row) · **Delete account** (`danger` text row).
- Footer `caption`: "Hallyu 1.0.0 (120) · Made for fans".
Guests see APP + SUPPORT only.

### Account
Email (with Verified tag / **Verify** action) · Change password (current + new + confirm; strength) · Connected: Google (Connect/Disconnect — disconnect blocked if no password set: "Set a password first") · Handle (→ Edit profile) · Sessions ("Sign out of other devices") · Download your data (email export, v1.5).

### Notifications
Master switch (reflects OS permission; if off → "Open system settings"). Channels with switches and per-channel detail rows:
- **Episodes:** "When a followed drama airs" · "Reminder 1h before" · "Only dramas I'm watching" (filter) · per-drama overrides list.
- **Social:** Reactions · Comments · Replies · New followers · Mentions (each: Everyone / People I follow / Off).
- **Highlights:** Trending in my fandoms · Recommendations · Weekly recap (off by default).
- **System:** always on (security, moderation outcomes).
- **Quiet hours:** switch + time range (default 23:00–08:00 local) · "Except episode alerts" switch.
Push previews: "Show content in notifications" switch.

### Content & spoilers
- **Spoiler protection:** radio — **Strict** ("Veil spoilers for every drama, even ones I don't track") · **Balanced** (default: "Veil spoilers for dramas I'm watching or plan to watch") · **Off** — with the veil rule explained in one line each.
- Blur images behind spoilers (on) · Show spoiler labels even when not veiled (on).
- **Muted dramas / actors** (→ Blocked & muted) · **Muted words** (chip input).
- **Shorts autoplay:** Always · Wi-Fi only (default) · Never · "Start muted" (on).
- **Data saver:** lower image quality on cellular (off by default; on when the OS data-saver is on).
- **One-tap reactions** (on).
- **Sensitive content:** "Show posts marked sensitive" (off) — user-marked, v1.5.

### Privacy & safety
- Watchlist visibility (Public / Private) · Who can mention me (Everyone / People I follow) · Who can reply to my posts (Everyone / People I follow — v1.5) · Hide my activity from "Fans like you" suggestions · Personalisation (switch: "Use my activity to personalise Home and Explore" — off = chronological/popular only) · Analytics sharing switch.
- Links: Safety Center, Report a person, DMCA / copyright form.

### Blocked & muted
Tabs: **Blocked people** (rows + Unblock) · **Muted people** · **Muted dramas** · **Muted actors** · **Hidden posts** (restore). Empty states: "You haven't blocked anyone" etc.

### Appearance
- Theme: **Dark** (only option shown as selected; "Light theme coming") · **True black** switch (`#000000` canvas; preview strip) · Text size (→ system settings link + in-app preview) · Reduce motion (reflects system; in-app override switch) · Haptics switch.

### Language
App language (English · 한국어 (v1.5)) · Prefer original titles switch (show Hangul first) · Time display: "Local time" / "KST" for schedules.

### Data & storage
Cache size + **Clear cache** · Media download quality · "Preload Shorts on Wi-Fi" switch · Offline: "Keep my feed available offline" (last 100 items).

### Help & feedback / Report a problem
FAQ list (local) · Contact (email intent with device info prefilled, optional) · **Report a problem** form: category · description · attach screenshot toggle · include logs switch → sends to support with a ticket toast.

### About & credits
App version, build, changelog link · **Credits:** "Drama, episode and actor data and images are provided by **TMDB**." with the TMDB logo (small, less prominent than the Hallyu lockup above it) and the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." · "Streaming availability data by JustWatch" when shown · Fonts (Pretendard, OFL) · Open-source licences list · Terms · Privacy · Guidelines.

### Sign out
Dialog **Sign out of Hallyu?** *Your drafts stay on this device.* → Welcome.

### Delete account
Screen: `headline` **Delete your account** · body explains what is removed and the 30-day handle hold · list of consequences · "Download your data first" link · field "Type DELETE to confirm" · **Delete account** `danger` (disabled until typed) → password/Google re-auth → progress ("Deleting…") → Welcome with toast "Your account was deleted". Web equivalent exists at `hallyu.app/delete-account` (Play requirement).

### Settings states
All pages: values load from cache instantly; sync failures show a banner "Some settings couldn't sync — we'll retry"; switches revert on failure with a toast; offline → local changes queue.
