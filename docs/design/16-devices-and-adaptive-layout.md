# 16 · Devices & Adaptive Layout

Hallyu is designed for Android first (small, normal and large phones, tablets, foldables) with an architecture that carries to iOS unchanged. Layouts adapt by **window size class**, not device type.

## 1. Window size classes and global behaviour

| Class | Width | Navigation | Margins | Columns | Notes |
|---|---|---|---|---|---|
| **Compact** | < 600dp | Bottom HallyuTabBar | 16dp | 1 (feeds), 3 (poster grids) | Portrait-locked except Shorts/MediaViewer |
| **Medium** | 600–839dp | HallyuNavigationRail (80dp) | 24dp | 1 reading column (max 640dp) centred, or list-detail | Tablets portrait, unfolded foldables portrait |
| **Expanded** | ≥ 840dp | Rail (80dp) · at ≥ 1,200dp: labelled drawer rail (240dp) | 32dp | 2 panes (list-detail) or content + right rail | Tablets landscape, desktop-class windows, Chromebooks |

Height classes matter too: **compact height** (< 480dp, phones in landscape) hides the Tonight rail's posters (text rows instead) and collapses heroes to 160dp.

## 2. Per-screen adaptation

| Screen | Compact | Medium | Expanded |
|---|---|---|---|
| Home | Single feed | Feed centred (640dp) | Feed (640dp) + right rail: Tonight (vertical), Fans like you, Trending conversations — modules leave the feed |
| Explore | Vertical stack | Same with wider rails (more items visible) | Two columns: left (Airing, Trending dramas, New); right (Conversations, Creators, Collections) |
| Search | Full-screen | Full-screen | Results as list-detail: results left (400dp), selected entity preview right |
| DramaHub | Hero full-bleed, tabs below | Hero 16:9 capped 360dp; poster shown | Two-pane: left column (poster L, actions, Where you are, Details, Cast rail) fixed 360dp; right: tabs + content. Activity section becomes a persistent right rail at ≥ 1,200dp |
| Episode | Stack | Centred column | Header left (still, meter, watched, prev/next), discussion right |
| Actor | Stack | Centred | Portrait + bio + filmography left; fandom posts right |
| PostDetail | Stack + docked composer | Centred 640dp | Post left (fixed), comments right with the composer docked in the right pane |
| Shorts | Full-screen 9:16 | 9:16 centred with dark side panels; comments sheet becomes a right panel (360dp) | Same; keyboard arrows navigate |
| Create hub | Sheet | Sheet (max width 480dp, centred) | Dialog-like centred sheet |
| Composers | Full-screen | Centred modal 600dp wide | Centred modal 720dp with the veil preview live in a right column |
| Watchlist | Segments + list | List-detail: segment list left, item detail (drama summary + progress) right | Same, three columns at ≥ 1,200dp (segments · list · drama) |
| Collections | 2-up grid | 3-up | 4-up; detail opens in the right pane |
| Activity | List | List-detail: tap opens the target in the right pane | Same |
| Profile | Stack | Header left column (avatar, bio, stats, favourites) 320dp; tabs right | Same, wider |
| Settings | Stack | List-detail (root left, page right) | Same |
| Media viewer | Full-screen | Full-screen | Full-screen with side arrows |

## 3. Foldables and postures
- **Tabletop posture (half-open, hinge horizontal):** Shorts → video on the top half, comments/controls on the bottom; Episode → still + meter top, discussion bottom; Media viewer → image top, caption/actions bottom. Everything else avoids placing controls across the hinge (use `WindowInfoTracker` fold bounds as an occlusion inset).
- **Book posture (hinge vertical):** list-detail naturally splits on the hinge; composers stay in one pane.
- **Continuity:** folding/unfolding preserves state and scroll; the navigation container swaps bar ↔ rail without resetting stacks.
- **Cover screens** (small outer displays, < 400dp wide, often short): treated as compact with compact height; the tab bar drops labels; heroes 140dp; composers open as full-screen with a single-line attachment bar.

## 4. Orientation
Compact: portrait-locked (except Shorts, MediaViewer, video playback). Medium/Expanded: both; layouts re-flow by size class, not by orientation.

## 5. Input modalities
- **Keyboard/mouse (Chromebooks, DeX):** hover states (8% overlay), focus rings, shortcuts: `/` focus search, `j/k` next/previous item in feeds, `r` react, `c` comment, `Esc` close sheets/modals, arrows in Shorts and MediaViewer.
- **Stylus:** no special handling beyond standard press.
- **TV / D-pad:** out of scope; focus semantics exist anyway.

## 6. Density and performance by class
- Expanded windows may switch lists to `dense` rows (−8dp) via a user setting (off by default).
- Image sizes requested scale with pane width, not screen width (a 360dp pane requests `w342` posters even on a 12" tablet).
- Shorts preloads 1 (compact cellular) · 2 (Wi-Fi) · 3 (expanded Wi-Fi).

## 7. Future platforms
The information architecture, tokens, components and screen specs are platform-neutral. iOS: same KMP core; Compose Multiplatform or SwiftUI shell mapping HallyuTabBar → UITabBar-like, sheets → UISheetPresentationController detents, predictive back → interactive pop. Web (later): the same size-class table applies; the tab bar becomes a top nav at expanded.
