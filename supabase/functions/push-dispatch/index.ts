// push-dispatch — the push worker.
//
// The database decides *what* to send and *who may receive it*; this function decides only how to
// talk to the push provider. It claims a batch from `claim_notification_deliveries()`, sends it, and
// reports each outcome back with `report_delivery()`.
//
// Three provider outcomes are distinguished, because they need different handling:
//
//   accepted          → mark sent
//   retryable failure → back off and try again (the database schedules the next attempt)
//   token rejected    → the device is gone: disable the token and fail every other queued delivery
//                       for it in the same transaction, so a dead install costs one round trip
//
// The provider endpoint and its optional access token come from the function environment and are
// never returned. Without `EXPO_ACCESS_TOKEN` the Expo endpoint still accepts anonymous sends, which
// is the working default for a project that has not been given a push credential yet.

import { adminClient, requireServiceRole } from '../_shared/supabase.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const MAX_BATCH = 100;

interface ClaimedDelivery {
  delivery_id: string;
  notification_id: string;
  push_token_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  attempt: number;
  title: string;
  body: string;
  deep_link: string;
  payload: Record<string, unknown>;
}

/** Builds the provider message. The shape is the Expo push schema; the token is opaque. */
function buildMessage(delivery: ClaimedDelivery): Record<string, unknown> {
  return {
    to: delivery.token,
    title: delivery.title,
    body: delivery.body,
    sound: 'default',
    priority: 'high',
    channelId: delivery.platform === 'android' ? 'episodes' : undefined,
    data: {
      ...delivery.payload,
      deep_link: delivery.deep_link,
      delivery_id: delivery.delivery_id,
    },
  };
}

/** True when the provider says the token is permanently unusable. */
function isInvalidToken(details: unknown): boolean {
  const text = JSON.stringify(details ?? '').toUpperCase();
  return (
    text.includes('DEVICE_NOT_REGISTERED') ||
    text.includes('NOTREGISTERED') ||
    text.includes('INVALIDTOK') ||
    text.includes('INVALID_TOKEN') ||
    text.includes('APNS_ERROR') ||
    text.includes('SENDERIDMISMATCH') ||
    text.includes('UNREGISTERED')
  );
}

/** True when trying again later could plausibly work. Informational: the retry decision is made by
 *  the database's backoff schedule, this is used for the log line. */
function isRetryable(status: number, details: unknown): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  const text = JSON.stringify(details ?? '').toUpperCase();
  return text.includes('RATE') || text.includes('TOO_MANY') || text.includes('TIMEOUT');
}

async function sendBatch(messages: Array<Record<string, unknown>>): Promise<Array<{
  status: number;
  id?: string;
  details?: unknown;
}>> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    // The whole batch failed. Return the status per message so each gets its own outcome.
    const text = await response.text().catch(() => '');
    return messages.map(() => ({ status: response.status, details: text.slice(0, 200) }));
  }

  const payload = (await response.json()) as { data?: Array<{ status: number; id?: string; details?: unknown }> };
  const results = payload.data ?? [];

  // A short response means the provider stopped reading; treat the remainder as retryable.
  return messages.map((_, index) => results[index] ?? { status: 502, details: 'truncated provider response' });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = requireServiceRole(request);
  if (!guard.ok) return guard.response;

  let body: { limit?: number; max_attempts?: number } = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      // Defaults are fine.
    }
  }

  const limit = Math.min(Math.max(body.limit ?? MAX_BATCH, 1), MAX_BATCH);

  const supabase = adminClient();

  // Anything that is due but has no delivery row yet gets one first, so a notification created
  // between two runs is not stranded until the next cycle.
  const { error: fanoutError } = await supabase.rpc('fanout_due_notifications', { p_limit: 500 });
  if (fanoutError) return errorResponse(`fan-out failed: ${fanoutError.message}`, 500);

  const { data, error: claimError } = await supabase.rpc('claim_notification_deliveries', {
    p_limit: limit,
    p_max_attempts: body.max_attempts ?? 5,
  });

  if (claimError) return errorResponse(`could not claim deliveries: ${claimError.message}`, 500);

  const claimed = (data ?? []) as ClaimedDelivery[];

  if (claimed.length === 0) {
    return jsonResponse({ claimed: 0, sent: 0, failed: 0, invalid: 0, configured: true });
  }

  const messages = claimed.map(buildMessage);

  let results: Array<{ status: number; id?: string; details?: unknown }>;
  try {
    results = await sendBatch(messages);
  } catch (networkError) {
    // The provider is unreachable. Everything in the batch is retryable; the database schedules the
    // next attempt with backoff, so nothing is lost and nothing is marked invalid.
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    for (const delivery of claimed) {
      await supabase.rpc('report_delivery', {
        p_delivery_id: delivery.delivery_id,
        p_sent: false,
        p_error: `provider unreachable: ${message}`.slice(0, 300),
        p_invalid: false,
        p_provider_message_id: null,
      });
    }

    return jsonResponse({ claimed: claimed.length, sent: 0, failed: claimed.length, invalid: 0, error: message.slice(0, 200) });
  }

  let sent = 0;
  let failed = 0;
  let invalid = 0;

  for (const [index, delivery] of claimed.entries()) {
    const outcome = results[index] ?? { status: 502, details: 'missing provider response' };
    const details = typeof outcome.details === 'string' ? outcome.details : JSON.stringify(outcome.details ?? '');

    if (outcome.status === 200) {
      sent += 1;
      await supabase.rpc('report_delivery', {
        p_delivery_id: delivery.delivery_id,
        p_sent: true,
        p_error: null,
        p_invalid: false,
        p_provider_message_id: outcome.id ?? null,
      });
      continue;
    }

    if (isInvalidToken(outcome.details)) {
      // Permanent: the device will never receive this token again.
      invalid += 1;
      await supabase.rpc('report_delivery', {
        p_delivery_id: delivery.delivery_id,
        p_sent: false,
        p_error: details.slice(0, 300),
        p_invalid: true,
        p_provider_message_id: outcome.id ?? null,
      });
      continue;
    }

    failed += 1;
    if (isRetryable(outcome.status, outcome.details)) {
      console.warn(`delivery ${delivery.delivery_id} retryable: ${outcome.status} ${details.slice(0, 120)}`);
    }
    await supabase.rpc('report_delivery', {
      p_delivery_id: delivery.delivery_id,
      p_sent: false,
      p_error: `${outcome.status}: ${details}`.slice(0, 300),
      // Anything that is neither accepted nor an invalid token is treated as transient: the
      // database schedules a retry with backoff and the attempt ceiling decides when to give up.
      p_invalid: false,
      p_provider_message_id: outcome.id ?? null,
    });
  }

  return jsonResponse({
    claimed: claimed.length,
    sent,
    failed,
    invalid,
    disabled_tokens_today: invalid,
  });
});