#!/bin/sh
# =============================================================================
# Hallyu CI — release APK boot gate (executed on the emulator by
# reactivecircus/android-emulator-runner via `script: sh scripts/ci/boot-check.sh`).
#
# WHY THIS IS A FILE AND NOT INLINE YAML (hard-won, proven against the action's
# source, src/script-parser.ts): the action splits a multi-line `script:` input
# LINE-BY-LINE and runs every line as its own `sh -c '<line>'` process. Shell
# functions, if/while/case blocks and even `exit 1` inside an if-body are
# therefore shredded — that produced the historical exit-127 ("note: not found")
# and exit-2 (stray `fi`) gate failures. Any real logic MUST live in a committed
# script file like this one; the YAML may only contain the single command line.
#
# WHAT IT ASSERTS (hard gate — non-zero exit fails the whole build):
#   1. the release APK is located and installs (adb install + package present);
#   2. a cold start reaches the app's own boot marker
#      "[hallyu:boot] ... index:redirect" within ~60s (splash left, routed to
#      welcome/onboarding/tabs — no frozen splash, no navigate-before-mount race);
#   3. NO "[hallyu:crash]" (global error trap fired), NO "Attempted to navigate
#      before mounting", NO "index:nav-failed" — a swallowed JS error is a
#      failed build, never green-with-errors-underneath;
#   4. NO "FATAL EXCEPTION" / "ANR in" in logcat.
# Evidence (logcat-full/-errors/-boot-trail.txt) is written to the workspace
# root and uploaded as the boot-test-logcat artifact regardless of outcome.
#
# Pure POSIX sh (dash-safe): no arrays, no [[ ]], no pipefail, no local.
# =============================================================================
set -u

PKG=com.hallyu.app
ACTIVITY="$PKG/.MainActivity"
MARKER='\[hallyu:boot\].*index:redirect'
BAD_JS='\[hallyu:crash\]|Attempted to navigate before mounting|index:nav-failed'
FAILED=0

note() { echo "::notice::[boot-check] $*"; }
fail() { echo "::error::[boot-check] $*"; FAILED=1; }

# --- 1. Locate the APK -----------------------------------------------------------------------
# The action's cwd is the workspace root; fall back to a filesystem search if the
# conventional path moved (e.g. custom working-directory).
APK="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  APK="$(find /home/runner/work -type f -name app-release.apk -path '*/outputs/apk/release/*' 2>/dev/null | head -1)"
fi
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "::error::[boot-check] could not locate app-release.apk — cannot run the boot gate"
  exit 1
fi
note "apk=$APK"

# --- 2. Device + install ----------------------------------------------------------------------
rc=0; adb devices || rc=$?
note "stage=adb-devices exit=$rc"

rc=0; adb install -r "$APK" || rc=$?
note "stage=install exit=$rc"
if [ "$rc" != "0" ]; then fail "adb install failed (exit=$rc)"; fi

if adb shell pm list packages 2>/dev/null | grep -q "^package:$PKG$"; then
  note "stage=package-present ok"
else
  fail "package $PKG not present after install"
fi

# --- 3. Cold start ------------------------------------------------------------------------------
adb logcat -c 2>/dev/null || true
rc=0; adb shell am start -n "$ACTIVITY" || rc=$?
note "stage=am-start exit=$rc"
if [ "$rc" != "0" ]; then fail "am start failed (exit=$rc)"; fi

# --- 4. Poll for the app's own redirect marker (30 x 2s = ~60s ceiling; the app's designed
#        worst case is font gate 1.2s + auth ceiling 1.5s + bailout 2.5s) -------------------------
FOUND=no
i=0
while [ "$i" -lt 30 ]; do
  sleep 2
  i=$((i + 1))
  # The real line looks like: [hallyu:boot] +431ms index:redirect:tabs /(tabs)
  if adb logcat -d 2>/dev/null | grep -q "$MARKER"; then
    FOUND=yes
    break
  fi
done
note "stage=poll iterations=$i marker_found=$FOUND"

# --- 5. Capture evidence into the workspace root (uploaded by the artifact step) ----------------
adb logcat -d > logcat-full.txt 2>/dev/null || true
adb logcat -d '*:E' > logcat-errors.txt 2>/dev/null || true
adb logcat -d 2>/dev/null | grep '\[hallyu:boot\]' > logcat-boot-trail.txt || true

echo "=== BOOT TRAIL ==="
cat logcat-boot-trail.txt 2>/dev/null || true
echo "=== LOGCAT ERRORS (*:E, first 80) ==="
head -80 logcat-errors.txt 2>/dev/null || true
echo "====================================="

# --- 6. Hard assertions --------------------------------------------------------------------------
if grep -qE 'FATAL EXCEPTION|ANR in' logcat-full.txt 2>/dev/null; then
  fail "FATAL EXCEPTION or ANR during the launch window"
  grep -E 'FATAL EXCEPTION.*|ANR in.*' logcat-full.txt 2>/dev/null | head -4 | while IFS= read -r l; do
    echo "::error::[fatal-line] $l"
  done
fi

if grep -qE "$BAD_JS" logcat-full.txt 2>/dev/null; then
  fail "swallowed JS error during launch — crash trap fired or navigation failed"
  grep -E "$BAD_JS" logcat-full.txt 2>/dev/null | head -6 | while IFS= read -r l; do
    echo "::error::[crash-line] $l"
  done
fi

if [ "$FOUND" != "yes" ]; then
  fail "cold start never reached [hallyu:boot] index:redirect within ~60s"
  tail -12 logcat-boot-trail.txt 2>/dev/null | while IFS= read -r l; do
    echo "::error::[boot-trail] $l"
  done
fi

if [ "$FAILED" != "0" ]; then
  echo "::error::[boot-check] BOOT GATE FAILED — the APK does not cold-start cleanly"
  exit 1
fi

note "PASSED — installed, cold-started, redirected, no JS crash, no FATAL/ANR"
exit 0
