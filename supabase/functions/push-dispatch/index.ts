// POST /functions/v1/push-dispatch  {}   (internal: pg_cron every minute, header x-internal-key)
// Drains the `push_outbox` queue: renders one message per device token (api.push_render), sends to Expo in batches of 100,
// disables dead tokens (DeviceNotRegistered), marks notifications as pushed and deletes the queue messages.
import { fail, json, serve } from '../_shared/http.ts';
import { admin, rpc } from '../_shared/supabase.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const BATCH = 100;
const MAX_MESSAGES = 500;

interface QueueMsg {
  msgId: number;
  readCt: number;
  message: { notificationId: string; userId: string };
}
interface Rendered {
  notificationId: string;
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
}
interface Ticket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

serve(async (req) => {
  const db = admin();
  const expected = await rpc<string | null>(db, 'internal_key');
  const got = req.headers.get('x-internal-key') ?? '';
  if (!expected || got.length !== expected.length || !timingSafeEqual(got, expected)) return fail(401, 'Unauthorized', { retryable: false });

  const msgs = await rpc<QueueMsg[]>(db, 'queue_read', { p_queue: 'push_outbox', p_qty: MAX_MESSAGES, p_vt: 90 });
  if (!msgs.length) return json({ sent: 0, failed: 0, drained: 0 });

  const byNotification = new Map<string, number[]>();
  for (const m of msgs) {
    const id = m.message?.notificationId;
    if (!id) continue;
    byNotification.set(id, [...(byNotification.get(id) ?? []), m.msgId]);
  }
  const ids = [...byNotification.keys()];
  const rows = await rpc<Rendered[]>(db, 'push_render', { p_ids: ids });

  let sent = 0;
  let failed = 0;
  const dead = new Set<string>();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const payload = chunk.map((r) => ({ to: r.to, title: r.title, body: r.body || undefined, data: r.data, channelId: r.channelId || 'default', sound: 'default', priority: 'high' }));
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', ...(EXPO_TOKEN ? { Authorization: `Bearer ${EXPO_TOKEN}` } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        failed += chunk.length;
        console.warn('expo push http', res.status, await res.text().catch(() => ''));
        continue;
      }
      const out = (await res.json()) as { data?: Ticket[] };
      (out.data ?? []).forEach((t, idx) => {
        if (t.status === 'ok') sent += 1;
        else {
          failed += 1;
          if (t.details?.error === 'DeviceNotRegistered') dead.add(chunk[idx].to);
        }
      });
    } catch (e) {
      failed += chunk.length;
      console.warn('expo push failed', (e as Error).message);
    }
  }

  if (dead.size) await rpc(db, 'push_disable_tokens', { p_tokens: [...dead] });
  // Mark everything we rendered as pushed (users without tokens count as handled too) and drop the queue messages.
  await rpc(db, 'push_mark_sent', { p_ids: ids });
  const msgIds = msgs.map((m) => m.msgId);
  await rpc(db, 'queue_delete', { p_queue: 'push_outbox', p_ids: msgIds });
  return json({ sent, failed, drained: msgIds.length, tokens: rows.length, disabled: dead.size });
});

function timingSafeEqual(a: string, b: string): boolean {
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
