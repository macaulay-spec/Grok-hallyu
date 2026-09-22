# 08 · Screens: Home, Explore, Search, Schedule, Genre browse

---

## 8.1 Home

### Purpose
The personalised, living front page: what is airing, what your fandoms are saying, what your people posted — with an editorial rhythm rather than a grid.

### Hierarchy
1. **Tonight** (only when relevant) — the most time-sensitive thing in the product.
2. The feed itself (For You or Following).
3. Inline modules that widen the graph, capped so they never dominate.

### Layout (top → bottom)
- **HallyuTopBar `root`:** wordmark 22dp left; right: `calendar_month` → AiringSchedule, `search` → Search. (No avatar; that lives in the You tab.)
- **HallyuSegmentedControl:** **For You** · **Following** — sticky under the top bar; swipe between them.
- **Tonight rail** (For You and Following, when ≥ 1 followed drama has an episode airing within −24h…+24h): SectionHeader eyebrow `overline` "TONIGHT" with LiveIndicator when any episode has aired; horizontal EpisodeCards `tonight` (poster S, `Ep 7`, "aired 40m ago · 214 talking" or "in 3h · Sat 22:00 KST"), first card is the most active room. Tap → Episode. "See week" → AiringSchedule.
- **Continue the conversation** (For You, at most one, when the user is `watching` a drama whose latest aired episode they have not visited): a single conversational card — poster M, "Goblin · Ep 9 aired yesterday", top discussion title, avatars of 3 fans, buttons **Open room** · **Mark watched**.
- **Feed:** PostCards of all variants (10, 05 §C). For You shows a `reasonLine` on non-followed sources.
- **Inline modules** (For You only; max one per 6 items; each type at most once per session unless refreshed): *Fans like you* (3 people rows + Follow) · *Because you finished X* (drama rail, 4) · *Trending in the Goblin fandom* (2 discussion cards) · *Shorts for you* (rail of 4 ShortCards, v2.0) · *Collections fans are saving* (2 CollectionCards) · *Add a photo* (first session only).
- **End of feed:** "You're all caught up" + **Explore more** button (Following); For You is infinite.

### Components
HallyuTopBar, HallyuSegmentedControl, SectionHeader, EpisodeCard `tonight`, LiveIndicator, PostCard (all variants), ReactionCluster, DramaCard `vertical`, CollectionCard, ShortCard, NewPostsPill, HallyuTabBar, PullToRefresh, HallyuBanner (offline / guest).

### Actions
As in 03 §5. Additionally: swipe left/right switches segments; pull to refresh; **Following filter chips** (under the segmented control, only in Following): People · Dramas · Actors — multi-select, persisted; long-press a module header → "Show less of this".

### Navigation
Root of the Home tab. Everything pushes onto the Home stack. Deep links land here with synthetic stacks.

### Visual
No boxes; hairline separators; the Tonight rail has 12dp gutters and edge fades; the segmented indicator is a 2dp `text.primary` underline (accent is reserved for the Signal in Tonight). Reason lines in `text.tertiary`.

### Loading
First paint from cache instantly (last feed persisted). Fresh load: Tonight skeleton (3 cards) + 4 PostCard skeletons (avatar circle, two lines, image block). Pagination: 2 skeleton cards at the end, never a spinner.

### Empty
- For You, new user with follows: never empty (server backfills with fandom top posts and trending).
- For You, zero follows (skipped onboarding): EmptyState **Your drama universe is empty.** *Follow a few dramas and people to fill it.* → **Explore dramas** · secondary "Find people". Trending posts are shown beneath so the screen is not dead.
- Following, no follows: EmptyState **Nobody to follow yet.** → **Find fans like you** (opens the people list).
- Following, follows but no posts: **Quiet for now.** *Your people haven't posted recently.* + Tonight rail + "Discover more fans".
- Tonight: hidden when nothing airs — never an empty rail.

### Error
- Initial load failure with cache: banner "Couldn't refresh — showing earlier posts" + Retry; content remains.
- No cache: full ErrorState **We couldn't load your feed.** *Check your connection and try again.* → Retry.
- Pagination failure: inline row "Couldn't load more — Retry".
- Action failure (react/save): optimistic UI rolls back + toast "Couldn't save that. Try again."

### Motion
Segment switch crossfade; NewPostsPill; reaction bursts; tab bar hide on scroll; Tonight live pulse; modules insert with fade + slide; pull-to-refresh Signal indicator (06).

