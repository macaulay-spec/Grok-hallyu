/**
 * Global JS error trap — the first thing the bundle runs (imported before anything else in
 * app/_layout.tsx).
 *
 * In a release build, an uncaught JS exception (a module-init throw, an async callback outside a
 * boundary, a promise rejection nobody handles) takes the whole process down: the app "opens and
 * instantly exits" with nothing on screen. This trap intercepts those at the runtime level: the
 * error is logged, persisted as a breadcrumb, and — in release only — swallowed so the app stays
 * alive. ErrorBoundaries already own the render path; this owns everything that escapes them.
 * In dev the original handler still runs so red boxes and Metro keep working.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { markBoot } from './boot';

export interface CrashRecord {
  name: string;
  message: string;
  stack?: string;
  at: string;
}

const CRASH_KEY = 'hallyu.crash.last';
let installed = false;
// Release errors surface once per unique message — visible, but never alert-spamming.
const alertedSignatures = new Set<string>();

interface ErrorUtilsLike {
  setGlobalHandler(handler: ((error: unknown, isFatal?: boolean) => void) | undefined): void;
  getGlobalHandler?(): ((error: unknown, isFatal?: boolean) => void) | undefined;
}

/** Install once. Safe to call again; the first call wins. */
export function installGlobalErrorTrap(): void {
  if (installed) return;
  installed = true;
  const eu = (global as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!eu) return;
  const original = eu.getGlobalHandler?.();
  eu.setGlobalHandler((error, isFatal) => {
    const e = error instanceof Error ? error : new Error(String(error));
    try {
      if (__DEV__) console.warn(`[hallyu:crash] ${isFatal ? 'fatal' : 'error'}`, e.message, e.stack);
      void AsyncStorage.setItem(
        CRASH_KEY,
        JSON.stringify({ name: e.name, message: e.message, stack: e.stack?.slice(0, 2000), at: new Date().toISOString() } satisfies CrashRecord),
      ).catch(() => {});
    } catch {
      /* diagnostics must never throw */
    }
    if (__DEV__ && original) {
      original(error, isFatal);
      return;
    }
    // Release: keep the process alive, but make the failure VISIBLE — a silent exit or a silent
    // freeze helps nobody. Once per unique message; the breadcrumb is persisted for diagnostics.
    const sig = (e.message || String(e)).slice(0, 80);
    if (!alertedSignatures.has(sig)) {
      alertedSignatures.add(sig);
      markBoot(`fatal:${sig.slice(0, 60)}`);
      Alert.alert('Hallyu hit an error', `${e.name}: ${e.message}`.slice(0, 400));
    }
  });
}

/** The last uncaught error this device saw (for Settings → diagnostics / support). */
export async function lastCrash(): Promise<CrashRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}
