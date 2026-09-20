# 17 · Personalization & Ranking

Personalisation makes Home, Explore, recommendations and notifications feel like *yours*. It must be explainable, controllable and never creepy.

## 1. Signals (what Hallyu learns)

| Signal | Source | Weight class |
|---|---|---|
| Onboarding intents, genres, dramas | Onboarding | strong, decays over 90 days |
| Follows (people, dramas, actors, collections) | explicit | strong |
| Watchlist status & progress (want/watching/completed/dropped) | explicit | strong |
| Reactions given (and which of the six) | explicit | medium |
| Reviews & ratings | explicit | strong for taste |
| Saves, collection adds | explicit | medium |
| Comments/replies | explicit | medium |
| "Not interested", hide, mute, unfollow | explicit negative | strong negative |
| Dwell on cards/detail, room visits, veil reveals | implicit | weak |
| Search queries and result taps | implicit | weak, 30-day |
| Time-of-day / air-night patterns | implicit | used only for notification timing |

Not used: location beyond coarse timezone, contacts, device identifiers for profiling, content of DMs (none exist).

## 2. For You ranking (principles, not a black box)
Score = relevance × freshness × quality × diversity, where:
- **Relevance:** followed source (1.0) > followed drama/actor community (0.8) > taste-similar fans (0.6) > global trending (0.4); boosted for dramas the user is `watching` (×1.3) and for the current air-night (×1.5 within 24h of an episode).
- **Freshness:** exponential decay, half-life 8h for posts, 2h for reactions, 48h for reviews/recommendations.
- **Quality:** engagement per impression normalised by author reach; discussions with replies from ≥ 3 distinct fans get a boost; reported/hidden content excluded.
- **Diversity:** no more than 2 consecutive items from the same author or the same drama; at least 1 in 8 items from outside the follow graph (labelled).
- **Spoiler-aware:** veiled-for-this-user items are down-ranked (×0.5) but not removed (fans still want to see that a room is alive); items beyond the user's progress by more than 4 episodes are excluded from For You (still visible on the drama page).
- **Cold start:** day 0 uses onboarding picks + airing dramas + editorial prompts; the first 20 reactions rapidly re-weight.

Every non-followed item carries a **reason line**: "Because you follow Goblin" · "Popular with fans of The Glory" · "Trending tonight" · "From your watchlist" · "Fans like you loved this". Tapping the reason opens a small sheet: *Show more like this · Show less · Not interested in {drama} · Why am I seeing this?*

## 3. Following feed
Strictly reverse-chronological. Sources: followed people; top posts from followed dramas/actors (max 1 per fandom per 2 hours, labelled "From the Goblin fandom"); the user can restrict sources with the People/Dramas/Actors filter chips. No ranking, no injected suggestions except the Tonight rail.

## 4. Explore & recommendations
- **Trending dramas:** posts + reactions + follows velocity over 24h, damped by catalogue size; airing dramas get a small boost on air-night; a drama can't hold #1 for more than 3 days without new episodes (prevents staleness).
- **Recommended for you:** collaborative ("fans who completed X also completed Y") + content (genre/trope/cast overlap) + recency; excludes completed/dropped/muted; always shows a reason chip.
- **Fans like you:** Jaccard overlap on followed dramas + completed lists + genre vectors; excludes blocked/muted and people who opted out of suggestions.
- **Creators to follow:** authors with high engagement-per-follower in the user's fandoms.
- **Fan recommendations** (from Recommendation posts): "If you liked X" edges weighted by reactions.

## 5. Notifications relevance
- Episode alerts: only followed dramas; "Only dramas I'm watching" filter; quiet hours with an "except episodes" override; batch social notifications into groups within 30-minute windows; never more than 1 "trending in your fandom" per day; "Highlights" off by default.
- Send time: episode alerts fire when the episode is available (air time + platform lag if known), not at KST midnight; recap emails/pushes align to the user's typical active hour.

## 6. Controls the user has
Settings › Privacy & safety › Personalisation switch (off = Following-style chronological For You with global popularity only) · Analytics sharing switch · "Hide my activity from suggestions" · Not interested / Show less · Mute dramas, actors, people, words · Reset recommendations (v1.5).

## 7. Non-creepy rules
- Never reference private signals in copy ("Because you watched…" is fine when the drama is on the user's public watchlist; otherwise "Based on your taste").
- Never surface a user's watch progress to others beyond what their watchlist visibility allows.
- Never recommend based on a single search.
- Never notify about "people you may know"; suggestions are taste-based only.
- Guests receive only global popularity.
