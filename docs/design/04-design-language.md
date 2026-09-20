# 04 · Design Language

**Feel:** cinematic + editorial + social + modern + premium. Korean-inspired in its discipline (generous whitespace, hairline structure, bold type, confident restraint), never in cliché (no hanbok patterns, no neon Seoul, no fake Hangul decoration).

**Avoid list (from the brief, enforced):** gradients (except image scrims), purple "AI" palettes, glassmorphism, oversized rounded cards everywhere, random glow, 3D, heavy shadows, dashboards, TikTok/X clones.

---

## 1. Brand

### 1.1 The Signal
A Rose dot. It means *on air · alive · new*. It is the only brand device, and it is used consistently:

| Where | Form |
|---|---|
| App icon | the dot at the H's upper right |
| Wordmark | the terminal period in `Hallyu.` |
| Live indicator | 8dp dot with a 1.6s pulse ring (06) next to "Airing now", "Ep 7 · aired 40m ago" |
| Unread | 6dp dot on the Activity tab and on unread rows |
| Active tab | 4dp dot under the active icon (in addition to the filled icon), not a pill |
| Selected states | 6dp dot at the top-right of selected poster tiles in pickers |

Never used as bullet decoration, never duplicated in a pattern.

### 1.2 App icon
Source files: `brand/app-icon-adaptive-foreground.svg`, `…-background.svg`, `…-monochrome.svg`, `app-icon-legacy-512.svg`, `notification-icon.svg`, preview `brand/brand-preview.png`.

- **Adaptive icon (108dp canvas):** background layer solid `#0A0A0A`; foreground = geometric H (`#FAFAFA`, stems 8dp, 34×40dp at x 31–65 / y 36–76) + the Signal (`#E11D48`, r 6dp at 73,38). Everything sits inside the 66dp safe circle, verified for circle, rounded-square and square masks.
- **Monochrome layer** (Android 13+ themed icons): same silhouette, single colour.
- **Legacy / Play icon:** 512×512, no alpha, 24/108 corner radius, composition scaled ×1.18.
- **Notification small icon:** white silhouette on transparent, 24dp with 2dp padding.
- **Splash (Android 12+ SplashScreen API):** icon-with-background variant, 240dp asset, glyph within the 160dp circle; window background `#0A0A0A`; branding image none. Exit animation: 300ms fade into the app's first frame (06).
- **Do not** add borders, gradients, glows or a wordmark to the icon.

### 1.3 Wordmark and lockups
`brand/hallyu-wordmark.svg` (outlines, font-independent) and `brand/hallyu-lockup-horizontal.svg`.
- `Hallyu.` set in Pretendard ExtraBold, tracking −3%, the Signal as the terminal on the baseline (Ø = 21% of cap height, gap 6% of em).
- Clear space: the height of the "H" on all sides. Minimum height: 16dp in UI (Home top bar uses 22dp cap height), 24px on web.
- Colour: `text.primary` on dark; on photography always over a scrim. Never in Rose, never outlined.
- The lockup (mark + wordmark) is for splash-free contexts: web, store listing, share cards.

### 1.4 Share card (post → image)
1080×1350 (4:5). Canvas `#0A0A0A`, film grain 4%, drama poster or backdrop as a 20% opacity backdrop with scrim, post body in `display`, author line, Context strip, footer lockup + `hallyu.app/p/…`. Veiled posts export veiled (with the label) unless the author is exporting their own.

---

## 2. Colour

Tokens live in `tokens/hallyu.tokens.json` (primitives → semantic). Dark is the only theme in v1; a light theme is a token remap, not a redesign.

