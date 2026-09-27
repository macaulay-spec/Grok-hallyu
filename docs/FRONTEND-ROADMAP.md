# Hallyu — frontend roadmap

Companion to the independent cross-fandom research (27 Sep 2026) and to this repo's own
`docs/PRODUCT-REPORT.md`. This document is about **this codebase**: what it already does well, what to
change in the UI/UX, and which research findings are worth buying with real engineering effort.

Written after the backend was removed (see `backend/README.md`). The app is now a frontend-only demo
build: local accounts, local writes, seeded social content, and a drama/actor catalog read from TMDB
directly by the client.

---

## 1. Where the product actually stands

Verified by reading the code, not the docs.

**Genuinely strong — protect these.**

| Asset | Why it matters |
| --- | --- |
| Design token system (`constants/theme.ts`) | One near-black canvas, one accent, a real type scale, window size classes, motion tokens. Most apps at this stage have ad-hoc hex values. |
| Spoiler machinery (`lib/spoiler.ts`, `SpoilerBlock`, veiled posts/comments) | The research's #2 wedge, *already built*: spoilers default from watched state, not from voluntary tags. |
| Editorial home (`app/(tabs)/index.tsx`) | Tonight → Up next → posts *interleaved* with shorts/dramas/people/discussions. Not a firehose. Directly contradicts the "generic feed" the research warns about. |
| Offline-first write path (`lib/data/sync.ts`, `lib/store.tsx`) | Optimistic writes, coalescing outbox, rollback with Retry, "Couldn't post · Retry · Discard" strips. This is the hardest part of a social app and it is done. |
| Boot diagnostics (`lib/boot.ts`, `lib/crash.ts`) | A breadcrumb trail and the last uncaught error render on the splash screen. Rare, and it is why the cold-boot crash was findable at all. |
| Empty states, skeletons, a11y | Every empty state is authored; `useLoad` holds skeletons behind a 150 ms rule; roles/labels are set; reduce-motion, true-black, data-saver and quiet hours exist as preferences. |

**Where it is thin.**

1. **Discovery is keyword-only.** Search is substring matching (`selectors.searchLocal`) over cached
   titles; Explore is editorial rails. Nothing understands *intent*.
2. **Reasons exist but are barely surfaced.** `Ranked.reason` is computed and rendered on the home
   feed, then not used on Explore, search results or related titles.
3. **No way to say "not for me".** `muteDrama` / `mutedDramas` exist in the store and in settings, but
   no drama card offers it. There is no "broaden beyond" control.
4. **Episode rooms are topic lists**, not rooms. Gating exists; presence and density do not.
5. **Shorts are prominent** (third module on Home, a full-screen route, an upload flow) and are the
   single feature both this repo's audit and the independent research say not to lead with.
6. **Onboarding never asks what to exclude**, so it cannot build a cross-fandom profile deliberately.
7. **"Hallyu" reads Korea-only** — fine for a K-drama-led entry, a real problem the moment the
   catalog broadens. The name needs a descriptor, not a rebrand.

---

## 2. What to take from the research, and what it costs here

Ordered by value ÷ effort. Each line names the surface so it can be scheduled.

### P1 — Taste-aware discovery (the one thing to build next)

The research's strongest wedge, and the app is unusually well-positioned for it: `Drama` already
carries `genres`, `tags`, `status`, `episodeCount`, `rating` and `network`, and every TMDB result is
adopted into the same record shape.

- **Vibe search.** One natural-language box ("healing slow-burn, no love triangle, completed, short")
  parsed into structured filters — mood/trope, pacing, completion status, length, network — scored
  against the local catalog and TMDB `discover`. Replaces blind substring search on the Explore and
  Search screens.
- **Explainable results.** Every result card gets a "why this matched" line (trope matched, length,
  status) reusing the existing `reason` slot on `DramaCard`. The research is explicit that
  transparency is the differentiator against OTT algorithms.
- **Taste profile from behaviour.** Watchlist states + likes + completed titles should feed the match.
  No new questionnaire: onboarding genres already exist and `recommendedDramas` already reads them.
- **Shareable recommendation card.** A rendered "our top 10 for this mood" card deep-linked into the
  app. `/p/[id]` deep links already exist; this turns discovery into the organic growth loop the
  research asks for.

*Gate: repeat discovery actions per user per week, and shared cards seen in the wild.*

### P2 — Spoiler-safe episode rooms (the #2 wedge, half-built)

- Promote the existing veil from a *setting* into the room's entry rule: opening episode N requires
  marking N watched, and visibility derives from watched state automatically (the machinery is in
  `lib/spoiler.ts`; it needs to be the default, not a preference).
