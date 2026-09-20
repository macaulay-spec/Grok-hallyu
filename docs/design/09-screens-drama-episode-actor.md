# 09 · Screens: Drama Hub, Episode, Actor

---

## 9.1 Drama Hub

### Purpose
Entering the drama's world: identity, where you are in it, what its fans are saying, and every way onward (episodes, cast, media, related). Not a database row.

### Hierarchy
1. **Hero** — backdrop, title, status, the community line ("1.2k fans · 214 posts today · Ep 7 tonight").
2. **Primary actions** — Follow · Watch status · Share.
3. **Where you are** — your progress card (or "Start tracking").
4. **Sections** via sticky tabs — Overview · Community · Episodes · Cast · Media · Activity.

### Layout
- **DramaHero** (05 §B): backdrop 16:9 with grain and scrim; collapsing top bar (back, ⋯ = Share · Add to collection · Mute this drama · Report an issue with this drama · Suggest an edit). On compact: title `display` over the scrim bottom-left, `originalTitle` beneath; meta line "2024 · tvN · 16 episodes · 70 min · Romance, Melodrama"; **status pill**: `Airing · Sat–Sun 21:20 KST` with Signal / `Completed` / `Premieres Sep 26` / `Upcoming`; **community line** in `caption` `accent.text`.
- **Action row:** FollowButton `md` (primary → tonal "Following ✓"), WatchStatusButton `md`, HallyuIconButton share. One accent fill (Follow) until followed; then none.
- **Where you are** (members only): a compact card — `Watching · Ep 6 of 16` + progress bar + **+1** stepper + "Next: Ep 7 · Saturday 2:00 PM" (or "Ep 7 aired · 214 talking → Open room" when live). Untracked: single row "Track this drama" → WatchlistItemSheet.
- **Sticky HallyuTabRow:** Overview · Community · Episodes · Cast · Media · Activity (horizontal scroll, edge fades; deep link `?tab=`). Sections are pages under the tabs (swipeable); the hero collapses once and stays collapsed while switching.

### Overview
- **Synopsis** (`body`, 4 lines, "More" expands inline; spoiler-free by policy).
- **Where to watch:** platform chips with deep links (Netflix · Viki · …) + region note; JustWatch credit lives in About, not here.
- **Next / latest episode card:** `Ep 7 · Sat 2:00 PM` countdown or "aired 40m ago · 214 talking" → Episode.
- **How fans felt:** ReactionMeter (drama-level aggregate) + fan verdict line when available ("8.4 · 92% recommend · 312 reviews" in `warm`).
- **Top posts:** 2 PostCards (top 7 days) + "See community".
- **Cast:** ActorCard circle rail (top 8) + "See all".
- **Fans recommend this if you liked:** DramaCards rail from recommendation posts (secondaryDramaId).
- **Related dramas:** rail with reason chips (same writer · same lead · same trope).
- **Collections featuring this drama:** 2 CollectionCards.
- **Details:** key-value list (Network, Original run, Episodes, Runtime, Writer, Director, Also known as, Content rating).

### Community
- **Composer prompt row:** avatar + "Say something about Goblin…" (tap → CreateHub pre-scoped to drama) + quick Reaction glyph button.
- **Filter chips:** All · Discussions · Reviews · Reactions · Recommendations · Shorts · **Episode ▾** (EpisodePicker filter) · Sort: Top · Latest.
- **Feed:** PostCards with context collapsed to episode/actor only (drama is implied — the strip shows `Ep 9` or the actor chip); veils per 02 §3.
- Live banner at top when an episode is live: "Ep 7 room is live · 214 fans → Open".

### Episodes
- **Season selector** (only when > 1 season): HallyuChips "Season 1 · Season 2" or split-release names.
- **Bulk action row:** "Mark all watched" · "Mark watched up to…" (opens EpisodePicker).
- **EpisodeRows:** `Ep 1 … Ep 16` with title/date/post count/watched check/Signal; watched rows show a subtle check and the veiled synopsis becomes readable inline (2 lines, "More"); unwatched rows keep the synopsis veiled (SpoilerBlock compact "Synopsis hidden · Reveal").
- Upcoming episodes: `caption` "Sat 26 · 2:00 PM · reminder ▾" (per-episode reminder toggle).

### Cast
- Grid 3-up ActorCards (2:3 tile, name, character); sections **Main cast** · **Supporting** · **Crew** (director, writer as ListRows). Tap → Actor.

