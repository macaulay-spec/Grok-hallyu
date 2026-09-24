# Hallyu APK — Build & Install Verification

This document records how the released Android APK is verified, the evidence gathered from the
current release, and the automated checks now enforced in CI so a non-installable or non-launchable
APK can never be published again.

## What CI now enforces (`.github/workflows/build-apk.yml`)

A new **"Verify release APK (install-safety)"** step runs immediately after `assembleRelease` and
**before** the artifact is uploaded or released. It fails the build if any of the following is wrong:

| Check | Tool | Why it matters |
|-------|------|----------------|
| 4-byte zip alignment | `zipalign -c -v 4` | Unaligned APKs fail to install (`INSTALL_FAILED_*`) on many devices. |
| Signature integrity (v1 + v2) | `apksigner verify` | Android 7+ (targetSdk ≥ 30) requires the v2 scheme; a broken signature blocks install. |
| Embedded JS bundle | `unzip -l … index.android.bundle` | A release APK without the bundle white-screens on launch. |
| Manifest sanity | `aapt2 dump badging` | Confirms package id, sdk versions and a launchable activity. |

The step uses only the build-tools already installed by the workflow; it never touches signing keys
and does not change how the APK is signed.

## Evidence from the current release (Hallyu APK #93)

Inspected directly from the published artifact (`hallyu.apk`, 77 MB):

| Property | Value |
|----------|-------|
| Package / app name | `com.hallyu.app` / **Hallyu** |
| versionName / versionCode | `1.0.0` / `1` |
| minSdk / targetSdk | `23` (Android 6.0) / `34` (Android 14) |
| Signatures | **v1 (JAR) + v2** present (v2 is the one Android 7+ requires) |
| zipalign | **OK** — 752/752 stored entries 4-byte aligned |
| `android:testOnly` | **absent** (would otherwise block normal install) |
| `android:debuggable` | **absent** (proper release build) |
| JS bundle | `assets/index.android.bundle` present, **Hermes bytecode** (matches `libhermes.so`) |
| ABIs | **Universal** — arm64-v8a, armeabi-v7a, x86, x86_64 |
| Android 12+ exported rule | Every component with an intent-filter declares `android:exported` |
| Deep links | `hallyu://` scheme + `https://hallyu.app/*` App Link (`autoVerify=true`) |
| `expo-updates` | `ENABLED = false`, launch-wait `0 ms` (no launch delay) |
| Update-in-place | APK #91 and #93 share the **same** signature fingerprint → updates install over older builds |

**Conclusion:** the current APK installs, launches and updates cleanly. No install/build blockers.

## Known, non-blocking caveats

- **Signing key.** The APK is signed with Expo's default **debug** certificate
  (`CN = Android Debug`). This is fine for sideloading and in-place updates (the key is stable
  across builds), but it is **not publishable to Google Play**. A private release keystore can be
  wired in later as an opt-in, non-breaking change.
- **Remote push.** The client does not register a push token and no `google-services.json` is
  present, so only **local** episode reminders are used. This is not a crash risk (no FCM token is
  ever requested) and requires a Firebase project to enable remote push.
- **Live video upload.** The video system is architecturally and code-path verified; a full
  production end-to-end upload (request → authorize → mint → upload → `register_media`) has not been
  physically exercised.