- One-tap "I'm caught up" inside the room, next to the composer.
- **Density over breadth**: open rooms for a small number of currently airing shows only. An empty
  room is worse than a busy thread, and the app can already compute what is airing
  (`selectors.airingEpisodes`).
- Spoiler reports and one-tap mod actions already have plumbing; wire them to the room.

*Gate: ≥50 % activation per room member, ≥30 % week-2 retention on one show.*

### P1 — Discovery controls the research explicitly asks for

- **"Not interested"** on drama cards → writes the existing `muteDrama` action. Currently the only
  route to it is Settings.
- **"Outside your usual lane" shelf** on Explore, explicitly labelled, opt-in via a pref — never
  substituted for core results. This is the anti-filter-bubble control.
- **Onboarding step: what to exclude.** One screen: formats/regions you never want. It is what makes
  a cross-fandom product deliberate rather than accidental.

### P2 — Honesty and polish in the demo build

Small, but a reviewer will hit these immediately:

- `/settings/account` still offers "Request a copy of your data — Emailed within 48 hours", which is
  not true of a device-local build. It should say where the data actually is.
- Legal / guidelines / privacy screens describe a server-hosted, moderated service. They need a
  demo notice until a backend is re-attached.
- The demo member has no avatar (initials fallback is fine, but a seeded avatar reads better).

### P3 — Demote what the evidence does not support yet

- Move the Shorts rail on Home below the fold, or behind its own rail on Explore, until there is
  retention evidence. **Keep the feature** — with local video it now works offline and costs nothing —
  but stop it being the third thing a new user sees.
- Park creator monetisation, DMs, a broad "post anything" composer, and collaborative filtering until
  P1/P2 gates clear. The research and this repo's audit agree on all four.

### Do not build

A TikTok-style clip feed · streaming/licensing · a generic social feed with entertainment branding ·
four disconnected mini-apps behind one navbar · an everything-catalog before data quality and
community density are proven in a narrow scope · any ranking that rewards spoilers or pile-ons.

---

## 3. How to actually expand beyond K-drama

The user's direction is to expand Hallyu rather than narrow it. The codebase is already shaped for
this, and the work is additive rather than a rewrite — but it should be sequenced, because data
quality is the risk, not the UI.

1. **Extend `CatalogProvider`** (`lib/catalog.ts`). It is a single interface with a TMDB adapter
   behind it. Adding movies is `/discover/movie` + `/movie/{id}`; adding anime is `/discover/tv` with
   `with_genres=16&with_original_language=ja`. Adding C-dramas is the same discover call with a
   different `with_original_language`. **No screen changes** — that abstraction is the whole point.
2. **Add `format` and `region` to the `Drama` record** (`lib/model.ts`). Everything downstream
   (cards, hubs, filters, recommendations) already keys off the record, so one field unlocks
   format-aware filtering everywhere.
3. **Make the cross-fandom control explicit** — the onboarding exclusion step plus the "outside your
   lane" shelf above. Default to same-category recommendations, and never cross categories without
   consent.
4. **Then** widen the editorial rails (Explore) to more than one region/format.
5. **Fix the name story before step 4 ships** — pair "Hallyu" with an explicit descriptor on the
   welcome screen and wordmark. A full rebrand is not worth it yet; a one-line descriptor is.

Sequencing matters: the research's cold-start argument does not go away by adding categories, and a
broader catalog with weak discovery is worse than a narrow catalog with strong discovery. Do P1
discovery first, then widen.

---

## 4. Measurement

The analytics seam (`lib/analytics.ts`) buffers and forwards to an attachable sink; nothing personal
is sent. The events that matter for the gates above:

- discovery: searches per user per week, results-started, recommendation acceptance
- rooms: activation per member, messages per active member, spoiler reports per 100 messages
- retention: 7-day / 30-day return by install cohort
- sharing: recommendation-card shares, invite attribution
- stability: boot-trail failures and `lastCrash` reports per release

Wire `lastCrash` and the boot trail into Settings → About so user reports arrive with diagnostics —
the data is already captured on device and shown only on the splash screen today.

---

## 5. Status of this pass

Done: backend removed from the app and parked under `backend/`; local demo backend + seeded social
content; local accounts; local video and download ledger; TMDB catalog untouched and still live.
Verified: `typecheck`, `lint`, the save-flow regression suite, and an Android Hermes export whose
bundle contains **no** Supabase credentials, RPC names or backend modules.

Next: P1 taste-aware discovery.
