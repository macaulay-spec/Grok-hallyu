# 05 · Component System

Naming follows the brief (`Hallyu*` primitives) and maps 1:1 to composables in `:core:designsystem` (18). Every component defines: anatomy · variants · sizes · states · behaviour · accessibility. Shared state vocabulary: **rest · pressed · focused · disabled · loading · selected · error**. All interactive components have a ≥ 48×48dp touch target (visual size may be smaller), a pressed state (`surface.3` or 8% white overlay, 100ms), and a focus ring (2dp `border.strong`, 2dp offset) for keyboard/TV.

---

## A. Primitives

### HallyuButton
- **Anatomy:** container · optional leading icon 18dp · label (`button`) · optional trailing icon · loading spinner replaces label (width preserved).
- **Variants:** `primary` (accent fill, `accent.on` label) · `secondary` (surface.2 fill, `border.subtle`, `text.primary`) · `ghost` (no fill, `text.primary`) · `danger` (`danger.fill`) · `tonal` (accent.soft fill, `accent.text` label — for selected-ish actions like "Following").
- **Sizes:** `lg` 52dp (primary CTAs, full width) · `md` 44dp · `sm` 36dp (inline follow buttons) · `xs` 28dp (chips-as-buttons in dense rows).
- **States:** pressed = `accent.pressed` / 8% overlay; disabled = 38% opacity, no press; loading = spinner, disabled semantics, label kept for screen readers ("Posting…").
- **Behaviour:** single-fire (debounced 400ms); haptic light on primary; icon-only use → HallyuIconButton instead.
- **A11y:** role button; label is the visible text; loading announces politely.

### HallyuIconButton
48×48 target, 24dp glyph, variants `standard` · `filled` (surface.2 circle) · `onMedia` (black 40% circle for overlays). Toggle form (`checked`) fills the icon and uses `accent`. Always requires `contentDescription`.

### HallyuTextField
- **Anatomy:** label (floating, `caption`) · leading icon · input (`body`) · trailing affordance (clear · eye · counter) · helper/error line (`caption`).
- **Variants:** `outlined` (default; `surface.1` fill, 1dp `border.subtle`, focused → `border.strong` 1.5dp) · `filled-plain` (composer bodies, no border) · `multiline` (auto-grow to N lines then scroll).
- **Sizes:** 52dp single-line; 44dp compact (search in sheets).
- **States:** error = `danger` border + message + icon; disabled = 38%; read-only = no caret.
- **Behaviour:** clear button appears with content; password eye toggles with announcement; counters turn `warning` at 90%, `danger` at 100% (input still allowed to 100%, blocked after); IME action configured per field (next/done/search/send).
- **A11y:** label associated; errors announced on change; min 48dp height including padding.

### HallyuSearchField
Pill (radius `full`) 44dp, `surface.2`, leading `search`, placeholder "Search dramas, actors, people, posts", trailing clear / mic (none in v1). In Explore it is a **button** that pushes Search; in Search it is the live input. Supports voice-over label "Search Hallyu".

### HallyuAvatar
Sizes 24 · 32 · 40 · 48 · 64 · 96. Fallback: initial (first grapheme of displayName) on a hue derived from the user id (12 hues at 30% on `surface.2`). Optional `badge`: editor mark (12dp H glyph) or live ring. Tap target inherits from parent (row) or is 48dp when standalone. `contentDescription` = display name.

### HallyuChip
- **Variants:** `filter` (toggle; selected = `accent.soft` fill + `accent.text` label + 1dp accent border) · `assist` (action; `surface.2`) · `input` (removable; trailing × 18dp) · `tag` (non-interactive; `xs` radius; `caption`).
- **Size:** 32dp height (36dp with avatar/poster leading). Label `label`. Max width 200dp with ellipsis.
- **States:** pressed overlay; disabled 38%; selected as above. Groups scroll horizontally with 16dp edge fade.

### HallyuSegmentedControl
Text tabs with a 2dp underline indicator that slides (06). Used for For You / Following, profile tabs, drama sections (there as sticky `HallyuTabRow` with horizontal scroll and edge fades). Label `label`; active `text.primary`, inactive `text.secondary`. Swipe between pages is supported wherever the control sits above a pager.

