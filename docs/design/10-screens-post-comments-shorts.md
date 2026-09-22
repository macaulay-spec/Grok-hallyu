# 10 · Screens: Post detail, Comments, Shorts, Media viewer

---

## 10.1 Post detail (Post · Discussion · Review · Recommendation)

### Purpose
The conversation around one piece of content, with its full context and threaded replies — designed as a destination, not a popup.

### Hierarchy
1. The content (full body, media, verdict/embedded drama for reviews/recommendations).
2. Its context (drama · episode · actors · spoiler level).
3. Reactions summary.
4. Comments (sorted), then the composer bar docked at the bottom.

### Layout
- Top bar `stack`: back · title by type (**Post** · **Discussion** · **Review** · **Recommendation**) · ⋯ (Share · Copy link · Save · Not interested · Mute drama · Mute/Block author · Report · Edit/Delete/Pin comment if own).
- **Author row:** avatar 48 · name `titleSmall` · `@handle · Sep 12 · 2:14 PM` (absolute on detail) · FollowButton `sm` if not followed and not self.
- **ContextStrip** (full form with all entities; spoiler tag).
- **Content by type:**
  - Post: body `bodyLarge` with links/mentions/hashtags styled `accent.text`; ImageGrid at full width.
  - Discussion: kind tag · title `titleLarge` · body `bodyLarge`.
  - Review: verdict block (`display` `warm` "8.5" · "/10" · verdict line `titleLarge`) · "after Ep 8" tag when mid-watch · body · **Spoiler section** (if any) as a SpoilerBlock labelled "Spoilers in this section" with its own Reveal regardless of progress (author-marked) · recommend tags chips.
  - Recommendation: body · embedded DramaCard (`embedded`) with Follow + Watchlist · "If you liked" strip with the secondary drama.
- **Veil:** if veiled for this viewer, everything from ContextStrip down is a single SpoilerBlock; comments are also hidden until revealed ("Comments hidden with the post").
- **ReactionBar** (full width, counts visible) + "Who reacted" on the glyph stack.
- **Stats line** `caption`: "142 reactions · 36 comments · 12 saves".
- **Comments header:** `title` "Comments" + sort chips **Top · Newest · Oldest**; pinned comment first with a `Pinned` tag.
- **CommentItems** with "View N replies" → CommentThread (or inline expansion of the first 3 replies on expanded windows).
- **ComposerBar** docked; placeholder "Add a comment…"; reply mode via the Reply action; @mention typed.

### Components
HallyuTopBar, HallyuAvatar, FollowButton, ContextStrip, ImageGrid, SpoilerBlock, DramaCard embedded, ReactionBar, CommentItem, ComposerBar, HallyuChip, HallyuDialog (delete).

### Actions
React (tap/long-press); comment; reply; like a comment; open replies; save; share; follow author; open any context entity; pin/unpin own post's comment; edit (15-min window; "Edited" tag after) / delete (dialog); report; block; "Not interested".

### Navigation
Pushed from cards (`?c=` highlights a comment and scrolls to it), notifications, deep links. Tapping the comment icon on a card lands with the ComposerBar focused. Back pops; if the composer has text → dialog "Discard comment?".

### Visual
Reading column max 640dp; body `bodyLarge`; media edge-to-edge within margins; comments at `bodySmall` with 44dp indents in threads. Verdict number is the only warm element.

### Loading
Card data passed as arguments renders instantly; comments skeleton (3 rows); reactions summary hydrates.

### Empty
Comments: **No comments yet.** *Say what you felt.* (composer focused affordance). For veiled posts, the empty comments state is not shown until revealed.

### Error
Post fetch failure (deep link): full ErrorState **We couldn't open this post.** Retry · "It may have been deleted". Deleted → tombstone screen **This post was deleted.** with "Back to Home". Removed → **This post was removed for violating our Guidelines.** Hidden → author sees the banner variant; others see unavailable. Comment send failure → the optimistic comment shows "Not sent · Retry · Delete" inline; text preserved.

### Motion
Highlighted comment pulses `accent.soft` once; new comment inserts at the top of Newest (or bottom of thread) with fade+slide; reaction bursts; veil reveal.

---

## 10.2 Comment thread (replies)

- **Purpose:** focus on one comment and its replies.
- **Layout:** top bar `stack` "Replies" · parent comment pinned at top (full body) · replies list (Newest first? **Oldest first** for reading order, with "Jump to newest") · ComposerBar in reply mode ("Replying to @jae").
- **Actions:** like, reply (replying to a reply prefixes @handle and stays in the same thread), report, delete own; tap avatars → Profile.
- **States:** skeleton 4 rows; empty → "No replies yet — be the first"; error → inline retry; parent deleted → tombstone parent ("Deleted comment") with replies still visible.
- **Motion:** shared-axis push; new reply fade in at bottom + auto-scroll.