### 2.1 Primitives
| Name | Hex | Name | Hex |
|---|---|---|---|
| ink.1000 | `#000000` (True black option) | rose.700 | `#BE123C` |
| ink.950 | `#0A0A0A` | **rose.600** | **`#E11D48`** |
| ink.900 | `#111113` | rose.500 | `#F43F5E` |
| ink.850 | `#161618` | rose.400 | `#FB7185` |
| ink.800 | `#1C1C1F` | rose.300 | `#FDA4AF` |
| ink.700 | `#26262B` | amber.500 | `#E8A33D` |
| ink.600 | `#34343A` | amber.400 | `#F2B84B` |
| ink.500 | `#4B4B53` | green.400 | `#34D399` |
| ink.450 | `#61616B` | yellow.400 | `#FBBF24` |
| ink.400 | `#7A7A85` | red.400 | `#F87171` |
| ink.300 | `#A1A1AA` | blue.400 | `#60A5FA` |
| ink.200 | `#C4C4CC` | white | `#FAFAFA` |
| ink.100 | `#D6D6DC` | | |

Contrast figures below are computed against `ink.950` (WCAG relative luminance); they are the reason the ramp has the odd `ink.450` step.

### 2.2 Semantic tokens (dark)
| Token | Value | Use | Contrast on canvas |
|---|---|---|---|
| `color.canvas` | ink.950 (ink.1000 when True black) | screen background | — |
| `color.surface.1` | ink.900 | cards that need separation, inputs | — |
| `color.surface.2` | ink.850 | raised: sheets, menus, chips | — |
| `color.surface.3` | ink.800 | overlay on surface.2, pressed states | — |
| `color.border.subtle` | ink.800 | hairlines, dividers (1dp) — decorative | 1.2:1 |
| `color.border.strong` | ink.450 | focused inputs, outlined buttons, focus rings | 3.2:1 (meets 3:1 for UI boundaries) |
| `color.text.primary` | white | titles, body | 18.6:1 |
| `color.text.secondary` | ink.300 | metadata, captions | 7.7:1 |
| `color.text.tertiary` | ink.400 | placeholders, reason lines | 4.7:1 (the readable floor) |
| `color.text.disabled` | ink.500 | disabled labels (exempt, never informational) | 2.3:1 |
| `color.accent` | rose.600 | filled buttons, the Signal, active icons, selection borders | 4.2:1 (fills, icons, text ≥ 18sp only) |
| `color.accent.text` | rose.400 | any accent text under 18sp, links in accent | 7.4:1 |
| `color.accent.on` | white | text on accent fills | 4.7:1 on rose.600 |
| `color.accent.soft` | rose.600 @ 14% | selected chip fills, reacted state backgrounds | — |
| `color.accent.pressed` | rose.700 | pressed filled buttons | — |
| `color.warm` | amber.400 | ratings, verdict numbers, "Fan pick" marks, warm highlights | 11:1 |
| `color.warm.soft` | amber.400 @ 14% | rating chips | — |
| `color.success` | green.400 | saved/complete confirmations | 10.3:1 |
| `color.warning` | yellow.400 | processing, rate-limit notices | 11.9:1 |
| `color.danger` | red.400 | destructive text/icons | 7.2:1 |
| `color.danger.fill` | rose.700 | destructive filled buttons | — |
| `color.info` | blue.400 | system notices | 7.8:1 |
| `color.veil` | ink.850 with 1dp `border.subtle` | spoiler veil surface | — |
| `color.scrim` | black 0→72% vertical | over heroes and media | — |
| `color.overlay` | black @ 56% | behind sheets/dialogs | — |
| `color.live` | rose.600 | the Signal | — |

Token-file note: DTCG groups cannot carry a value, so in `tokens/hallyu.tokens.json` `color.accent` is `color.accent.default` and `color.accent.on` is `color.text.onAccent`; every other name maps 1:1.

Rules: the accent appears at most once as a fill per viewport (the primary action) plus the Signal and reacted states. Text under 18sp in accent uses `accent.text`, never `accent`. Success/warning/danger appear only in feedback, never as decoration.

### 2.3 Reaction colours
Reactions are monochrome line glyphs in `text.secondary`; when selected they fill with `accent` (Loved, Swooned), `blue.400` (Cried), `warm` (Screamed, Laughed), `red.400` (Furious). The Reaction Meter uses the same five hues at 80% on `surface.2`.

