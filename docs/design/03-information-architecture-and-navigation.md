# 03 · Information Architecture & Navigation

## 1. Primary navigation

Five destinations. Bottom bar on compact windows; navigation rail on medium/expanded (16).

| Tab | Icon (Material Symbols Rounded) | Root screen | Badge |
|---|---|---|---|
| **Home** | `home` | Home (For You / Following) | none |
| **Explore** | `explore` | Explore | none |
| **Create** | `add` inside a Rose rounded-square (40×40) | *Opens Create hub sheet; not a screen* | none |
| **Activity** | `notifications` | Activity | the Signal (dot) when unseen items exist — never a number |
| **You** | avatar (24dp) or `person` when signed out | Profile (own) / Sign-in prompt for guests | dot when profile is incomplete (first 7 days only) |

Rules
- Each tab owns an independent back stack; switching tabs preserves scroll position and stack.
- Re-tap the active tab → scroll to top (animated). Re-tap again within 1s at top → refresh.
- Create never switches tabs; the sheet opens over the current one. On medium/expanded, Create is a FAB at the top of the rail.
- Tab bar hides on scroll-down in long lists (Home, Explore, Drama Community, Profile), reappears on scroll-up or when reaching the top; never hides on tablets.
- Guests see all five tabs; Activity and You show sign-in prompts.

## 2. Screen inventory

Type: **R** tab root · **S** stack screen · **M** full-screen modal · **B** bottom sheet · **D** dialog · **O** overlay.

| ID | Screen | Type | Entered from | Doc |
|---|---|---|---|---|
| Splash | Splash | O | cold start | 07 |
| Welcome | Welcome | S | first launch, sign-out | 07 |
| SignIn / SignUp | Sign in / Create account | S | Welcome, AuthGate | 07 |
| VerifyEmail | Verify email | S | SignUp | 07 |
| ForgotPassword / ResetPassword | Recovery | S | SignIn | 07 |
| AccountRecovery | Can't access email | S | ForgotPassword | 07 |
| AuthGate | Sign in to continue | B | any gated action as guest | 07 |
| Onb1…Onb5 | Intent · Genres · Dramas · People · Notifications | S (own stack) | after VerifyEmail / Google sign-up | 07 |
| Home | Home | R | tab | 08 |
| Explore | Explore | R | tab | 08 |
| Search | Search (typeahead + grouped results) | S | Explore field, search icons | 08 |
| SearchResults | Results by type (Dramas / Actors / People / Posts / Episodes / Collections) | S | Search "See all" | 08 |
| AiringSchedule | This week in K-drama | S | Home Tonight, Explore | 08 |
| GenreBrowse | Genre / tag browse | S | Explore chips | 08 |
| TrendingConversations | Trending conversations | S | Explore, Home module | 08 |
| DramaHub | Drama (Overview · Community · Episodes · Cast · Media · Activity) | S | everywhere | 09 |
| Episode | Episode | S | DramaHub Episodes, Tonight, Context strip, notifications | 09 |
| Actor | Actor | S | cast, Context strip, search | 09 |
| PostDetail | Post / Discussion / Review / Recommendation | S | cards, notifications, deep links | 10 |
| CommentThread | Replies to a comment | S | PostDetail "View replies" | 10 |
| ShortsViewer | Shorts | M (immersive) | Short cards, Explore, Profile Shorts, Drama Media | 10 |
| MediaViewer | Full-screen media | M (transparent) | any image | 10 |
| CreateHub | Create | B | tab, FAB, empty states | 11 |
| ComposerPost/Reaction/Discussion/Review/Recommendation/Short | Composers | M | CreateHub, contextual "Post about this" | 11 |
| DramaPicker / EpisodePicker / ActorPicker / SpoilerPicker / CollectionPicker | Pickers | B | composers, watchlist, collections | 11, 12 |
| Drafts | Drafts | S | composer overflow, You | 11 |
| Watchlist | Watchlist | S | You, Home modules, DramaHub | 12 |
| WatchlistItemSheet | Update progress | B | anywhere a drama shows status | 12 |
| Collections | Collections (mine + saved) | S | You, Profile tab | 12 |
| CollectionDetail | Collection | S | cards, profile, Explore | 12 |
| CollectionEditor | New / Edit collection | M | Collections, CollectionDetail | 12 |
| AddToCollection | Add to collection | B | DramaHub, cards' overflow | 12 |
| Activity | Activity | R | tab, push | 13 |
| Profile | Profile (own = You root; others = stack) | R/S | tab, avatars, mentions | 13 |
| EditProfile | Edit profile | M | Profile | 13 |
| FollowList | Followers / Following | S | Profile stats | 13 |
| Saved | Saved | S | Profile, You | 13 |
| Settings… | Settings root + Account, Notifications, Content & Spoilers, Privacy & Safety, Blocked/Muted, Appearance, Language, Data & Storage, About/Credits, Help, Delete account | S | Profile ⚙︎ | 13 |
| ReportSheet / BlockDialog | Report · Block | B / D | overflow menus | 13, 14 |
| ShareSheet | Share | B (system) | share icons | 10 |
| Offline / ErrorFull / UpdateRequired / Maintenance | System | O / S | runtime | 14 |

