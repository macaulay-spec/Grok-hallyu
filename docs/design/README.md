# Hallyu — Master Product + UI/UX Design Specification

**Status:** v1.0 · September 2026 · answers the brief in `/Your work`
**Audience:** the engineers who will build Hallyu (Kotlin Multiplatform / Jetpack Compose), designers, and whoever runs the product.
**Rule of this document set:** if an engineer has to guess, the spec failed. Every screen defines purpose, hierarchy, components, actions, navigation, visual treatment, loading, empty, error and motion.

---

## How to read this

| # | Document | What it decides |
|---|---|---|
| 01 | [Product definition](01-product-definition.md) | What Hallyu is and is not, pillars, personas, jobs, the loop, principles, scope by release, success metrics |
| 02 | [Content model & rules](02-content-model-and-rules.md) | Entities, relationships, the spoiler system, visibility & moderation states, the catalog/provider abstraction (TMDB → Hallyu) |
| 03 | [Information architecture & navigation](03-information-architecture-and-navigation.md) | Tabs, full screen inventory, routes & deep links, stack/tab/modal/sheet behaviour, back behaviour, the tap → result table |
| 04 | [Design language](04-design-language.md) | Brand, the Signal, app icon, wordmark, colour tokens, typography (Latin + Hangul), spacing, shape, elevation, iconography, imagery, voice |
| 05 | [Component system](05-component-system.md) | Every reusable component: anatomy, variants, sizes, states, behaviour, accessibility |
| 06 | [Motion & haptics](06-motion-and-haptics.md) | Durations, easings, choreographies, reduced-motion mapping, haptic map |
| 07 | [Screens: Auth & Onboarding](07-screens-auth-onboarding.md) | Splash → Welcome → Sign in/up → Verify → Recovery → Onboarding 1–5 → Guest mode |
| 08 | [Screens: Home, Explore, Search](08-screens-home-explore-search.md) | Home (For You / Following, modules), Explore, Global search, Airing schedule, Genre browse |
| 09 | [Screens: Drama, Episode, Actor](09-screens-drama-episode-actor.md) | Drama Hub (6 sections), Episode screen, Actor page, Season handling |
| 10 | [Screens: Post, Comments, Shorts](10-screens-post-comments-shorts.md) | Post detail, threaded comments, Shorts viewer, Media viewer |
| 11 | [Screens: Create](11-screens-create.md) | Create hub, six composers, attachments, spoiler picker, drafts, upload states |
| 12 | [Screens: Watchlist & Collections](12-screens-watchlist-collections.md) | Watchlist (4 statuses), item editing, Collections list/detail/editor, Add-to-collection |
| 13 | [Screens: Activity, Profile, Settings](13-screens-activity-profile-settings.md) | Grouped Activity, Profile (own/other), Edit profile, Follow lists, Saved, every Settings page, Delete account |
| 14 | [System states & edge cases](14-system-states-and-edge-cases.md) | Loading/skeleton, empty, error, offline, deleted, blocked, private, unavailable media, update/maintenance, copy dictionary |
| 15 | [Accessibility](15-accessibility.md) | Dynamic type, screen readers, contrast, targets, reduced motion, captions, semantics — with per-component checklists |
| 16 | [Devices & adaptive layout](16-devices-and-adaptive-layout.md) | Window size classes, tablets, foldables, orientation, per-screen adaptations |
| 17 | [Personalization & ranking](17-personalization-and-ranking.md) | Signals, For You principles, explainability, cold start, notification relevance, privacy boundaries |
| 18 | [Implementation architecture (KMP / Compose)](18-implementation-architecture-kmp.md) | Module map, design-system module, navigation graph, data & caching, media pipeline, ingestion, moderation, analytics, performance budgets, QA, delivery phases |
| — | [`tokens/hallyu.tokens.json`](tokens/hallyu.tokens.json) | Machine-readable design tokens (W3C DTCG format) — source of truth for `HallyuTheme` |
| — | [`brand/`](brand/) | Vector app icon layers (adaptive foreground/background/monochrome, legacy 512, notification glyph), wordmark, lockup, `brand-preview.png` |