---

## 3. Typography

### 3.1 Families
- **Primary: Pretendard Variable** (OFL). Latin metrics compatible with Inter, native Hangul, weights 100–900. Bundle weights 400/500/600/700/800 as a variable file (~2 MB subset: Latin, Latin-ext, Hangul, common symbols).
- **Fallback chain:** Pretendard → Inter (Latin) → Noto Sans KR (Hangul) → system (Roboto).
- **Numerals:** tabular figures (`tnum`) for counts, timers, episode numbers, stats.
- **No second family.** Editorial character comes from the display styles (heavy weight, tight tracking), not a serif.

### 3.2 Scale (sp / line height / weight / tracking)
| Style | Size/LH | Weight | Tracking | Use |
|---|---|---|---|---|
| `displayLarge` | 40/44 | 800 | −1.5% | Welcome line, big empty-state moments |
| `display` | 32/38 | 800 | −1% | Drama title on hero, onboarding titles |
| `headline` | 26/32 | 700 | −0.5% | Screen titles (Explore, Activity), profile name |
| `titleLarge` | 22/28 | 700 | −0.25% | Section titles, post detail body lead |
| `title` | 18/24 | 600 | 0 | Card titles (discussion), sheet titles |
| `titleSmall` | 16/22 | 600 | 0 | List row titles, author names |
| `bodyLarge` | 17/26 | 400 | 0 | Post detail body |
| `body` | 15/22 | 400 | 0 | Card bodies, descriptions |
| `bodySmall` | 14/20 | 400 | 0 | Comments, secondary descriptions |
| `label` | 13/18 | 600 | +0.2% | Buttons (small), chips, tabs |
| `caption` | 12/16 | 500 | 0 | Metadata, timestamps, counts |
| `overline` | 11/14 | 700 | +6% caps | Eyebrows ("TONIGHT", "TRENDING"), Context strip labels |
| `button` | 15/20 | 600 | 0 | Default buttons |
| `numeric` | inherits | 600 | 0 | Tabular figures |

### 3.3 Korean text rules
- Hangul line height ×1.55 (vs ×1.45 Latin): styles auto-bump when a run is > 40% Hangul.
- Tracking 0 on Hangul-heavy runs (negative tracking damages Hangul).
- No italics (Hangul has none; emphasis = weight or colour).
- Titles show `title` first, `originalTitle` beneath in `caption` `text.secondary`; never mixed on one line.
- Word-break: `keep-all` behaviour for Hangul; Latin drama titles may hyphenate at 2 lines max.
- Dynamic type: all styles scale with system font size up to 1.3× (200% on settings/body screens); layout rules in 15.

---

## 4. Spacing, grid, shape, elevation

