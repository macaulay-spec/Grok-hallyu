# 06 · Motion & Haptics

Motion exists to explain (where did this come from, what changed), to confirm (it worked), and to set tone (cinematic = unhurried, weighted, quiet). If an animation does none of these, it is removed.

## 1. Tokens
| Token | Value | Use |
|---|---|---|
| `motion.duration.instant` | 80ms | pressed states, toggles |
| `motion.duration.short` | 160ms | chips, icon fills, fades in place |
| `motion.duration.medium` | 260ms | screen transitions, sheets, tab indicator, list item insert/remove |
| `motion.duration.long` | 400ms | hero collapse, media open/close, spoiler reveal |
| `motion.duration.slow` | 600ms | splash exit, Welcome mosaic settle |
| `motion.easing.standard` | cubic-bezier(0.2, 0, 0, 1) | most property changes |
| `motion.easing.emphasizedDecel` | cubic-bezier(0.05, 0.7, 0.1, 1) | entering elements |
| `motion.easing.emphasizedAccel` | cubic-bezier(0.3, 0, 0.8, 0.15) | exiting elements |
| `motion.spring.snappy` | stiffness 700, damping 0.75 | reaction burst, follow toggle |
| `motion.spring.gentle` | stiffness 300, damping 0.85 | sheets, pull-to-refresh settle, tab bar show/hide |

## 2. Choreographies

| Moment | Behaviour |
|---|---|
| **Splash → app** | Android splash icon holds; app first frame fades in over 300ms while the icon scales 1.0 → 0.92 and fades out. No custom splash screen after the system one. |
| **Tab switch** | Content crossfades 160ms; the Signal under the tab slides horizontally 260ms `standard`; icon outline → filled morph (weight/fill axis) 160ms. |
| **Stack push/pop** | Shared-axis X: incoming slides 32dp → 0 with fade (260ms `emphasizedDecel`); outgoing fades to 0 at 0.8 opacity with −8dp parallax. Predictive back previews the same in reverse, tracking the gesture. |
| **Poster → Drama hero** | Shared element: poster morphs from card size to hero poster position (400ms `standard`); backdrop fades in beneath; title/meta stagger in 40ms apart. Falls back to a plain push when the poster is off-screen. |
| **Hero collapse** | Backdrop parallax at 0.5× scroll; scrim deepens; at 56dp of overlap the top bar background fades to `canvas` 92% and the title fades in (160ms). |
| **Bottom sheet** | Slide-up 260ms `emphasizedDecel` with scrim fade; drag follows the finger 1:1; release above 50% velocity threshold snaps to the next detent with `spring.gentle`. Dismiss 200ms `emphasizedAccel`. |
| **Composer open/close** | Slide-up modal 260ms; close mirrors. On publish: the Post button morphs into a check (160ms), the modal dismisses, and a snackbar rises. |
| **Media open** | Image expands from its card bounds to full screen (400ms `standard`) over a black fade-in; close mirrors, or swipe-down with 1:1 drag, 0.9 scale at 120dp, release past 160dp dismisses. |
| **Reaction (tap)** | Heart outline → filled with a scale burst 1 → 1.35 → 1 (`spring.snappy`, ~360ms) and 6 particle dots in the reaction colour radiating 16dp and fading (280ms). Count increments with a 12dp vertical roll. Un-react: fill → outline 160ms, no burst. |
| **Reaction picker** | Six glyphs scale-in staggered 30ms each from 0.6 with fade; selected glyph scales 1.2 then flies 24dp toward the bar and the bar updates; picker collapses 160ms. |
| **Spoiler reveal** | Veil surface splits: the label rises and fades (160ms), the veil fades out while the content beneath fades in from 0.96 scale (400ms `standard`); media un-blurs from 24px → 0 over the same 400ms. Never instant — the user must perceive that a boundary was crossed. |
| **Episode gate** | Sheet slides up; choosing "I've watched it" plays a 200ms check-fill then all veils on the page reveal in a top-to-bottom stagger (40ms each, max 8). |
| **Follow / watch status** | Button width animates to the new label (260ms); tonal colour crossfades; light haptic. |
| **Watch progress +1** | Number rolls up 12dp (160ms); progress bar fill animates 260ms; on reaching the last episode the bar turns `success` and a dialog offers "Mark completed?". |
| **List changes** | Insert: fade + 8dp slide 260ms; remove (hide/not interested): collapse height 260ms `emphasizedAccel` then neighbours settle. New-posts merge: pill dismisses, list scrolls to top (400ms), items fade in staggered 30ms up to 10. |
| **Pull to refresh** | Custom indicator: the Signal grows from 0 → 8dp as the user pulls, pulses while loading, collapses on completion. |
| **Skeleton → content** | Skeleton fades out as content fades in (160ms); no layout jump because skeletons match real sizes. |
| **Tab bar hide/show** | translateY 0 → 100% with `spring.gentle`, triggered by scroll direction after 24dp of movement. |
| **Toast / snackbar** | Rise 16dp + fade 160ms; exit fade 160ms. |
| **Shorts** | Vertical pager with 1:1 drag, snap with `spring.gentle`; double-tap = Loved burst at the tap point; overlay chrome fades out after 3s of no interaction and returns on tap. |
| **Onboarding steps** | Shared-axis X between steps; progress dots fill 160ms; selected tiles get the Signal with a 160ms pop. |
| **Live indicator** | 8dp Signal with a ring expanding 8 → 20dp and fading over 1.6s, repeating; paused when off-screen. |
| **Welcome mosaic** | Poster mosaic drifts 12dp over 20s in a slow loop; grain static. |

## 3. Reduced motion (system setting → `motion.reduced = true`)
| Normal | Reduced |
|---|---|
| Slides, shared elements, parallax | Crossfades 160ms only |
| Reaction burst + particles | Fill change only |
| Spoiler reveal fade/scale/un-blur | Instant swap with a 160ms fade |
| Live pulse ring | Static Signal |
| Welcome drift, skeleton shimmer | Static |
| Shorts autoplay | Off by default (user can enable in Content settings) |
| Snap physics | Linear 200ms |

## 4. Haptics (Android `HapticFeedbackConstants` / `VibrationEffect`)
| Event | Effect |
|---|---|
| React, save, follow, watch status change | `CONFIRM` / light tick |
| Reaction picker open, long-press menus | `LONG_PRESS` |
| Progress stepper tick | `CLOCK_TICK` per step |
| Sheet reaching a detent | `GESTURE_END` (subtle) |
| Publish success | double light tick |
| Destructive confirm (delete, block) | `REJECT` (heavier) |
| Errors | none (visual only) |
Respect the system "touch feedback" setting; no haptics while media is playing in Shorts except double-tap react.
