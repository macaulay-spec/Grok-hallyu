# 01 · Product Definition

## 1. One sentence

**Hallyu is where K-drama fans live between episodes — the place you open the moment the episode ends.**

## 2. What Hallyu is / is not

| Hallyu is | Hallyu is not |
|---|---|
| A social network whose objects are dramas, episodes, actors and people | A drama database with comments bolted on (MyDramaList) |
| A place where conversation is scoped to what you have watched | A firehose of spoilers with hashtags (X) |
| A fandom you enter | A catalogue you look up |
| Editorial, cinematic, quiet | A dashboard, a grid of cards, a TikTok clone |
| Drama-first video (edits, reactions, theories) | Generic short video with a Korean filter |
| Lightweight tracking that powers safety and identity | A spreadsheet |

## 3. Why now, why this shape

K-dramas are *scheduled* media. Korean networks slot dramas into twin-night blocks (Mon–Tue, Wed–Thu, Fri–Sat, weekends), one episode per night at roughly 22:00 KST, and the episode reaches global streaming within hours. That means the whole world watches the same episode inside a ~24-hour window and wants to talk *immediately* — and safely, because the person next to them is three episodes behind. No existing product owns that moment: Reddit's on-air threads are text-only and mobile-hostile, Viki's comments are trapped in the player, MyDramaList is a database, and general social networks cannot understand "Episode 8" as a boundary. Hallyu can.

## 4. Pillars (from the brief) and what each one *means in the UI*

| Pillar | UI commitment |
|---|---|
| **Discover** | Explore is a discovery engine (trending, airing, new, actors, shorts, creators, genres, collections), not a search box. Every entity page ends with "where to next". |
| **Discuss** | Discussions are a content type with titles and threaded replies. Episodes and dramas list discussions first. Comments are never an afterthought (dedicated thread screen, sorting, author badges, mentions). |
| **React** | The six-reaction vocabulary is everywhere. Reactions aggregate into the Episode Reaction Meter so a room *feels* something at a glance. |
| **Follow** | People, dramas and actors are followable; Following is a real chronological feed with source labels and source filters; Activity carries followed-drama events. |
| **Track** | Want / Watching / Completed / Dropped, current episode, notes, collections. Two taps to update from anywhere (drama page, episode page, watchlist, Tonight module). Progress drives the veil. |
| **Belong** | Fandom counts and activity lines ("214 fans talking right now"), the Tonight ritual, a profile that is a taste identity (favourites shelf, currently watching, collections). |

## 5. Personas and jobs to be done

| Persona | Who | Jobs |
|---|---|---|
| **The Live Watcher** (22–34) | Watches on air-night, follows 3–6 airing dramas | "Let me scream about tonight's episode with people who just watched it — without seeing anything from next week." |
| **The Curator** (25–45) | Finished 100+ dramas, strong taste, writes | "Give me a clean place for honest verdicts and lists, and followers who care." |
| **The Editor** (18–28) | Makes edits/fancams, cross-posts to TikTok/IG | "Post my edit where people know the drama, credit the scene, and get real fans following me." |
| **The Newcomer** (any) | Arrived via Netflix, 2–5 dramas in | "Tell me what to watch next and let me lurk until I feel at home." |
| **The Lurker** (everyone, 90% of sessions) | Reads, saves, follows, rarely posts | "Make reading, saving and following feel complete on their own." |

Design for the lurker first; conversion to creator happens through low-friction Reactions.

## 6. The core loop, made concrete

```
Discover ─► Follow ─► Watch ─► React ─► Discuss ─► Discover again
Explore /   Drama /   Watchlist   Reaction   Episode      "Fans who loved
Actor /     Actor /   progress,   (2 taps),  discussion,  this also…",
Home        People    Tonight     post       comments     actor → drama
```

Trigger on air-night: push *"Ep 7 of The Scandal just aired · 214 fans are in the room"* → Home › Tonight → Episode screen (gate: "Have you watched Ep 7?") → React or Post → Activity brings them back → Explore's "Because you follow…" widens the graph.

## 7. Product principles (used to settle every design argument)

