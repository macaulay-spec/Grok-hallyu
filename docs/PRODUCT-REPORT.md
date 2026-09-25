# Hallyu — Product Reality Check & Improvement Plan

Source: market research "K-Drama & Korean Entertainment Fan Ecosystem — Market Research and
Pre-Development Validation" (24 Sep 2026) + a code-level audit of this repository (Sep 2026).
This document maps the research's evidence-led conclusions onto what the app actually is today,
and lays out what to build next, what to park, and how to know it's working.

---

## 1. What the research concludes (short version)

- The evidence does **not** justify starting with a broad "K-drama social network". TikTok owns
  short video, Reddit owns open discussion, Discord owns group chat, MyDramaList owns tracking.
  A bundle of all of them has no 10x reason for fans to migrate.
- The two strongest, evidence-backed wedges are:
  1. **Taste-aware, natural-language discovery** — fans cannot turn nuanced intent ("slow-burn
     healing drama, minimal love triangle, completed, available in my country") into a next watch.
     This delivers utility **before** network effects.
  2. **Episode-scoped, genuinely spoiler-safe discussion** — spoiler complaints and buried episode
     threads are recurring, credible pains; density around a few airing shows beats empty scale.
- Explicitly deprioritized by the research: a TikTok-style clip feed, hosting copyrighted clips,
  a generic social feed, streaming, actor-led communities — until discovery/discussion retention
  is proven.
- Go/no-go gates: ~30% 7-day return among qualified testers, repeated discovery actions beyond a
  first search, and organic sharing/invites.

## 2. What the app is today (code reality)

| Surface | State vs. research |
| --- | --- |
| Home feed, posts, reactions, discussions, reviews, recommendations | Full generic social feed — the exact "bundle" the research warns against leading with |
| Shorts (vertical video) + video uploads | Highest-investment, lowest-evidence feature; storage is capped (100 MB/video, 2–12/day; 1 GB free / 100 GB Pro Supabase project, Backend #3 fallback ready) |
| Explore / search | Keyword/tag search — does not yet solve the #1 wedge (taste-intent discovery) |
| Spoiler system (veiled posts, spoiler tags, episode context) | Real, differentiated machinery already exists — but it is a setting, not the headline |
| Collections/shelves, follows, profiles, notifications | Solid social plumbing; useful only after a repeat activity exists to gather around |
| Catalog | TMDB-backed import + onboarding genre pick — good raw material for taste modeling |

## 3. Reposition: from "social network" to "decide what to watch, spoiler-free"

**Positioning to adopt:** "The best spoiler-aware, taste-explainable way to decide and discuss
what to watch next." Not "all K-entertainment in one place".

### P0 — Done in this pass (stability before growth)
- Release APK no longer freezes silently: fail-visible boot entry, boot breadcrumbs, on-screen
  startup diagnostics, bounded startup gates. CI prebuild repaired; green builds publish APKs.
- Video storage has an automatic fallback project; upload quotas and ledger intact.

### P1 — Taste-aware discovery (the #1 wedge; build this next)
1. **Vibe search**: one natural-language box ("healing slow-burn, no love triangle, completed")
   parsed into structured filters — mood, tropes, love-triangle weight, episode count, completion
   status, country availability. Reuse the TMDB catalog + the onboarding genre picks as the
   starting taste vector.
2. **Explainable results**: every result card shows *why* it matched (trope matches, mood, length,
   status) — the research is explicit that transparency is the differentiator vs. OTT algorithms.
3. **Taste profile from behavior**: watchlist states + likes + finished dramas feed the match; no
   cold-start questionnaire beyond the genres step that already exists.
4. **Shareable recommendation cards**: the organic-growth loop the research asks for ("compare our
   top 10") — a rendered card with the query + top picks, deep-linked into the app.
   *Success gate: repeat discovery actions per user per week, and shared cards in the wild.*

### P2 — Spoiler-safe episode rooms (the #2 wedge)
1. Promote the existing veil machinery into **episode-gated rooms** per airing show: entering the
   episode-N room requires marking N watched; visibility defaults derive from watched state, not
   voluntary tags.
2. Spoiler reports + one-tap mod actions (the plumbing exists in posts/moderation surfaces).
3. Density over breadth: launch rooms for **a small number of currently airing shows**; empty
   rooms are worse than a busy Reddit thread.
   *Success gate: ≥50% activation per room member, ≥30% week-2 retention on one show.*

### P3 — Park / shrink (per the research)
- **Shorts**: stop investing in the upload/consumption loop; keep as consume-only if at all.
  Copyright risk around clips is material and the network-effect battle is unwinnable.
- **Generic feed**: keep, but let discovery outputs (shared cards, episode rooms) be the front
  door; the feed is retention glue, not acquisition.
- **Actor/creator communities, K-pop expansion**: not now — unproven demand, high moderation load.

### P4 — Later, evidence-gated
- Availability/affiliate links (region-aware "where to watch"), premium planning/discovery tier,
  B2B data tools — all only after P1/P2 retention gates are met.

## 4. Measurement plan (from the research's validation section)

Instrument these now (analytics layer already exists — `track()`/`reportError`):
- 7-day return rate of installed users (cohort by install week).
- Discovery: vibe-searches per user, results-started ("started watching"), quality rating.
- Sharing: rec-card shares per 100 searches; invite attribution.
- Episode rooms: activation, messages/active member/show, spoiler reports per 100 messages.
- Stability: boot-trail failures and lastCrash reports per release (new diagnostics make this
  countable without adb).

## 5. Engineering hygiene carried forward
- Every push to `main` builds + verifies (zipalign, signature, JS bundle) and publishes an APK
  release tag; keep this contract.
- Boot breadcrumbs + lastCrash are persisted on-device — wire them into Settings → About (and a
  support email) so user reports arrive with diagnostics.
- Keep Backend #3 dormant-but-configurable; monitor the 1 GB free-tier ceiling on the video
  project before growth pushes (Pro = 100 GB).