---

## 10.3 Shorts viewer (v2.0)

### Purpose
Drama-first vertical video: fast, immersive, but always one tap from the drama, episode, actor or creator it is about.

### Hierarchy
1. The video.
2. Creator + caption + **ContextStrip** (bottom-left).
3. Actions (right rail).
4. Progress and navigation chrome (minimal).

### Layout
- Full-screen immersive modal (status/nav bars translucent). Vertical pager, one Short per page, preloads next 2.
- **Top:** back (48dp onMedia) · segmented **For you · Following · [Drama name]** when opened from a drama/actor (scoped feed) · mute toggle.
- **Bottom-left (max 70% width):** creator row (avatar 40 · name · FollowButton `sm` onMedia) · caption 2 lines ("more" expands over a scrim) · **ContextStrip onMedia** (poster 20×30 · Goblin · Ep 9 · Gong Yoo) — each tappable · hashtag chips.
- **Right rail (bottom-aligned):** ReactionButton (28dp glyph + count) · Comment (opens comments sheet at half detent over the paused? **no — video keeps playing** at reduced volume) · Save · Share · "Open drama" poster button (24×36 poster, tap → DramaHub) — the signature control.
- **Bottom:** progress hairline (scrubbable), captions toggle when available.
- **Veiled Short:** blurred cover + SpoilerBlock centred ("Episode 9 spoiler · You're on Episode 6 · Watch anyway") — no autoplay until revealed; swiping past is free.

### Components
VideoPlayer, HallyuIconButton onMedia, FollowButton onMedia, ContextStrip onMedia, ReactionButton, comments sheet (10.1 comments in a HallyuBottomSheet `half/full` with its own ComposerBar), SpoilerBlock, ShareSheet.

### Actions
Swipe up/down; tap pause/play; double-tap Loved burst at point; long-press → 2× (v2.1); react; comment; save; share; follow; open drama/episode/actor/creator; ⋯ (Not interested · Mute drama · Report · Save video (own only) · Delete (own)); swipe left on a Short → creator profile (like a story), swipe right → back.

### Navigation
Modal over any origin; Back/swipe-down returns to the origin with the last-viewed Short's card scrolled into view. Deep link `/s/{id}` seeds the pager with that Short then continues with For you.

### Visual
Chrome is white on a bottom scrim only; nothing else is decorated; the Signal is not used here.

### Loading
Cover (blurhash) → poster frame → playback; spinner appears only after 800ms of buffering; next items prefetch on Wi-Fi and (if allowed) cellular.

### Empty
- For you (new platform / no content): **Shorts are warming up.** *Edits from your fandoms will show here.* → Browse dramas.
- Scoped feed (drama with no Shorts): "No Shorts for Goblin yet — post the first one" → ComposerShort pre-scoped.
- Following: "Nobody you follow has posted a Short yet" → For you.

### Error
Playback failure: inline ErrorState on the page ("This Short can't play right now · Retry") — swiping continues; feed failure → full ErrorState; removed/deleted item → skipped with a 1-line toast if it was the deep-link target.

### Motion
Pager snap; chrome auto-hide 3s; double-tap burst; comments sheet with the video shrinking slightly (0.96) behind it on compact; letterboxed videos fade the bars in from black.

### Data & accessibility
Autoplay policy from Settings (always/Wi-Fi/never; reduced motion → never by default); captions rendered from `captionsUrl`; every Short has an accessible description (caption + context); volume respects system; picture-in-picture not supported in v2.0.

---

## 10.4 Media viewer

- **Purpose:** look closely, then leave quickly.
- **Layout:** black background; pager of the post's images; top bar (onMedia): close, index "2 / 4", ⋯ (Save image · Share · Report); bottom caption: author + body 2 lines (tap to expand); alt text shown under the caption when available.
- **Actions:** pinch/double-tap zoom; swipe between images; swipe down to dismiss (1:1 drag, 06); long-press → Save/Share sheet.
- **States:** blurhash → full image (progressive JPEG); error → placeholder glyph + "Couldn't load image · Retry"; deleted post while open → toast + close.
- **Motion:** expand from card bounds; dismiss with parallax; index crossfade.
- **A11y:** close button first in focus order; images announce alt text or "Image 2 of 4 from Mina's post".