## 3. Routes and deep links

Universal links on `https://hallyu.app/…` (Android App Links, verified) and the custom scheme `hallyu://`. Every entity has a canonical URL; share sheets always share the https form.

| Entity | Path | Notes |
|---|---|---|
| Drama | `/d/{slug}` | `?tab=community\|episodes\|cast\|media\|activity` |
| Season | `/d/{slug}/s{n}` | opens Episodes tab with season selected |
| Episode | `/d/{slug}/s{n}/e{n}` | `#discussion` scrolls to discussion |
| Actor | `/a/{slug}` | |
| Person | `/u/{handle}` | `?tab=posts\|shorts\|reviews\|collections` |
| Post (any type) | `/p/{id}` | `?c={commentId}` highlights a comment |
| Short | `/s/{id}` | opens ShortsViewer seeded with that short |
| Collection | `/c/{id}` | |
| Search | `/search?q=…&type=…` | |
| Schedule | `/airing` | `?day=sat` |
| Genre | `/genre/{slug}` | |
| Settings deep links | `/settings/notifications` etc. | used by system notifications |
| Auth callbacks | `/auth/callback`, `/auth/reset` | email links; app-links-verified |

Deep-link entry builds a **synthetic back stack** so Back never exits the app unexpectedly: `Home → Drama → Episode` for an episode link; `Home → Profile → Post` for a post link opened from a share. Notifications from Activity behave the same (Back returns to Home, not Activity, unless the user came *from* Activity).

## 4. Navigation containers

| Container | Used for | Enter | Exit | Back |
|---|---|---|---|---|
| **Tab root** | the five destinations | tab tap | — | on Home: double-back to exit (toast "Press back again to exit"); on other tabs: return to Home first |
| **Stack** | entity and list screens | push (shared-axis X, 06) | pop | pops one |
| **Full-screen modal** | composers, editors, Shorts, media viewer | slide-up (composers/editors) or fade+scale (viewer) | dismiss | composers: if dirty → Discard/Save draft dialog; viewer: swipe-down or Back |
| **Bottom sheet** | pickers, actions, Create hub, AuthGate, progress, report | slide-up with scrim | drag-down, scrim tap, Back, or completing the action | closes sheet only |
| **Dialog** | destructive confirmations only (block, delete, discard, sign out) | fade+scale | button | cancels |
| **Immersive** | Shorts viewer | modal | swipe-down / Back | exits viewer to origin |

Predictive back (Android 14+ / default on API 36) is supported on every stack and modal; sheets and dialogs consume the back gesture with their own preview.

## 5. The tap → result table (major interactions)