Read 01 → 02 → 03 → 04 first; they are the constraints everything else obeys. Screen documents can then be read independently.

---

## The ten decisions that shape everything

1. **Hallyu is the social layer for people who live inside K-dramas.** Not a database, not a tracker with comments, not TikTok with a Korean filter. The loop is *Discover → Follow → Watch → React → Discuss → Discover again*; every surface must push the user one step around it.
2. **The drama is the social object.** Every drama, season, episode and actor is a place you can enter, not a row you can look up. Content carries *context* (drama / season / episode / actor) as data, and the UI renders that context as a first-class strip on every card.
3. **Spoilers are a system, not a blur.** Four levels (none, episode, season, ending), computed against the viewer's own watch progress, with a protection level the user controls. The UI always says exactly what is about to be revealed.
4. **Five tabs: Home · Explore · Create · Activity · You.** Create opens a sheet, never a screen, so no tab loses its back stack. On medium/expanded windows the bar becomes a rail.
5. **Guests can look; members can act.** Explore, dramas, actors, episodes and posts are readable without an account. Any social or tracking action opens a contextual sign-in sheet that remembers intent and completes it after auth.
6. **One reaction vocabulary everywhere.** Loved · Cried · Screamed · Swooned · Laughed · Furious. It powers post reactions (tap = Loved, long-press = picker), the Reaction composer, and the Episode Reaction Meter.
7. **Six ways to create, one composer chassis.** Post, Reaction, Discussion, Review, Recommendation, Short share the same attachment, spoiler, draft and publish behaviour; only their fields differ.
8. **Restraint is the brand.** Near-black canvas, one accent (Rose) used only for meaning, one warm secondary (Amber) for ratings and warmth, typography carrying hierarchy, hairlines instead of shadows, no gradients except image scrims, one signature texture (film grain on heroes).
9. **Every state is designed.** Loading, skeleton, empty, error, offline, no results, first-time, guest, deleted, blocked, private, unavailable media — specified per screen with real copy, never "No data found".
10. **Provider-agnostic catalog.** TMDB feeds an ingestion layer that writes Hallyu's own catalog model; the app never sees provider field names. Attribution lives in About › Credits, never on product surfaces.

---

## Glossary

| Term | Meaning |
|---|---|
| **The Signal** | The brand device: a Rose dot. Means "on air / alive / new". Appears in the app icon, wordmark terminal, live indicators, unread markers, active tab. |
| **Fandom** | The implicit community around a drama or an actor. Following a drama makes you one of its *fans*; the count reads "12.4k fans". No user-created groups in v1. |
| **Context** | The set of entities a piece of content is *about*: drama, season, episode, actor(s). Rendered by the **Context strip**. |
| **Veil** | The spoiler-protection surface that hides content until revealed. |
| **Progress** | The viewer's own position in a drama: status + season + episode. Drives the veil. |
| **Room** | Informal name for an episode's discussion surface (the Episode screen's Discussion section). |
| **Tonight** | The Home module that surfaces followed dramas airing within ±24h (KST-aware, shown in local time). |
| **Reaction** | One of the six emotional responses; also the name of the lightweight content type. |
| **Verdict** | A review's 1–10 rating plus one-line summary. |
| **Window size class** | Compact (< 600dp), Medium (600–839dp), Expanded (≥ 840dp) — the adaptive layout breakpoints. |

---

## Reference material (what already existed, and how it was used)

- `/docs/HALLYU.md`, `/docs/blueprint-ui-ux.png`, the Expo prototype under `/app`, `/components`, `/lib`, and `/supabase/migrations/…_init.sql` were treated as **research**, per the brief. The prototype's near-black + magenta direction and the H-and-dot icon idea were kept because they are good; its navigation, cards, static data, flat comment model, fictional seed drama and layouts were **not** carried forward.
- Facts checked while writing this spec (September 2026): Korean broadcast grid (twin-night slots, ~22:00 KST, streaming shortly after), TMDB's attribution requirement and image size ladder, Google Play's UGC (report/block/terms) and account-deletion requirements, Android 16 / API 36 targeting, Material 3 window size classes, Supabase free-tier limits.
