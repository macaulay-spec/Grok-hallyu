# 11 · Screens: Create

Create is the product's major action. Six creation types share one chassis (attachments, spoiler, drafts, publish, errors) and differ only in fields and card rendering.

---

## 11.1 Create hub (sheet)

- **Purpose:** choose *what kind* of thing to make, in one tap, with context already attached when the user came from an entity.
- **Layout:** HallyuBottomSheet `content`; title `title` **Create**; if opened from an entity, a ContextStrip row "Talking about · Goblin · Ep 9" with × ; list of six ListRows (56dp, glyph 24 + title `titleSmall` + `caption` description), last-used type first, then the default order:
  1. **Post** — Text, photos and context.
  2. **Reaction** — How you feel, in one tap.
  3. **Discussion** — Start a conversation.
  4. **Review** — Your verdict on a drama.
  5. **Recommendation** — Tell fans what to watch.
  6. **Short** — A vertical video. *(hidden until v2.0; "Coming soon" tag if flagged on)*
  Footer link: **Drafts (2)**.
- **Actions:** row → composer modal (sheet replaced by the modal); Drafts → Drafts screen.
- **States:** guest → AuthGate instead; terms not yet accepted (legacy accounts) → inline Terms acceptance step before the list; offline → rows remain (drafts work offline; publish queues), banner "You're offline — we'll post when you're back".
- **Motion:** sheet up; rows stagger 20ms.

## 11.2 The composer chassis (shared by all six)

**Frame:** full-screen modal; top bar: **Close (×)** left · type title centre (`title`) · **Post** primary `sm` right (label per type: Post · React · Start · Publish · Recommend · Post). Bottom **attachment bar** docked above the IME: `image` · `videocam` (Short only) · `movie` (drama) · `person` (actor) · `tag` (episode; enabled after a drama) · `visibility_off` (spoiler) · `#` · `@` · overflow (Save draft · Drafts · Preview veil).

**Context section** (rendered as editable rows under the fields — "the context becomes part of the post"):
```
Talking about   Crash Landing on You            ›   ×
Episode         Episode 12                      ›   ×
Also about      Hyun Bin, Son Ye-jin            ›   ×
Spoiler         Episode 12 spoiler              ›
```
Each row opens its picker; × removes. Rules: Episode requires a drama; Spoiler auto-sets to *Episode 12* when an episode is picked (author can lower it); *Ending* is offered when the drama is completed; removing the episode drops the spoiler to *Season* if a season is set, else *None* with a nudge "Contains spoilers? Mark them".

**Validation & requirements per type**

| Type | Required | Optional | Limits |
|---|---|---|---|
| Post | body or media; **context strongly nudged** (a persistent hint under the field: "Add a drama so its fans can find this") | drama · episode · actors · spoiler · images ≤ 4 · hashtags · mentions | body 1,000 |
| Reaction | drama; reaction | episode; one line | 140 |
| Discussion | drama (or episode/season); title | kind tag; body; images ≤ 4; spoiler | title 90 · body 5,000 |
| Review | drama; rating 1–10; verdict line | body; recommend tags; spoiler section; "after Ep N" (auto from progress when watching) | verdict 120 · body 5,000 |
| Recommendation | drama; body | "if you liked" second drama; mood tags | 500 |
| Short | video 3–60s; drama nudged | caption; episode; actors; spoiler; cover frame; hashtags | caption 300 |