---

## 8.2 Explore

### Purpose
The discovery engine: what is trending, what is airing, what is new, who to watch, where the conversations are — and a door to Search.

### Hierarchy
1. Search field (door, not the experience).
2. **Airing this week** (time-sensitive, editorial).
3. **Trending dramas** (large editorial lead + list).
4. **Trending conversations**.
5. Everything else in decreasing urgency.

### Layout
- HallyuTopBar `root`: `headline` **Explore**; right: none (search field is below).
- HallyuSearchField (button variant) — 16dp margins, sticky.
- **Airing this week:** 7 day chips (Mon…Sun, today highlighted, localised) → horizontally scrolling DramaCards `vertical` for the selected day with "22:00 KST · 2:00 PM" caption; "Full schedule" → AiringSchedule.
- **Trending dramas:** first item is an **editorial lead** — full-width backdrop card (16:9, grain, scrim) with title `titleLarge`, "▲ 3 · 1.4k posts today", Follow `sm`; items 2–6 are horizontal DramaCards with rank numbers (`display` `text.tertiary` "2"). "See all" → SearchResults(type=dramas, sort=trending).
- **Trending conversations:** 3 discussion cards (compact: title, context, replies count, avatars) → TrendingConversations.
- **New this month:** DramaCards rail (premieres) with premiere dates.
- **Popular actors:** ActorCards circle rail → SearchResults(type=actors, sort=popular).
- **Shorts (v2.0):** 2-row ShortCard rail → ShortsHub.
- **Creators to follow:** people rows with reason ("Reviews you'd like", "Edits from your fandoms").
- **Genres & moods:** two rows of HallyuChips (assist) → GenreBrowse; no big tiles.
- **Collections fans love:** CollectionCards grid 2-up (4 items) → SearchResults(type=collections, sort=saves).
- **Recommended for you:** DramaCards rail with reason line.
- **Community trends:** small text list "Most-followed this week", "Most-cried episode", "Fastest-growing fandom" — each a tappable row.

### Components
HallyuSearchField, day chips (HallyuChip filter), DramaCard (vertical/editorial lead/horizontal ranked), discussion compact cards, ActorCard, ShortCard, HallyuChip assist, CollectionCard, SectionHeader, ListRow.

### Actions
Day chip → filters rail (no navigation); every card → its entity; "See all" → list screens; long-press poster → quick actions; chips → GenreBrowse.

### Navigation
Root of Explore tab. Search pushes. Re-tap tab → top.

### Visual
The only "large immersive" element is the editorial lead; everything else alternates horizontal rails and compact lists. Rank numbers in `text.tertiary` create rhythm without boxes.

### Loading
Section-by-section skeletons in layout order; sections render as they arrive (no all-or-nothing). Day rail skeleton: 4 posters.

### Empty
- A day with no airing followed-or-popular dramas: rail shows "Nothing airs on Wednesdays this week" + "See full schedule".
- Sparse platform (early days): Trending conversations hides when < 3 qualify; Creators hides when < 3. Sections never show placeholders — they collapse.

### Error
Per-section inline ErrorState row ("Couldn't load trending · Retry"); other sections unaffected. Full failure with cache → banner; without cache → full ErrorState.

### Motion
Rails scroll with edge fades; the lead card's backdrop has 0.3× parallax on vertical scroll; chips select with 160ms fill.

---

## 8.3 Search (global)

### Purpose
Find any entity — including dramas not yet in Hallyu — and get to it in two taps.

### Hierarchy
1. The field (focused, keyboard up).
2. Before typing: recents and suggestions.
3. While typing: grouped typeahead.
4. After submit: grouped results with type tabs.

