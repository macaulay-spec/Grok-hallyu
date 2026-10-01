# Hallyu — Continuation on This Project

*The plan for turning Hallyu from a working app into a business. Written after the cloud rebuild:
the app now runs on its own backend (Cloudflare Worker + Durable Object database), identity is
platform-verified Google/Apple OAuth, guests are read-only, and moderation/trust/analytics
primitives are already live in the cloud.*

---

## 1. Where we are

| Layer | Status |
| --- | --- |
| Cloud database | ✅ Own Worker + Durable Object (SQLite): profiles, posts, comments, reactions, follows, saves, watchlist, collections, notifications, blocks, mutes, reports, events |
| Identity | ✅ Rork Auth (Google/Apple, PKCE + SecureStore). Server-side JWT verification; spoofing impossible |
| Moderation primitives | ✅ Reports, blocks, mutes, spoiler levels, bans, feed hygiene server-side |
| Trust | ✅ `verified` badge + `role` on every profile; role-gated `/admin/*` endpoints |
| Analytics | ✅ `POST /events` pipeline; mirrored into Supabase Postgres for global reporting |
| Postgres | ✅ Managed Supabase (Rork Cloud): `analytics_events`, `moderation_reports`, `member_snapshots` + SQL aggregate function |
| Monetization | ⬜ Nothing yet — by design, until retention is proven |

## 2. Product principles (why people stay)

1. **Spoiler safety is the moat.** No other fandom app treats "what have you watched" as a first-class
   input to every feed, room and search. Every new feature must answer: does this make spoiler control
   stronger or weaker?
2. **One community, four worlds.** K-Drama, C-Drama, Anime, Hollywood share one graph — fans of one
   world discover the others naturally. Never fragment into separate apps.
3. **Fandom-native expression.** Loved / cried / screamed / swooned / laughed / furious — reactions
   that mean something in this space, not a thumbs-up.

## 3. Monetization — how people actually spend money

**Hallyu Pass** (subscription, target $4.99/mo via RevenueCat):
- **Spoiler Shield Plus** — keyword/person auto-veiling, "hide everything past S2E4" one-tap, spoiler-proof search.
- **Watch Party host** — create premium episode rooms with live reactions.
- **Cosmetics** — profile themes, name styles, exclusive reaction flourishes.
- Early access to world-launch events.

**Sponsorships** — premiere hubs for a specific drama ("Presented by …"), clearly labeled, sold to
studios/streamers once DAU is measurable.

**Creator tipping** (phase 3) — fans tip the reviewer whose take guided their watch; we take a small cut.

**Never for sale:** reach, verification, spoiler bypass, or the removal of ads on free tiers. Trust is
the product; these would kill it.

## 4. Admin dashboard — yes, we need one

Phase 1 — **SHIPPED as an in-app console** (Settings → Admin console; the admin role is checked
server-side on every call): KPIs, live Postgres analytics (14-day event chart, top events), moderation
queue with one-tap resolutions, people search with verify/ban, and an audit trail. A standalone web
can reuse the same role-gated `/admin/*` endpoints later:
- **KPIs:** signups, posts/day, reaction volume, events today, active reports (already returned by `GET /admin/overview`).
- **Moderation queue:** open reports with target previews → action (dismiss / remove content / ban author).
- **People:** search members, verify, ban/unban, grant roles.
- First admin is claimed via `POST /admin/claim` (first-run-only); more admins granted from the console.

## 5. Verification — how we verify people (ladder, never a paid check)

1. **Foundation (automatic):** OAuth-verified email from Google/Apple — every account starts here.
2. **Crimson Critic (earned):** consistent quality reviews + account age + clean moderation record →
   granted by an admin via the console; shown as a colored badge.
3. **Blue check (manual):** public figures, press, studios — application form in-app → admin review queue.

## 6. Analytics

- Pipeline is live end-to-end: `track()` → cloud sink batching → `POST /events` → Durable Object →
  HMAC-signed mirror → Supabase Postgres → admin console (14-day trends, top events).
- Instrument next: onboarding funnel steps, feed engagement, watchlist adds, session starts (retention proxy).
- Privacy rule: **no PII in events** — pseudonymous user id + aggregate dashboards only.

## 7. Moderation & safety

- **In place:** report flow everywhere, blocks, mutes (people + dramas), muted words, spoiler levels,
  server-side feed filtering, instant ban enforcement.
- **Shipped:** admin queue tooling (§4) and the moderation audit log (every verify/ban/resolution).
- **Next:** spam heuristics (link floods, mass-posting), consequences ladder
  (warning → 24h restrict → ban), appeals flow.

## 8. Security

- **In place:** platform-verified JWT identity, ownership checks on every mutation, 120 writes/min rate
  limit, strict input caps, hard account deletion (full GDPR-style wipe), banned-state enforcement.
- **Shipped:** `GET /me/export` (data portability) and the admin action audit log.
- **Next:** mention/report abuse throttles, quarterly dependency audit.

## 9. Growth loop

Onboarding "follow 3 dramas → magic feed" (shipped) → **push notifications** (episode air + social,
Expo notifications) → **share cards + deep links** (post/drama links that open the app) → **world launch
moments** (C-Drama Week etc.) → creator program.

## 10. Roadmap (build order)

1. **Admin console** — ✅ shipped in-app (KPIs, Postgres analytics, queue, people, audit). A web console is optional later.
2. **Push notifications** — episode air + social; the retention engine.
3. **Hallyu Pass + RevenueCat** — first revenue.
4. **Data export (✅ shipped) + appeals** — platform hygiene.
5. **Share cards, deep links, creator program** — the acquisition loop.

*Every item above lands in the same cloud (`functions/`) and the same app — no second backend, no new
infrastructure to trust.*