| Where | Tap | Result |
|---|---|---|
| Any card | avatar / name | push Profile |
| Any card | Context strip drama name/poster | push DramaHub (Overview) |
| Any card | Context strip `Ep 9` | push Episode (Discussion section) |
| Any card | Context strip actor chip | push Actor |
| Any card | body / whitespace | push PostDetail (Discussion → PostDetail scrolled to comments) |
| Any card | media | open MediaViewer (images) / ShortsViewer (video) |
| Any card | ♥ react | tap = Loved toggle (optimistic, haptic); long-press = ReactionPicker |
| Any card | comment icon | push PostDetail with composer focused |
| Any card | save | toggle Saved (toast "Saved · View" once per session) |
| Any card | share | system share sheet with canonical URL + "Share as image" option |
| Any card | ⋯ | ActionSheet (Not interested · Mute drama · Mute/Block user · Report · Copy link · Add drama to collection · Edit/Delete if own) |
| Any text | #hashtag | push SearchResults (Posts, q = tag) |
| Any text | @mention | push Profile |
| Any text | link | opens in an in-app Custom Tab; long-press to copy |
| Veiled card | Reveal | unveil with animation; log `spoiler_reveal` |
| Veiled card | Reveal & mark watched | set progress → unveil → toast "Marked Ep 8 watched · Undo" |
| DramaHub | Follow | toggle (optimistic) → first time: snackbar "You'll get episode alerts · Manage" |
| DramaHub | Watch status button | WatchlistItemSheet |
| DramaHub | Share | share sheet |
| DramaHub | tab label | switch section (sticky tabs, no navigation) |
| DramaHub Episodes | episode row | push Episode |
| DramaHub Episodes | ✓ on row | mark watched up to that episode (dialog if skipping > 1: "Mark Ep 1–8 watched?") |
| DramaHub Cast | actor | push Actor |
| Episode | "Have you watched?" gate | sets progress or peeks |
| Episode | React | ReactionPicker (episode-scoped Reaction post) |
| Episode | Discuss | ComposerDiscussion pre-scoped to episode |
| Episode | ◀ ▶ | replace with prev/next Episode (horizontal shared axis) |
| Actor | Follow | toggle |
| Actor | filmography item | push DramaHub (or provider stub → import → DramaHub) |
| Home | Tonight card | push Episode (latest aired) |
| Home | "New posts" pill | scroll to top + merge new items |
| Home segmented | For You / Following | switch feed, position remembered per feed |
| Explore | search field | push Search (field focused, keyboard up) |
| Explore | any rail "See all" | push list screen |
| Search | drama result | push DramaHub; "Import" → ingest → DramaHub (stub state) |
| Create tab | tap | CreateHub sheet |
| CreateHub | type | push composer modal |
| Composer | Post | publish (optimistic) → dismiss → toast "Posted · View"; Reaction publishes in-sheet |
| Composer | close (dirty) | dialog: Save draft / Discard / Keep editing |
| Activity | grouped item | push target (post, profile, episode, collection); marks read |
| Activity | "Follow back" | toggle inline |
| Profile | Followers / Following | push FollowList |
| Profile | favourites shelf poster | push DramaHub |
| Profile (own) | Edit | EditProfile modal |
| Profile (own) | ⚙︎ | push Settings |
| Profile (other) | ⋯ | ActionSheet (Share · Mute · Block · Report) |
| Watchlist | +1 episode | increments progress (haptic) → snackbar "Ep 7 · Undo"; at last episode → "Mark completed?" |
| Collections | + | CollectionEditor |
| CollectionDetail | Save | toggle followed collection |
| Settings | Delete account | push DeleteAccount (type DELETE) |
| Guest, any gated action | — | AuthGate sheet ("Sign in to follow Goblin") → after auth, the action completes and returns |

## 6. Cross-cutting navigation rules
- **Scroll position** is restored on Back for every list.
- **Pull-to-refresh** exists on every root list; entity screens refresh silently on re-entry if stale > 5 min.
- **Toasts vs snackbars:** toast for confirmations without an action; snackbar (with action, 5s) whenever Undo or View is possible.
- **Loading between screens:** navigate immediately with header content (title/poster) passed as arguments, then hydrate; never block navigation on a network call.
- **Keyboard:** composers and comment bars are keyboard-aware (IME padding); Back with keyboard open closes the keyboard first, second Back navigates.
- **Orientation:** portrait-locked on compact; free on medium/expanded; Shorts and MediaViewer allow landscape everywhere.

## 7. Primary journeys (screen sequences)

| Journey | Sequence |
|---|---|
| **First run → member** | Splash → Welcome → SignUp → VerifyEmail → Onb1 Intent → Onb2 Genres → Onb3 Dramas (+ micro status sheets) → Onb4 People → Onb5 Notifications → Home (first-run tooltip) |
| **Air-night** | Push "Ep 7 just aired" → Episode (gate: I've watched it) → React (sheet) → back to Episode → PostDetail (a discussion) → comment → Activity later → PostDetail (reply) |
| **Discovery chain** | Home card → ContextStrip actor → Actor → filmography item → DramaHub → Follow → Community → PostDetail → author Profile → Collections tab → CollectionDetail → Save |
| **Lurker session** | Home (For You) → veil reveal → Save → Explore → Trending dramas lead → DramaHub Overview → WatchStatus (Want) → back → Search → provider import → DramaHub (stub) |
| **Creator session** | Create tab → Discussion → DramaPicker → EpisodePicker → SpoilerPicker → publish → snackbar View → PostDetail → Activity (reactions) |
| **Curation** | You → Collections → New collection → DramaPicker (multi) → notes → Save → CollectionDetail → Share |
| **Safety** | PostCard ⋯ → Report → reason → confirm → Mute drama → Settings › Blocked & muted (review) |
| **Guest → member** | Welcome › Explore as a guest → DramaHub → Follow → AuthGate → Google → follow completes → Onboarding (shortened: steps 1–2 skipped when intent is inferred from the gated action; steps 3–5 shown) |
