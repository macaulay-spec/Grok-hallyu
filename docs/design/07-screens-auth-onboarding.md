# 07 · Screens: Splash, Authentication, Onboarding, Guest mode

Template per screen: **Purpose · Hierarchy · Components · Actions · Navigation · Visual · Loading · Empty · Error · Motion.**

---

## 7.0 Splash
- **Purpose:** get to content in under a second; decide where the user goes.
- **Hierarchy:** icon only.
- **Components:** system SplashScreen (04 §1.2).
- **Actions:** none.
- **Navigation:** session valid + onboarding complete → Home; session valid + onboarding incomplete → resume the onboarding step; no session, first launch → Welcome; no session, returning → Welcome with "Log in" emphasised; deep link present → synthetic stack (03 §3). Decision is made from local cache; network refresh happens after the first frame.
- **Visual:** `#0A0A0A`, icon centred.
- **Loading:** hold the splash at most 800ms while reading local state; never wait for network.
- **Empty / Error:** if local state is corrupt → Welcome (never a blank screen).
- **Motion:** 06 › Splash → app.

## 7.1 Welcome
- **Purpose:** make a newcomer feel the product in three seconds and choose a door: create account, log in, or look around.
- **Hierarchy:** (1) full-bleed poster mosaic with scrim + grain; (2) `displayLarge` line **Your dramas. Your people. Your world.**; (3) primary CTA; (4) secondary options.
- **Components:** GrainOverlay, mosaic (12 catalog posters, 3 columns, slow drift), wordmark (22dp), HallyuButton `lg` primary **Create account**, HallyuButton `lg` secondary **Continue with Google**, ghost **Log in**, text link **Explore as a guest** (`accent.text`), footer `caption` "By continuing you agree to the Terms and Privacy Policy" with links.
- **Actions:** Create account → SignUp; Google → Google sign-in flow → (new) Onboarding / (existing) Home; Log in → SignIn; Explore as a guest → Explore tab in guest mode.
- **Navigation:** Back exits the app. After sign-out the user lands here.
- **Visual:** posters at 60% brightness under a scrim rising to `canvas` at 45% height; text always on ≥ 80% scrim; one accent fill.
- **Loading:** mosaic uses bundled low-res posters (no network); Google button shows loading spinner during the native flow.
- **Empty:** n/a (bundled assets).
- **Error:** Google failure → inline error under the button ("Google sign-in didn't complete. Try again or use email."); network down → buttons remain, guest exploration shows cached Explore.
- **Motion:** mosaic drift 20s loop; CTAs fade in 260ms after the first frame; reduced motion → static.

## 7.2 Sign in
- **Purpose:** return quickly and safely.
- **Hierarchy:** (1) `headline` **Welcome back**; (2) email + password; (3) **Log in**; (4) Forgot password; (5) Google; (6) switch to sign up.
- **Components:** HallyuTopBar `stack`, two HallyuTextFields (email: `email` keyboard, autofill; password: eye toggle, autofill, IME done submits), HallyuButton `lg` primary, ghost **Forgot password?**, divider "or", secondary **Continue with Google**, footer link "New to Hallyu? Create an account".
- **Actions:** Log in → validates locally (format) → server → Home (or resume onboarding). Forgot → ForgotPassword. Google → as above.
- **Navigation:** Back → Welcome (or to the AuthGate origin if arrived from a gated action, completing the pending action on success).
- **Visual:** left-aligned form, 24dp margins, fields 52dp, primary CTA full width; no imagery.
- **Loading:** button spinner; fields disabled; no full-screen blocker.
- **Empty:** fields empty with placeholders; Log in disabled until both fields have content.
- **Error:** wrong credentials → single message above the button ("Email or password doesn't match.") — do not indicate which; unverified email → inline banner with **Resend verification**; account suspended → message with Help link; too many attempts → "Try again in 5 minutes" and button disabled with countdown; offline → banner "You're offline — connect to log in".
- **Motion:** error message slides down 160ms; field shake is *not* used (reduced-motion hostile); focus ring transitions 80ms.