- **Base unit 4dp.** Scale: 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
- **Screen margins:** 16dp compact · 24dp medium · 32dp expanded. Gutters 12dp. Content max width 640dp for reading columns.
- **Vertical rhythm:** sections separated by 32dp; items in a list by 16dp of padding and a 1dp hairline (or 12dp for dense lists); card internal padding 16dp.
- **Radius tokens:** `xs` 4 (tags) · `sm` 8 (buttons, inputs, posters) · `md` 12 (media, cards when boxed) · `lg` 16 (sheets' top corners, large media) · `xl` 24 (create button, floating pills) · `full` (avatars, chips).
- **Elevation is tonal, not shadowed.** Layers step through `surface.1 → 2 → 3`; hairlines separate. Shadows only on: the Create button (y 4 blur 12 @ 30%), floating pills ("New posts"), and dragged items.
- **Cards are rarely boxed.** Feed items are separated by hairlines and whitespace; boxes are reserved for embedded objects (a drama inside a recommendation, a quoted episode). This is the main defence against "oversized rounded cards everywhere".

---

## 5. Iconography

- **Material Symbols Rounded**, weight 400, optical size 24, fill 0 (outline) at rest and fill 1 when active/selected. Sizes 24 (default), 20 (dense rows), 18 (inline with text), 28 (Shorts overlay).
- **Custom glyphs** (same stroke logic, 24dp grid): the six reactions, watch statuses (want = bookmark-plus, watching = play-circle, completed = check-circle, dropped = stop-circle), spoiler veil, the Signal, Shorts (vertical frame), Discussion (speech with lines), Review (verdict mark), Recommendation (arrow into heart).
- Icon buttons are 48×48 touch targets with 24dp glyphs; colour `text.secondary` at rest, `text.primary` on hover/focus, `accent` when active.

---

## 6. Imagery

| Asset | Ratio | Treatment |
|---|---|---|
| Poster | 2:3, never cropped, radius `sm`, `surface.1` placeholder with blurhash | sizes S 72×108 · M 104×156 · L 140×210 · XL 180×270 |
| Backdrop / hero | 16:9 crop allowed, focal point centre-top; bottom scrim to canvas; **film grain 4%** overlay (signature) | hero height 56% of width on compact, capped 420dp |
| Actor profile | 1:1 circle (list) or 2:3 (grid) | |
| User avatar | 1:1 circle; sizes 24 · 32 · 40 · 48 · 64 · 96; deterministic initial + hue when missing | live ring (2dp accent) when the user posted in a live room in the last hour (v1.5) |
| Post images | single: natural ratio clamped 4:5 … 1.91:1; two: 1:1 side by side; three: 1 large + 2 small; four: 2×2 | tap → MediaViewer |
| Short cover | 9:16; other ratios letterboxed on `ink.1000` | |
| Episode still | 16:9; veiled until watched | |

Never distort. Missing image → placeholder glyph on `surface.1`, never a broken-image icon. Blurhash first, then image with 200ms crossfade (06).

Illustration: none. Empty states use typography and, at most, a single 24dp glyph or a faded poster mosaic. Photography of real people is only ever provider stills/profile images (licensed) or user uploads.

---

## 7. Voice & copy

**Tone:** warm, knowing, a little dramatic, fluent in fandom, never fake-Korean, never corporate. Short sentences. Second person. Verbs first on buttons.

| Situation | Copy |
|---|---|
| Welcome line | **Your dramas. Your people. Your world.** |
| Empty Home (no follows) | **Your drama universe is empty.** *Follow a few dramas and people to fill it.* → Explore dramas |
| Empty watchlist | **Your next obsession belongs here.** → Find something to watch |
| Empty drama community | **Nothing here yet.** *Be the first fan to say something about Goblin.* → Post |
| Empty search | **No results for "…".** *Try the Korean title, or import it from our catalog provider.* → Import |
| Episode gate | **Have you watched Episode 8?** *I've watched it* / *Just peeking* |
| Veil | **Episode 8 spoiler** · *You're on Episode 6* · Reveal |
| Post success | **Posted to Goblin · Ep 9** · View |
| Offline | **You're offline.** *Showing what we saved earlier.* |
| Generic error | **Something went wrong on our side.** *Your post is safe in Drafts.* Retry |
| Rate limit | **You're posting fast.** *Try again in 12 minutes.* |
| Delete account | **This can't be undone.** *Your posts, comments and collections will be removed.* |
| Push: episode aired | **Ep 7 just aired.** 214 fans are already talking. |
| Push: grouped social | **Mina, Jae and 14 others** reacted to your post. |

Never: "No data found", "Error 500", "Oops!", exclamation marks in errors, "users" (say "fans" or "people").

## 8. Localisation
English first; Korean UI in v1.5. Strings are ICU MessageFormat with plurals; no concatenation. Avoid text in images. Buttons allow 1.6× string growth. Dates: relative under 7 days ("2h", "Yesterday"), then short date; air times always "local time · 22:00 KST" on schedule surfaces.