1. **Context is data.** Drama / season / episode / actor attachments are stored and rendered, never decorative.
2. **Safe by default, never patronising.** The veil protects; one tap reveals; the user sets the strictness.
3. **Typography carries hierarchy.** Size, weight and colour before boxes, borders and shadows.
4. **The accent means something.** Rose = action, live, love, selection. Never decoration.
5. **Editorial, not grid.** Mixed densities (large / immersive / compact / horizontal / conversational) with a clear "notice first → do next → supporting" order on every screen.
6. **Two taps to any state change.** Follow, watch status, episode progress, reaction, save.
7. **Explain the machine.** Every recommendation carries a reason; every notification is grouped; every error says what happened, whether data was saved, and what to do.
8. **Design the lurker's session.** Reading, saving and following are complete flows with their own success states.
9. **Motion communicates.** Only for navigation, media, spoiler reveal, reacting, expansion, sheets, loading, feedback. Reduced motion always honoured.
10. **The old app is research.** Nothing is carried forward by habit.

## 8. Scope by release (design covers all of it; delivery is phased)

| Area | v1.0 "Foundation" | v1.5 "Voice" | v2.0 "Motion" |
|---|---|---|---|
| Auth (email, Google, recovery, verification), guest mode | ● | | |
| Onboarding (intent, genres, dramas, people, notifications) | ● | | |
| Home For You / Following with modules, Tonight | ● | | |
| Explore, global grouped search, provider import | ● | | |
| Drama Hub (all 6 sections), seasons, episodes, Episode screen, Reaction Meter | ● | | |
| Actor pages | ● | | |
| Post, Reaction, Discussion composers; threaded comments; reactions; saves; shares | ● | | |
| Spoiler system (4 levels, protection settings, veil, gate) | ● | | |
| Watchlist (4 statuses, progress, notes), Collections (public/private) | ● | | |
| Activity (grouped, 4 categories), push notifications | ● | | |
| Profile (Posts, Reviews, Collections tabs), Edit profile, Saved | ● | | |
| Settings (all pages), report/block/mute, account deletion | ● | | |
| Review & Recommendation composers, Fan verdict on drama pages | | ● | |
| Hashtags, mentions autocomplete, drafts sync | | ● | |
| Shorts (viewer, creator tools, profile tab, drama Media tab) | | | ● |
| Tablet two-pane layouts, foldable postures | ● (layout rules) | polish | polish |
| iOS (same KMP core, SwiftUI or Compose Multiplatform shell) | | | after v2.0 |

Explicitly **out of scope** for all listed releases: DMs, user-created groups, live streaming, ads, paid tiers, C/J/Thai catalogs (the model supports `country`; the brand launches Korean).

## 9. Success metrics

| Metric | Why it matters | v1 target (first 90 days) |
|---|---|---|
| D1 / D7 / D30 retention | The loop works | 45% / 25% / 12% |
| % of sessions touching an Episode screen | Discussion is central | ≥ 35% |
| Posts + reactions per airing episode (top 5 followed dramas) | Rooms are alive | ≥ 50 within 6h of air |
| Follows completed in onboarding (people + dramas) | Feed is non-empty on day one | ≥ 5 per new user |
| Time to first reaction / first post | Creation is easy | median < 24h / < 7 days |
| Spoiler reveal rate | Too high = the veil is annoying; too low = it never triggers | 15–40% of veiled impressions |
| Reports actioned < 24h | Trust | 100% |
| Crash-free sessions | Quality | ≥ 99.5% |

## 10. Competitive posture (one line each)

- **MyDramaList** — we will never out-database it; we out-*live* it. Import-on-demand covers the long tail.
- **Reddit r/KDRAMA** — we take its episode-thread ritual and make it native, visual and spoiler-aware.
- **Viki / Netflix** — they own playback; we own the conversation after playback. Deep-link to them via "Where to watch".
- **TikTok / Shorts** — we take drama-first edits and give them context (drama, episode, actor) and a fandom audience.
- **K-Drama Tracker (PWA)** — tracker-first with communities; we are social-first with tracking as infrastructure.
