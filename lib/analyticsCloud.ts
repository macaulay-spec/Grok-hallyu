/**
 * Cloud analytics sink — the real destination for `track()` calls: batches land in the `events`
 * table of the managed Postgres database for the admin console. Signed-in users only; guests and
 * offline flushes are dropped by design — analytics must never disturb the UI or retry forever.
 */
import { currentAccessToken } from './auth';
import { setAnalyticsSink, type AnalyticsEvent } from './analytics';
import { supabase } from './supabase';

const FLUSH_SIZE = 20;
const FLUSH_INTERVAL_MS = 15_000;

export function attachCloudAnalytics(): void {
  const queue: { name: AnalyticsEvent; props?: Record<string, unknown> }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    const token = currentAccessToken();
    if (!token || !queue.length) return;
    const batch = queue.splice(0, FLUSH_SIZE);
    const { error } = await supabase.from('events').insert(
      batch.map((b) => ({ name: b.name, props: b.props ?? {} })),
    );
    if (error) console.warn('analytics.flush', error.message); // dropped — never worth retry machinery
  };

  const schedule = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
  };

  setAnalyticsSink({
    track: (event, props) => {
      queue.push({ name: event, props });
      if (queue.length >= FLUSH_SIZE) void flush();
      else schedule();
    },
  });
}
