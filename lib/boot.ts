import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'hallyu.boot.last';
const t0 = Date.now();

/**
 * Boot breadcrumb trail: one line per startup phase, persisted best-effort. If a release build
 * ever stalls at startup, the trail shows exactly which phase never completed. Surfaced by the
 * diagnostics tap on the splash gate (app/index.tsx); written by the entry, the crash trap,
 * the layout font gate, store hydration, auth boot and the splash redirect.
 */
export function markBoot(phase: string): void {
  const line = `+${Date.now() - t0}ms ${phase}`;
  try {
    void (async () => {
      const raw = await AsyncStorage.getItem(KEY).catch(() => null);
      const trail: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      trail.push(line);
      await AsyncStorage.setItem(KEY, JSON.stringify(trail.slice(-40))).catch(() => {});
    })().catch(() => {});
  } catch {
    /* boot markers must never throw */
  }
}

/** Start a fresh trail (called once at bundle entry, before anything else). */
export function resetBootTrail(): void {
  try {
    AsyncStorage.setItem(KEY, JSON.stringify(['+0ms launch'])).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** The full trail, for diagnostics display. */
export async function bootTrail(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const trail: string[] = raw ? JSON.parse(raw) : [];
    return trail.length ? trail.join('\n') : '(trail empty)';
  } catch {
    return '(trail unavailable)';
  }
}