## 7.3 Create account
- **Purpose:** collect the minimum to make a real member: email, password, display name, handle, terms.
- **Hierarchy:** (1) `headline` **Create your account**; (2) fields in the order email → password → display name → handle; (3) age + terms checkbox; (4) **Continue**.
- **Components:** HallyuTextFields (password with strength meter: 4 segments, rules "8+ characters, not just letters"; handle with live availability: `@` prefix, lowercase enforced, availability check debounced 400ms showing ✓ "Available" / "Taken — try @mina_kdrama2" with 3 suggestions), HallyuCheckbox row "I'm 13 or older and I agree to the Terms and Community Guidelines", HallyuButton `lg` primary **Continue**, Google button, footer link to Sign in.
- **Actions:** Continue → creates account → VerifyEmail. Handle suggestions tap → fills field.
- **Navigation:** Back → Welcome. Form state survives process death (draft in saved state).
- **Visual:** as Sign in; the strength meter uses `danger → warning → success` and never the accent.
- **Loading:** availability inline spinner 16dp; Continue spinner.
- **Empty:** Continue disabled until all valid + checkbox.
- **Error:** per-field inline errors on blur; email already registered → "Already have an account? Log in" link inline; server failure → ErrorState inline above button, inputs preserved.
- **Motion:** strength segments fill 160ms; availability state icon crossfades.

## 7.4 Verify email
- **Purpose:** confirm ownership without depending on links working in a sideloaded/any build.
- **Hierarchy:** (1) `headline` **Check your inbox**; (2) "We sent a 6-digit code to mina@…"; (3) OTP field; (4) Resend with cooldown; (5) "Wrong email? Change it".
- **Components:** 6-cell OTP input (auto-advance, paste support, SMS-style autofill from email apps where available), HallyuButton primary **Verify** (auto-submits when 6 digits entered), ghost **Resend code (0:45)**, link **Change email**, link **Open email app** (Android intent chooser).
- **Actions:** Verify → Onboarding step 1. Resend → 60s cooldown. Change email → back to SignUp with fields prefilled. Magic link tap in email also works (app link → auto-verifies → same destination).
- **Navigation:** Back → dialog "Leave without verifying? You can verify later from Settings" → Welcome (account exists, unverified; sign-in shows the banner).
- **Visual:** cells 48×56, `surface.1`, active cell `border.strong`, filled `text.primary`.
- **Loading:** cells lock + spinner on Verify.
- **Empty:** Verify disabled until 6 digits.
- **Error:** wrong code → cells outline `danger` + "That code didn't match" + clear; expired → "Code expired — we sent a new one"; 5 wrong → 10 min lock with countdown.
- **Motion:** cell fill 80ms; success → check morph then shared-axis to Onboarding.

## 7.5 Forgot password → Reset → Account recovery
- **ForgotPassword:** `headline` **Reset your password** · email field · **Send code** → always shows the success state ("If that email exists, we sent a code") to avoid enumeration → OTP screen (same component as 7.4) → **ResetPassword**: new password + confirm with strength meter → **Save** → signed in → Home with toast "Password updated".
- **AccountRecovery** (link "Can't access that email?"): short form (handle or old email, new email, note) → submits a support ticket → "We'll get back within 2 days" state. Never automated.
- **States:** offline banner; rate limiting copy; expired/invalid code handling as 7.4.

## 7.6 AuthGate (guest → member)
- **Purpose:** convert at the moment of intent without losing it.
- **Hierarchy:** (1) the thing they tried to do, said back to them: **Sign in to follow Goblin** (title uses the entity name; verbs: follow · react · comment · save · post · track · create a collection); (2) poster/avatar of the entity 64dp; (3) **Continue with Google** · **Create account** · **Log in**.
- **Components:** HallyuBottomSheet `content`, DramaPoster/HallyuAvatar, three buttons, `caption` "Free, always."
- **Actions:** any auth path completes → sheet closes → the pending action executes → the origin screen shows its normal confirmation (e.g. Following state + snackbar). Local guest progress (episode gates answered) is imported silently.
- **Navigation:** dismissable; the pending intent is dropped on dismiss.
- **States:** offline → sheet shows "Connect to sign in"; error → inline under buttons.
- **Motion:** sheet 06; entity poster scales in 0.9 → 1.

## 7.7 Onboarding (5 steps, ≤ 90 seconds total)

