/**
 * Cloud analytics sink — attaches the real destination for `track()` calls: batches are
 * flushed to the cloud pipeline (POST /events) where they land in the Durable Object and are
 * mirrored into Supabase Postgres for the admin console. Signed-in users only; guests and
 * offline flushes are dropped by design — analytics must never disturb the UI or retry forever.
 */
import { RORK_FUNCTIONS_URL } from '../constants/keys';
import { currentAccessToken } from './auth';
import { setAnalyticsSink, type AnalyticsEvent } from './analytics';

const FLUSH_SIZE = 20;
const FLUSH_INTERVAL_MS = 15_000;

export function attachCloudAnalytics(): void {
  if (!RORK_FUNCTIONS_URL) return;
  const queue: { name: AnalyticsEvent; props?: Record<string, unknown> }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    const token = currentAccessToken();
    if (!token || !queue.length) return;
    const batch = queue.splice(0, FLUSH_SIZE);
    try {
      await fetch(`${RORK_FUNCTIONS_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      /* offline — the batch is dropped; analytics is never worth retry machinery */
    }
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