**Pickers (bottom sheets, `full` detent with search):**
- **DramaPicker:** search field; sections *Your watchlist* (Watching first) · *Recent* · *Popular*; results as DramaCard compact rows; provider import row at the end. Single-select (Recommendation's second drama uses the same picker).
- **EpisodePicker:** season chips (if any) + episode grid (6 per row: `1 … 16`), episodes beyond the user's progress marked with a subtle veil glyph ("You're on Ep 6 — posting about Ep 9 marks it as a spoiler"); "General (no episode)" option; the latest aired episode is pre-highlighted.
- **ActorPicker:** cast of the selected drama first (with roles), then search; multi-select ≤ 3 as input chips.
- **SpoilerPicker:** radio list — *No spoilers* · *Episode spoiler (Ep 12)* with an episode stepper · *Season spoiler (S1)* · *Ending spoiler* — each with one explanatory line; footer **Preview how it looks veiled**.
- **CollectionPicker** (used elsewhere) — see 12.

**Media:**
- Images: system photo picker (Android Photo Picker, no storage permission); thumbnails 96dp in a horizontal strip with × and drag-to-reorder; tap → crop/rotate sheet (aspect free, 4:5, 1:1, 16:9); alt text field per image (sheet, encouraged: "Describe this image"); client-side resize/compress before upload; EXIF stripped.
- Video (Short): picker → trim sheet (3–60s, scrub handles, current duration label) → cover frame picker (scrub + "Use frame") → returns to the composer with a 9:16 preview tile; upload starts immediately in the background with a progress ring on the tile; publish is allowed before upload completes (post enters `processing`).

**Drafts:** autosave every 3s and on background; Close with content → dialog **Save draft? · Discard · Keep editing**; Drafts screen lists drafts by type with context and time; opening restores everything including media references (re-picked if missing → "1 photo is no longer available").

**Publish:** optimistic — the modal dismisses immediately, a snackbar **Posted to Goblin · Ep 9 · View** appears, the card is inserted at the top of Following/Profile with a subtle "Sending…" state until the server confirms; on failure the card shows **Not posted · Retry · Edit** and the draft is preserved. Rate limit → the Post button is disabled with the copy "You're posting fast — try again in 12 min" before the user writes.

**Preview veil:** overflow → renders the card exactly as a fan behind the spoiler line would see it (SpoilerBlock with the label), with "Looks right" to return.

**Accessibility:** every attachment row is a button with a description ("Talking about, Crash Landing on You, change"); pickers trap focus; counters announce at 90%; the Post button announces disabled reasons ("Add a drama to react").

## 11.3 Post composer
- Fields: avatar + body field (`filled-plain`, placeholder "What's on your mind about K-drama?" or "What did you think of Ep 9?" when scoped) · media strip · context rows · hashtag/mention typed inline with autocomplete sheet (v1.5).
- Loading: none on open; media thumbnails show progress rings.
- Empty: Post disabled until body or media exists.
- Error: upload failure per thumbnail (⚠ + Retry/Remove); publish failure as chassis.
- Motion: chassis.

## 11.4 Reaction composer (fast path — a sheet, not a modal)
- HallyuBottomSheet `content`: context row (drama · episode, editable) · six 56dp reaction glyphs in a row with labels · optional single-line field "Add a line (optional)" · **React** primary. Tapping a glyph selects it (scale pop); pressing React publishes and closes with a burst toast **Cried · Goblin · Ep 9**.
- From an Episode screen the context is locked (only the reaction and line are asked); the sheet auto-publishes on glyph tap when the user has enabled "One-tap reactions" (Settings › Content, default on) — the line field then appears *after* publishing as "Add a line? (10s)" that edits the just-posted reaction.
- States: guest → AuthGate; error → "Couldn't react — Retry"; duplicate reaction on the same episode → replaces the previous one (toast "Updated your reaction").

## 11.5 Discussion composer
- Fields: kind chips (General · Theory · Ending · Character · Scene · Question) · **Title** field (`title` style, 90 chars, required) · body (`filled-plain`) · media strip · context rows (scope shows "Talking about Goblin · Episode 9" or "· Season 1" or drama-wide).
- Choosing **Ending** sets spoiler = Ending automatically; **Theory** on an airing drama keeps spoiler at the attached episode.
- Empty: Start disabled until title + drama. Error: chassis.

## 11.6 Review composer
- Fields: drama row (required; pre-filled from the origin) · **Rating** — a 1–10 horizontal slider with large `display` `warm` number and haptic ticks (tap a number or drag) · **Verdict line** (120) · body · recommend tags (multi-select chips: Slow burn · Comfort · Devastating · Binge-able · Great OST · Strong female lead · … ≤ 4) · **Spoiler section** toggle → a second body field that will render behind an author-marked veil · "after Ep N" tag auto-shown when the user's status is `watching` (they may remove it).
- If the user has not tracked the drama: prompt "Mark Goblin as Completed?" with one tap (keeps flow).
- Empty: Publish disabled until rating + verdict line. Error: chassis.

## 11.7 Recommendation composer
- Fields: **Drama** (required) · body "Why should fans watch it?" (500) · **If you liked…** second drama (optional) · mood tags (≤ 3).
- Renders as the recommendation card; also feeds Explore's "Fan recommendations" and the drama's "Fans recommend this if you liked".
- Empty: Recommend disabled until drama + body ≥ 20 chars (prevents empty recs). Error: chassis.

## 11.8 Short composer (v2.0)
- Flow: pick video → trim → cover → composer (9:16 preview tile with upload ring, caption field, context rows, spoiler, hashtags) → Post.
- Constraints shown up-front: "3–60 seconds · vertical works best · ≤ 200 MB"; non-vertical videos show "Will be letterboxed".
- Processing: after publish, the profile shows the Short card with "Processing…" until ready; push "Your Short is live" when done (System category); failure → "Couldn't process this video · Try another file".
- Copyright notice line under the picker: "Only post edits you made. Studios can request removal." → Guidelines link.

## 11.9 Drafts
- List grouped by type; each row: type glyph · first line · context · "Edited 2h ago" · ⋯ (Delete). Swipe to delete with Undo. Empty: **No drafts.** *Half-written thoughts live here.* Error: local storage only — no network states.