### HallyuTopBar
Height 56dp + status inset. Variants: `root` (wordmark or `headline` title, right actions ≤ 2) · `stack` (back 48dp, `title`, right actions) · `collapsing` (over heroes: transparent → `canvas` at 92% with hairline after 56dp of scroll; title fades in). Back icon `arrow_back`. Titles truncate to one line; long titles scroll-collapse rather than wrap.

### HallyuTabBar (bottom)
64dp + navigation inset, `canvas` at 96% (no blur) with top hairline. Five slots; the Create slot is a 40×40 accent rounded-square (`xl` radius) with a white `add`. Active: filled icon + 4dp Signal under it; labels `caption` shown always (a11y), 11sp. Hide/show on scroll (translateY 100%, 250ms). Badge: 6dp dot at icon top-right.

### HallyuNavigationRail (medium/expanded)
80dp wide, same five items vertical, Create as a 56dp FAB at top, labels under icons, the You item shows avatar. Expanded (≥ 1,200dp): 240dp drawer-style with labels beside icons.

### HallyuBottomSheet
`surface.2`, top radius `lg`, 32×4dp handle, scrim `overlay`. Detents: `content` (wrap) · `half` (50%) · `full` (top inset + 16). Header: title (`title`) + optional close. Drag to dismiss; Back closes; scrim tap closes unless `blocking` (AuthGate is not blocking; upload progress is). Content scrolls internally when tall. Sheets never stack more than one deep: a sheet that needs another (Add to collection → New collection) replaces itself and returns.

### HallyuDialog
Max width 320dp, `surface.2`, radius `md`, title `title`, body `bodySmall`, actions right-aligned (ghost + primary/danger). Only for destructive or data-loss confirmations. Focus lands on the safe action.

### HallyuToast / HallyuSnackbar
Bottom, above tab bar, 48dp, `surface.3`, `bodySmall`, radius `sm`. Toast: 2.5s, no action. Snackbar: 5s with one action in `accent.text` (Undo, View, Manage). Queue depth 1 (newest replaces). Announced politely.

### HallyuBadge / Signal
`Signal` 6/8dp accent dot with optional pulse. Count badges are **not** used in navigation; small count pills (`caption`, `surface.3`) appear only inline ("+3").

### HallyuProgressBar / Stepper
Linear 4dp track `surface.3`, fill `accent` (watch progress uses `text.secondary` fill to avoid accent overuse; completed = `success`). Stepper: `−` `Ep 7 / 16` `+` with 48dp targets, long-press to repeat, haptic tick per step.

### HallyuSkeleton
Shapes: line (heights 12/16/24), block, circle, poster 2:3. `surface.1` base with a 1.2s shimmer sweep (disabled under reduced motion → static). Every list screen has a skeleton that matches its real layout (shown after 150ms; if data arrives sooner, nothing flashes).

### HallyuEmptyState / HallyuErrorState / HallyuLoadingState
- **EmptyState:** optional 24dp glyph · title (`title`) · body (`bodySmall`, `text.secondary`) · primary action (`md` primary or tonal) · optional secondary link. Max width 320, centred, 48dp top margin. Copy from 14 › dictionary.
- **ErrorState:** same layout + `danger` glyph; body states what happened, whether data was saved, what to do; action **Retry**; secondary "Report a problem" when repeated. Inline (section) variant is a single row with Retry.
- **LoadingState:** skeleton by default; a 20dp indeterminate spinner only for actions (button loading) and full-screen waits < 1s.

### HallyuBanner (inline)
Full-width row on `surface.1`, leading icon, `bodySmall`, optional action, dismiss ×. Used for offline, "Just peeking" veil mode, "Update available", "Hidden pending review".

### HallyuListRow
56dp (single line) / 72dp (two lines) / 88dp (with poster S). Leading (avatar · poster · icon) · title `titleSmall` · supporting `caption` · trailing (chevron · switch · button `sm` · count). Hairline dividers inset to text start.

### HallyuSwitch / Checkbox / Radio
Material 3 shapes with Hallyu colours (track on = `accent`, thumb white). Labels are the full row (tap anywhere).

---

## B. Catalog components

### DramaPoster
Poster image with blurhash, radius `sm`, optional overlays: status tag (`Airing` accent dot + `overline`), progress bar (bottom, 3dp), selected Signal, "Just added" tag. Sizes S/M/L/XL (04 §6). Long-press → quick actions sheet (Follow · Add to watchlist · Add to collection · Share).