### Media
- Segmented: **Stills & posters** (provider images: backdrops 16:9 grid 2-up, posters 3-up, logos) · **From fans** (user images from posts in this fandom, 3-up masonry; each opens MediaViewer with the post link) · **Shorts** (ShortCard grid, v2.0). Veil applies to fan media with spoiler levels.

### Activity
- Stream of fandom events (ListRows with time): "Ep 7 aired · 214 posts in 2h", "Mina and 12 others started watching", "New review from Hana · 9/10", "Trending discussion: …", "1,000 fans milestone". Right column on expanded windows (16). Tap → target.

### Components
DramaHero, FollowButton, WatchStatusButton, progress card, HallyuTabRow, ReactionMeter, PostCard, ActorCard, DramaCard, CollectionCard, EpisodeRow, SpoilerBlock (compact), HallyuChip, ListRow, HallyuBanner.

### Actions
03 §5 plus: Mark watched up to…; per-episode reminders; Suggest an edit (form: field + note → ops queue); Add to collection; Mute drama; Share (URL + share card).

### Navigation
Pushed from anywhere; shared-element from posters; `?tab=` deep links; Back pops. From a stub (just imported), the page refreshes itself when ingestion completes (realtime) with a 160ms crossfade.

### Visual
The hero is the only immersive element; below it, sections use typography and hairlines. Fan score is `warm`, small. The status pill uses the Signal when airing.

### Loading
Hero renders immediately from the arguments passed (title, poster, backdrop blurhash); community line and tabs hydrate. Skeletons per section (Overview: synopsis lines, meter bars, 2 card skeletons; Episodes: 8 rows; Cast: 6 tiles). Stub state: banner "Just added — details are filling in", sections show skeletons up to 10s then partial content.

### Empty
- Community: **Nothing here yet.** *Be the first fan to say something about Goblin.* → **Post** · quick reactions row still shown.
- Episodes (upcoming drama): "Episodes appear when the schedule is announced" + Follow prompt.
- Cast unknown: "Cast details are on the way" (stub) — never blank tiles.
- Media › From fans: "No fan media yet" → Post a photo.
- Activity: "Quiet fandom — follow to see it grow".
- Fan verdict: hidden below 20 reviews (no "N/A").

### Error
Hero always renders (cached args); failed sections show inline ErrorState rows with Retry; global failure without cache → full ErrorState with Retry and "Open in browser" fallback link.

### Motion
Poster shared element; hero collapse; tab indicator slide; progress stepper roll; live banner slide-in; meter bars grow 400ms on first appearance (static under reduced motion).

---

## 9.2 Episode

### Purpose
The room. One episode's identity and the conversation around it — protected for those who have not reached it.

### Hierarchy
1. **Context header** — drama · `Episode 7` · title · air time · watched state.
2. **Gate / protection status** (if behind).
3. **How fans felt** — ReactionMeter.
4. **Discussion** — posts scoped to this episode.
5. Previous / next episode.