### Layout
- Top: back + HallyuSearchField (live) + Cancel.
- **Idle:** *Recent searches* (chips with × , "Clear all") · *Trending searches* (list, 5) · *Your fandoms* (chips of followed dramas → DramaHub).
- **Typing (≥ 2 chars, 200ms debounce):** grouped typeahead — Dramas (3: poster S, title, year · status), Actors (2: avatar, name, known for), People (2: avatar, name, @handle), then a row "Search posts for '…'" and "Search episodes: Goblin ep 9" when the query matches `<title> ep <n>` / `<title> e<n>` / `<title> episode <n>`.
- **Results (submit or "See all"):** HallyuTabRow **Top · Dramas · Actors · People · Posts · Episodes · Collections**. *Top* interleaves the best of each with section headers. Each type has its list layout (DramaCard horizontal with FollowButton; ActorCard rows; people rows with FollowButton; PostCards compact; EpisodeRows with drama context; CollectionCards rows). Sort/filter chips per type (Dramas: Relevance · Trending · Newest · Year; Posts: Top · Latest; People: Relevance · Followers).
- **Provider import row** (Dramas tab, always at the bottom of results, and as the primary empty-state action): "Not finding it? **Search our catalog provider**" → shows provider matches (poster, title, year, "Not in Hallyu yet") → tap → ingest (spinner in row, 1–3s) → DramaHub opens in `stub` state with a "Just added — details are filling in" banner.

### Components
HallyuSearchField, HallyuChip, ListRow, DramaCard horizontal, ActorCard row, PostCard compact, EpisodeRow, CollectionCard row, HallyuTabRow, EmptyState, provider import rows.

### Actions
Tap result → entity (query saved to recents); Follow inline; long-press drama → quick actions; clear; cancel → back.

### Navigation
Pushed from Explore (and from Home/Drama search icons). Results tabs are in-place. Back from results returns to typing state with the query intact; second Back pops.

### Visual
Dense lists, 56–72dp rows, section headers `overline`. Matching substrings in results are bolded.

### Loading
Typeahead: no skeleton (results replace in place; a 16dp spinner in the field's trailing slot). Results: 6-row skeleton per tab.

### Empty
- No typeahead matches: single row "No matches yet — keep typing or press search".
- No results: EmptyState **No results for "Starlight".** *Check the spelling, try the Korean title, or search our catalog provider.* → **Search provider** (Dramas) / for People: "No one with that name yet"; for Posts: "Nothing posted about that yet — be the first" → CreateHub.
- Provider also empty: "Not in our provider either. Request it" → sends a catalog request (toast).

### Error
Typeahead failure: silent (keep previous), retry on next keystroke. Results failure: ErrorState with Retry; recents still usable offline (local). Import failure: row error "Couldn't import — Retry".

### Motion
Results crossfade on tab change; import row spinner → check → shared-axis push to DramaHub.

---

## 8.4 Airing schedule — "This week in K-drama"

- **Purpose:** the broadcast grid as a product: what airs when, in your time.
- **Layout:** top bar `stack` title **This week**; sticky week strip (7 day columns with date, today marked with the Signal, tap to jump); vertical list grouped by day → time slot (`overline` "22:00 KST · 2:00 PM YOUR TIME") → EpisodeRows (poster S, drama title, `Ep 7 of 16`, network, FollowButton `sm` or "Following" tonal, live Signal when aired within 24h). Filter chips: **Following only** (default when the user follows ≥ 3 airing dramas) · All · Netflix · Viki · Disney+ (platform filters from catalog data).
- **Actions:** row → Episode (if aired) or DramaHub (if not yet); Follow inline; add to calendar (⋯ → system calendar intent with local time).
- **Navigation:** pushed from Home/Explore; `?day=` deep link scrolls to that day.
- **States:** loading = 3 day groups of 2-row skeletons; empty day = "Nothing on Wednesday — a good night to catch up" + Watchlist link; empty week with Following filter → "None of your dramas air this week" + toggle to All; error = ErrorState + Retry, cached week shown if available.
- **Motion:** day strip indicator slides; list scrolls to the day with 400ms.

## 8.5 Genre / tag browse
- Top bar title = genre name (`headline`); subtitle count; sort chips (Popular · Trending · Newest · Top rated (fan score) · A–Z); secondary filter chips: Status (Airing · Completed), Length (≤ 8 · 12 · 16 · 20+), Decade; results in a 3-column poster grid (DramaPoster + title + year) with infinite scroll; "Fans also browse" chips at the top for adjacent tags.
- States: skeleton grid of 9; empty (over-filtered) → "Nothing matches these filters" + **Clear filters**; error inline with Retry.

## 8.6 Trending conversations
- List of discussion cards across all fandoms ranked by 6h velocity, with filter chips: All · My fandoms · Airing now · Theories · Endings. Each card shows the context, title, reply count, "+120 in the last hour", 3 avatars. Tap → PostDetail.
- States: skeleton 5 cards; empty (My fandoms) → "Your fandoms are quiet — start something" → CreateHub(Discussion); error inline.