Shared frame: HallyuTopBar `stack` with **Skip** at right (except step 3), progress dots (5) under the bar, `display` title, `body` subtitle, content, sticky bottom **Continue** `lg` primary. Step 1 opens with the onboarding line as its eyebrow, `overline` **YOUR DRAMAS. YOUR PEOPLE. YOUR WORLD.**, so the promise made on Welcome is the first thing a new member reads inside (label changes: Continue · Continue · Continue · Continue · **Enter Hallyu**). Each step persists its answers immediately (resume after kill). Shared-axis X between steps.

### Step 1 · Intent — "What brings you to Hallyu?"
- Multi-select tiles (2 columns, 96dp tall, `surface.1`, glyph + label): Discover dramas · Talk about dramas · Find people · Share edits · Track what I watch · Everything. Selecting "Everything" selects all; selected = 1dp accent border + Signal.
- Continue enabled after ≥ 1. Signals stored as `intents`; they reorder later steps' emphasis and the first Home modules (17).
- Loading: none (static). Error: persistence failure is silent; retried later.

### Step 2 · Genres — "Pick what you love"
- 14 genre chips (filter variant, 2–3 rows wrap) + 8 trope/mood tags in a second group "Also into…". Require ≥ 3 genres. Order by global popularity; chips show a tiny count of dramas ("Romance · 1.2k").
- Loading: chips are static (bundled taxonomy). Error: n/a.

### Step 3 · Dramas — "Choose your dramas" (cannot skip; minimum 3)
- Sticky HallyuSearchField at top ("Search any drama"); below, a grid (3 columns compact) of posters ordered: airing now (first 6, with Signal) → popular in selected genres → all-time favourites. Selecting a poster shows the Signal and immediately opens a **micro status sheet**: *Want to watch* · *Watching* (with episode stepper defaulting to 1) · *Completed* — default selection **Completed** for dramas older than a year, **Watching** for airing. Choosing sets the watchlist item; the poster shows a small status glyph.
- Counter in the button: "Continue (2 of 3)". Search results replace the grid while typing; provider import is available here too (zero-result state offers "Import").
- Loading: 12-poster skeleton grid. Empty search: EmptyState "No results — try the Korean title" + Import. Error: ErrorState inline with Retry; selections already made are kept.

### Step 4 · People & fandoms — "Your people"
- Two sections: **Fans like you** (list rows: avatar 48 · name · `caption` "Follows Goblin, The Glory · 1.2k followers" · FollowButton `sm`) ordered by overlap with the user's dramas/genres; 8 rows, all pre-checked? **No** — nothing is pre-followed; a top row **Follow all** (ghost) exists. **Your fandoms**: the dramas chosen in step 3 appear as chips already followed (toggle off allowed) plus 4 suggested dramas.
- Loading: 6 row skeletons. Empty (new platform, few users): show the Hallyu editorial account + "More fans arrive every day" and skip the people section gracefully. Error: inline retry; Continue always enabled.

### Step 5 · Notifications — "Never miss an episode"
- Value primer before the system permission dialog: illustration-free card with three example notifications (episode aired · someone replied · trending in your fandom), toggles for the three channels (Episodes on · Social on · Highlights off by default), button **Turn on notifications** (triggers Android 13+ runtime permission) and ghost **Not now**.
- Denied → toggles stay, banner "You can enable these later in Settings". Either path → **Enter Hallyu** → Home with the first-run overlay (a single tooltip pointing at the Tonight module if any followed drama airs within 24h; otherwise none).

### Onboarding completion
`onboardingCompletedAt` set; profile prompt (avatar + bio) is **not** a step — Home's first session shows a dismissible inline module "Add a photo so fans recognise you" (once).

## 7.8 Guest mode (unauthenticated member of the public)
| Surface | Guest behaviour |
|---|---|
| Home | Shows **Trending** feed (server-curated, spoiler labels shown, veils in strict mode using local progress) with a top banner "Sign up to build your own feed". Following segment shows an EmptyState with sign-up. |
| Explore / Search / Drama / Episode / Actor / Post / Collections (public) | Fully readable. |
| Any write or personal action | AuthGate (7.6). |
| Activity | EmptyState "Sign in to see your activity". |
| You | Sign-in prompt screen with the three auth buttons and "What you get" list. |
| Settings | Appearance, Content (local), About, Help available; account pages hidden. |
Guest state is local only; no server identity is created until sign-up.