### DramaCard
Poster + title (`titleSmall`, 2 lines) + meta (`caption`: year · genre, or "Ep 7 · Sat" when airing) + optional community line (`caption` accent.text: "214 talking"). Variants: `vertical` (rails), `horizontal` (list: poster S + text + trailing follow/status button), `hero` (see DramaHero), `compact` (poster S + title only, for pickers), `embedded` (boxed inside recommendation cards: poster M + title + one-line synopsis + Follow `sm`).

### DramaHero
Backdrop 16:9 (grain + scrim) · poster M floated bottom-left over the scrim (optional on compact; always on medium+) · title `display` · originalTitle `caption` · meta line (`caption`: 2024 · tvN · 16 eps · Romance) · status pill · **community line** · actions row (Follow `md` primary → tonal "Following"; WatchStatusButton; Share icon). Collapses into the top bar.

### EpisodeCard / EpisodeRow
Row 72dp: leading `Ep 7` block (`title`, tabular) · title or "Episode 7" · `caption` air date (local, with "tonight"/"in 3h"/"aired 40m ago" for ±24h) · post count · trailing watched check (toggle) · Signal when live. Veiled synopsis row expands under it when watched. Variant `tonight` (Home rail): poster S + `Ep 7` + live line + "Join" affordance.

### EpisodeChip
`Ep 9` (`label`) with optional Signal; selected = accent.soft. Used in filters and Context strips.

### ActorCard / ActorChip
Card: circle 64 (list) or 2:3 tile 104×156 (grid) + name `titleSmall` + character/role `caption`. Chip: 32dp with 24 avatar + name.

### ContextStrip ("Talking about")
The card-level context renderer. Row: poster 20×30 (or actor avatar 20) · `Goblin` (`label`) · `·` · `Ep 9` EpisodeChip-lite · spoiler tag (`Ep 9 spoiler`, `caption`, `warm` text when not veiled) · overflow "+1" when > 2 entities. Each part is its own tap target (03 §5). In composers it becomes editable rows: *Talking about — Crash Landing on You* / *Episode — 12* / *Spoiler — Episode 12*.

### WatchStatusButton
`md` secondary button showing current status with glyph: "Add to watchlist" (none) · "Want to watch" · "Watching · Ep 6" · "Completed" · "Dropped". Tap → WatchlistItemSheet. Long-press → quick menu of the four statuses.

### FollowButton
`sm`/`md`. Not following: primary "Follow". Following: tonal "Following" (tap → confirm sheet only for people with > 1 year of follow? no — tap toggles immediately with snackbar Undo). For dramas the first follow triggers the alerts snackbar. Optimistic with rollback + error toast.

---

## C. Content components

### PostCard (base) and its variants
Base anatomy: header (avatar 40 · name `titleSmall` · `@handle · 2h` `caption` · editor mark · ⋯) → **ContextStrip** → content → media → **ReactionBar** → footer (comments · saves · share). No box; 16dp padding; hairline separator. For You adds a `reasonLine` above the header (`caption`, `text.tertiary`: "Because you follow Goblin").

| Variant | Content zone |
|---|---|
| `post` | body `body`, 6 lines then "more"; images per 04 §6 |
| `reaction` | 40dp reaction glyph (coloured) + one line `title` + ContextStrip; compact 88dp; multiple reactions to the same episode from followed people collapse into a **ReactionCluster** ("Mina, Jae + 9 reacted to Ep 7" with glyph tally) |
| `discussion` | kind tag (`Theory`) · title `title` (2 lines) · body preview 3 lines · "24 replies · last 5m" line · footer button `sm` tonal "Join" |
| `review` | verdict block: `8.5` (`display` `warm`) + "/10" + verdict line `title` · body preview 3 lines · tags · "Spoiler section inside" tag if any · "after Ep 8" tag for mid-watch reviews |
| `recommendation` | body 3 lines · embedded DramaCard (`embedded`) with Follow/Watchlist · optional "If you liked ⟶ X" strip |
| `short` | 9:16 cover (height 280dp compact) with play glyph, duration, view count; caption 2 lines beneath; tap → ShortsViewer |
| `veiled` (any) | SpoilerBlock replaces content + media |

### SpoilerBlock (the veil)
`color.veil` surface, min height 96dp, radius `md`, centred: veil glyph 24 · **Episode 8 spoiler** (`title`) · reason (`caption`) · actions row: **Reveal** (tonal `sm`) · "Reveal & mark watched" (ghost `sm`, when applicable). Media behind the veil is blurred at 24px + 30% black; text is not rendered at all (no peeking via accessibility tree until revealed). Reveal animation in 06.