### Layout
- Top bar `stack`: back · `Goblin` (tap → DramaHub) · ⋯ (Share episode · Remind me · Report).
- **Header block:** still 16:9 (veiled until watched: blurred + "Still hidden") · `overline` "SEASON 1" (only when > 1) · `display` **Episode 7** (title beneath if any) · `caption` "Aired Sat, Sep 12 · 2:00 PM (22:00 KST) · 68 min" · **Watched toggle** (tonal button `Watched ✓` / `Mark watched`) · synopsis (veiled until watched).
- **Gate** (first entry when behind, 02 §3.5): sheet **Have you watched Episode 7?** → *I've watched it* / *Just peeking*. Peeking → persistent HallyuBanner "You're peeking — spoilers stay hidden · Mark watched".
- **Live strip** (aired < 24h, drama airing): LiveIndicator "LIVE ROOM · 214 fans here in the last hour".
- **React row:** six ReactionButtons as a horizontal pill (the user's episode reaction, if any, highlighted) — tapping posts an episode-scoped Reaction (with an optional one-line sheet "Add a line?" that can be skipped). Below: ReactionMeter.
- **Discussion:** filter chips All · Discussions · Reactions · Reviews-after-this-ep · Shorts; sort Top · Latest; **composer prompt row** "What did you think of Ep 7?" → ComposerDiscussion pre-scoped; NewPostsPill via realtime; PostCards (context collapsed to nothing — the episode is implied — actor chips remain).
- **Pinned prompt:** when the room has < 3 posts, the Hallyu editorial account's prompt post is pinned ("Ep 7 — rooftop scene. Thoughts?").
- **Prev / Next:** bottom bar with `◀ Ep 6` and `Ep 8 ▶` (Ep 8 disabled with "Airs Sunday" when not yet aired); swipe horizontally on the header also navigates.

### Components
HallyuTopBar, SpoilerBlock (still + synopsis), watched toggle button, HallyuBanner, LiveIndicator, ReactionButton row, ReactionMeter, HallyuChip, PostCard, NewPostsPill, pager controls.

### Actions
Mark watched (sets progress to this episode — if it skips episodes, dialog "Also mark Ep 4–6 watched?" Yes / Just this one → *just this one* keeps progress but records the episode as seen); react; discuss; open posts; prev/next; share; remind me (for upcoming).

### Navigation
Pushed from DramaHub Episodes, Tonight, Context strips, notifications (`episodeAired` → this screen, Discussion scrolled), deep links. Prev/next replace in place (horizontal shared axis) so Back returns to the origin, not the previous episode.

### Visual
Header still is the only image; discussion is a plain feed. Live strip uses the Signal. The veil for the still is a blurred image (not a flat block) so the room still feels like the episode.

### Loading
Header from arguments; meter skeleton (6 bars); 3 PostCard skeletons.

### Empty
- No posts yet: pinned prompt + EmptyState **Nobody's said anything yet.** *You just watched it — go first.* → **React** (fast) · **Start a discussion**.
- Not aired yet: header shows countdown "Airs in 2d 4h"; discussion replaced by "Room opens when the episode airs" + Remind me + "Predictions" pre-air discussion filter (allowed; spoiler level none by policy for predictions).

### Error
Meter failure: hidden. Posts failure: inline ErrorState + Retry. Progress update failure: toggle reverts + toast "Couldn't update — try again".

### Motion
Gate sheet; watched check-fill then veils reveal in stagger; reaction burst; meter growth; prev/next horizontal shared axis; live pulse.

---

## 9.3 Actor

### Purpose
A discovery bridge with fandom warmth: who they are, what to watch them in, who talks about them.

### Hierarchy
1. Identity — photo, name, Korean name, one-line "Known for".
2. Follow.
3. Known for (posters) → filmography.
4. Fans' posts and trending.
5. Related actors.

### Layout
- Top bar `collapsing` (name fades in).
- **Header:** profile image 2:3 as a soft backdrop (blurred, 30%) with a sharp 96dp circle portrait; `headline` name; `caption` Korean name (Hangul) · born year (if available); `caption` "12.4k fans"; FollowButton `md`; Share icon.
- **Bio:** 3 lines, "More" expands (provider bio, editable by ops).
- **Known for:** DramaCards rail (top 6 by fans).
- **Filmography:** HallyuTabRow **Dramas · Movies · Variety** (only tabs with content); list grouped by year descending: poster S · title · role/character · year · status pill; items not yet in Hallyu show "Import" ghost `sm` (ingests then opens).
- **From the fandom:** PostCards whose context includes this actor (Top · Latest chips) with a composer prompt "Post about Gong Yoo…".
- **Often works with:** ActorCard circle rail (derived from shared casts).
- **Where next:** "Fans of Gong Yoo also follow" (actors) · "Collections featuring their dramas".
- Footer: `caption` "Photos and filmography via our catalog provider · see Credits".

### Components
HallyuTopBar collapsing, HallyuAvatar 96, FollowButton, DramaCard, HallyuTabRow, ListRow with poster, PostCard, ActorCard.

### Actions
Follow (adds actor posts to Following; Activity › Drama category carries "New drama announced with Gong Yoo" in v1.5); tap credits; import; post about; share; ⋯ → Report an issue / Suggest an edit / Mute actor.

### Navigation
Pushed from cast grids, Context strips, search, other actors. Back pops.

### Visual
Portrait-led; quiet; the blurred backdrop is the only "atmosphere". No stats dashboard — one fans count.

### Loading
Header from arguments (name, image); bio and filmography skeleton (4 rows); posts skeleton (2).

### Empty
- Filmography unknown (stub actor): "Filmography is filling in — check back in a moment" (auto-refresh when enrichment completes).
- No fan posts: **No posts about Gong Yoo yet.** → **Be the first**.
- No collaborators: section hidden.

### Error
Section-level retry rows; header always renders; provider image missing → initial-on-hue avatar.

### Motion
Header portrait scales 0.96 → 1 on entry; filmography tabs slide; posts insert with fade.
