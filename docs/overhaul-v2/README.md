# Hallyu — Complete UI/UX Overhaul · v2 "Everything changed"

An end-to-end redesign of **every screen**, in launch order, from app icon to system states.
This folder is the design deliverable: a self-contained, interactive HTML walkthrough plus the
reasoning ("what changed / why") attached to each screen.

## View it

Open `index.html` in a browser (no build step). It is a single static page that stitches
together the four parts in `parts/` and styles them with `styles.css`.

```
docs/overhaul-v2/
├── index.html      # assembled walkthrough (open this)
├── styles.css      # the overhaul design system (tokens + components)
└── parts/
    ├── p1.html     # 01 App icon + Splash · 02 Welcome · 03 Auth · 04 Onboarding
    ├── p2.html     # 05 Home · 06 Explore + Search · 07 Drama hub
    ├── p3.html     # 08 Episode detail · 09 Post card + detail · 10 Actor profile
    └── p4.html     # 11 Create · 12 Activity · 13 You/Profile · 14 Watchlist
                    # 15 Collections · 16 Settings · 17 Clips · 18 Live · 19 System states
```

Rebuild `index.html` from the parts with `./build.sh` (lives next to the parts in the source
workspace). The page is safe to serve statically.

## The design language (one shell, every screen)

- **True black `#000000`** canvas; surfaces `#0F0F10 / #161618 / #1C1C1F`.
- **Crimson `#E11D48` only where action lives** — never decoration.
- **Floating glass pill tab bar** with an elevated crimson Create circle.
- **Four worlds** (K-Drama, C-Drama, Anime, Hollywood) each re-tint the app with a 4% wash.
- **Motion** on `cubic-bezier(0.16,1,0.3,1)`, 80 / 180 / 320 / 480 / 700 ms; respects Reduce Motion.
- **Every state designed**: loading (skeletons), empty, error, offline, guest/gated.

## What changed, screen by screen

| # | Screen | Headline change |
|---|--------|-----------------|
| 01 | App icon + Splash | Wordmark's full-stop promoted to an icon; splash is the mark alone, no spinner. |
| 02 | Welcome | Confidence over collage; guest entry is a quiet text link. |
| 03 | Sign up / Sign in / Recovery | Labels above fields, sentence errors, one job per screen. |
| 04 | Onboarding | Five steps; world-picking is the emotional core. |
| 05 | Home | Utility first — Continue watching, airing-today, then social + live. |
| 06 | Explore + Search | Search-first with instant facets and a trending deck. |
| 07 | Drama hub | Parallax hero, spoiler-safe tabs, episode grid with progress. |
| 08 | Episode detail | Spoiler gate → watched reactions + thread; the screen that must be perfect. |
| 09 | Post card + detail | Reaction meter, spoiler veil, threaded replies. |
| 10 | Actor profile | Cinematic 4:5 portrait, Known for, Fans also follow. |
| 11 | Create sheet | Four intents, one sheet; composer with live spoiler toggle. |
| 12 | Activity | One inbox, live previews, crimson unread spine. |
| 13 | You / Profile | **Fan identity system** — world constellation + Choose Your Bias card. |
| 14 | Watchlist | Grouped queue (Watching / Up next / Someday) with airing badges. |
| 15 | Collections | Lists are first-class content; cinematic list detail. |
| 16 | Settings | Grouped cards; Your worlds & bias gets its own page. |
| 17 | Clips | Full-bleed vertical video, timestamped comments. |
| 18 | Live rooms | Synced player, floating reactions, plain-language lobby. |
| 19 | System states | Skeleton loading, helpful empties, calm errors, friendly offline, soft guest gate. |

## Shipped in real code (this branch)

The redesign is landing in the app itself, screen by screen, on `overhaul/v2-everything-changed`:

- **Google sign-in** is now a first-class door on every auth surface — `lib/auth.tsx`
  (`signInWithGoogle`, persisted `google` account, `provider: 'google'`), a reusable
  `components/ui/GoogleButton.tsx` (white surface, four-colour G at `assets/branding/google-g.png`),
  and the door placed on **Welcome**, **Sign in**, **Sign up**, the **guest gate sheet**, and the
  guest **You** tab. Email stays the crimson primary; Google is the quiet white door beside it.
- **Onboarding** world-picking tiles now carry each fandom's own tint when selected
  (K-Drama rose, C-Drama amber, Anime blue, Hollywood green) — the four worlds read as four worlds.
- **ReactionMeter** update-depth crash fixed (stable primitive dependency instead of object identity).

## Creative additions beyond the brief

- **Fan identity system on the profile** — your four worlds as a tinted constellation under your name.
- **Choose Your Bias (K-Pop)** — an artist/member/fandom picker that themes a badge to the artist's
  signature colour. Designed here; implementation deferred by request ("the K-pop feature can come later").
- **Reactions timeline** on the episode screen (scrubber over the reaction distribution) — designed intent.
- **Universe hues** — C-Drama jade, Anime violet, Hollywood gold, K-Pop magenta, each as a 4% wash.

## Code changes shipped with this design

- `components/feed/Reactions.tsx` — fixed a **"Maximum update depth exceeded"** crash: the
  `ReactionMeter` effect depended on the `counts` object identity, which (with
  `useNativeDriver: false`) restarted every frame. It now depends on a primitive `ratioKey`.