### ReactionButton / ReactionBar / ReactionPicker / ReactionMeter
- **ReactionButton:** heart outline + count; tap toggles Loved (fill, scale-burst, haptic); long-press (350ms) opens the picker anchored above; when the user's reaction ≠ Loved, the glyph shows their reaction.
- **ReactionBar:** ReactionButton · top-3 reaction glyphs stack (16dp, overlapping −4dp) · total (`caption`) · comments · saves · share. Tap the glyph stack → "Who reacted" sheet with tabs per reaction.
- **ReactionPicker:** horizontal pill of six 40dp glyphs with labels on hover/long-press; appears with staggered scale-in (06); selecting closes it.
- **ReactionMeter:** six horizontal bars with glyph, label and percentage (`caption`), sorted by count, top bar full width; header "How fans felt" + total; in Episode and Drama Overview.

### CommentItem
Avatar 32 · name `titleSmall` + `Author` tag when applicable + time · body `bodySmall` (8 lines then more) · actions row (`caption`: Like with count · Reply · ⋯) · "View 12 replies" link → CommentThread. Nested replies (in thread) indent 44dp with a 1dp connector in `border.subtle`. Highlighted comment (deep link) pulses `accent.soft` once.

### ComposerBar (inline comment composer)
Docked above the IME: avatar 32 · multiline field (1–5 lines) · send icon (accent when non-empty). Reply mode shows "Replying to @jae ×" above. Mention autocomplete sheet above the bar (v1.5; v1 supports typed @handles with server resolution).

### ShortCard
2:3-ish tile (9:16 content) with cover, duration, views, caption line; in grids 3-up compact / 4-up medium; in rails 140×248.

### MediaViewer
Full-screen black, pager with 1–4 images, pinch-zoom 1–4×, double-tap zoom, swipe-down to dismiss with parallax + fade, index "2 / 4", top-right actions (Save to device, Share), bottom caption (author + body 2 lines, expandable). Landscape allowed.

### VideoPlayer (Shorts)
9:16 fill (letterbox for others), tap = pause/play with a 48dp glyph flash, long-press = 2× speed (v1.5), progress hairline at the bottom with scrub on drag, mute toggle (state persisted), captions toggle when available, buffering = subtle spinner centre, error = ErrorState inline with Retry.

### ImageGrid
Layouts per count (04 §6); tap → MediaViewer at that index; alt text shown in viewer caption when provided.

### CollectionCard
Cover mosaic (2×2 posters or single chosen poster, radius `md`) · title `titleSmall` · owner line (`caption`: avatar 16 + name) · counts (`caption`: 12 dramas · 340 saves) · private lock glyph when private. Variants `grid` (2-up) and `row` (list).

### NotificationRow
Leading: stacked avatars (up to 3, 24dp) or drama poster S for drama category · text (`bodySmall`: bold actors + verb + object) · time `caption` · trailing: post thumbnail 40dp, or FollowButton `sm`, or episode "Open" ghost button. Unread: 6dp Signal at left edge + `surface.1` background.

### SectionHeader
`overline` eyebrow (optional) · title `titleLarge` · optional subtitle `caption` · trailing "See all" (`label`, `accent.text`). 32dp above, 12dp below.

### NewPostsPill
Floating under the top bar, `surface.3` pill with shadow, `label` "12 new posts" + arrow-up; tap scrolls to top and merges; auto-hides after scroll-to-top.

### LiveIndicator
Signal 8dp + pulse ring + `overline` "AIRING NOW" / "LIVE ROOM" in `accent.text`. Never more than one per card.

### GrainOverlay
4% opacity monochrome noise (tiled 256px PNG) over heroes, Welcome, share cards. Static under reduced motion (it is static anyway; the *drift* on Welcome is what stops).

---

## D. Composition rules for components
1. One accent fill per viewport (the primary action) — FollowButton in a hero, Post in a composer, the Create tab.
2. Hairlines, not boxes, separate feed items. Boxes only for embedded objects.
3. Every image has a blurhash and a placeholder; every list has a matching skeleton.
4. Every icon-only control has a content description; every toggle announces state.
5. Density adapts: rows can switch to `dense` (−8dp vertical) on expanded windows and TVs, never on compact.
