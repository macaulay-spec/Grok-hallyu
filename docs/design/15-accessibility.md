# 15 · Accessibility

Target: WCAG 2.2 AA on mobile + Android accessibility guidelines. Accessibility is a release gate, not a polish item.

## 1. Requirements

| Area | Requirement |
|---|---|
| **Touch targets** | ≥ 48×48dp for every interactive element (visual size may be smaller); ≥ 8dp between adjacent targets. Reaction glyphs in the picker are 40dp visual / 48dp target. |
| **Contrast** | Text ≥ 4.5:1 (body) / ≥ 3:1 (≥ 18sp or 14sp bold); non-text UI ≥ 3:1. Enforced by tokens: `accent.text` for small accent text, `text.tertiary` is the floor for readable text; `text.disabled` never carries information. Text over images always sits on ≥ 72% scrim. |
| **Dynamic type** | All text scales with system font size up to 1.3× everywhere and 2.0× on reading/settings screens. Layout rules: cards grow vertically; rows switch from single to two lines; horizontal rails wrap to vertical lists above 1.5×; tab labels can truncate to icons only above 1.5× (icon retains contentDescription). No fixed-height text containers. |
| **Screen readers (TalkBack)** | Every image has a description (alt text, or a generated one: "Poster of Goblin", "Photo from Mina's post"); every icon button a label; cards expose a single merged description ("Mina Park, about Goblin episode 9, 2 hours ago: [body]. 142 reactions, 36 comments") plus custom actions (React, Comment, Save, Share, More options); reading order = visual hierarchy; live regions for toasts, new-posts pill and counters (polite), errors (assertive). |
| **Spoiler safety in the a11y tree** | Veiled content is **not present** in the accessibility tree (not merely hidden visually); the veil announces "Episode 8 spoiler, hidden. You're on episode 6. Reveal button." |
| **Focus** | Visible focus ring (2dp `border.strong`, 2dp offset) for keyboard/D-pad; focus moves to sheet titles on open and returns to the trigger on close; dialogs trap focus; deep-linked/highlighted comments receive focus. |
| **Reduced motion** | System setting honoured (06 §3) + in-app override. Autoplay off under reduced motion. |
| **Captions & media** | Shorts support caption tracks (`captionsUrl`) and a captions toggle; the creator flow asks for an auto-generated caption review (v2.1). Images ask for alt text in the composer. Video never autoplays with sound. |
| **Colour independence** | Status never conveyed by colour alone: watched = check glyph + label; live = Signal + "Airing now" text; errors have icon + text; reactions have distinct glyph shapes. |
| **Semantics** | Headings marked (screen titles, section headers) for heading navigation; lists expose item count/position; tabs expose selected state; toggles expose on/off; progress exposes value ("Episode 6 of 16"). |
| **Language** | Text runs tagged with language (en/ko) so TalkBack switches voices for Hangul titles. |
| **Input** | All actions available without gestures: swipe actions have menu equivalents; long-press menus have a visible ⋯; Shorts pager has next/previous accessibility actions; pinch-zoom has zoom buttons under TalkBack. |
| **Timing** | No auto-dismissing content that requires reading in under 5s except toasts (which are also announced); OTP cooldowns are visible and announced. |
| **Error identification** | Field errors are associated with their fields and announced on change; forms summarise errors at the top when > 1. |
| **Text spacing / keep-all** | Layouts survive 1.5× line spacing and Hangul keep-all wrapping without clipping. |

## 2. Per-component checklist (must pass before merge)

| Component | Checks |
|---|---|
| HallyuButton | role, label, disabled reason exposed (`stateDescription`), loading announced |
| HallyuIconButton | contentDescription mandatory (lint error otherwise); toggle exposes checked |
| HallyuTextField | label association, error announcement, counter announcements at 90/100% |
| HallyuChip | selected state; groups announce "1 of 14" |
| HallyuTabBar / TabRow | selected tab, badge described ("Activity, new items") |
| HallyuBottomSheet | focus moves to title; drag handle has action "Expand/Collapse"; Back closes |
| PostCard | merged description; custom actions; veil rule; images' alt |
| SpoilerBlock | content excluded from tree until revealed; label + reason + actions |
| ReactionButton / Picker | tap and long-press both exposed as actions ("React" / "Choose reaction"); picker items labelled |
| ReactionMeter | each bar announces "Cried, 42 percent, 120 fans" |
| DramaHero | title is a heading; status pill text includes "Airing now"; actions labelled with the drama name ("Follow Goblin") |
| EpisodeRow | "Episode 7, aired Saturday, 214 posts, watched" + action "Mark unwatched" |
| WatchStatusButton / Stepper | value + increment/decrement actions |
| MediaViewer | close first; index announced; zoom actions |
| VideoPlayer | play/pause, mute, captions labelled; progress exposes time |
| NotificationRow | full sentence description; unread state |
| Skeleton | `invisibleToUser`; loading announced once per screen ("Loading feed") |
| Toast / Snackbar | polite live region; action reachable via TalkBack |

## 3. Testing protocol
- Automated: Compose semantics tests for every component (labels, roles, states); contrast lint on tokens; touch-target lint.
- Manual per release: TalkBack pass on the 12 core flows (sign up, onboarding, feed read, react, veil reveal, episode room, post detail + comment, compose post, watchlist +1, collection create, activity, settings); font scale 1.3× and 2.0× screenshots; reduced motion pass; Switch Access on the composer and sheets.
- Real devices: at least one small phone (≤ 5.5"), one large (≥ 6.7"), one tablet, one foldable.
