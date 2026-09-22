// Shared HTTP helpers for Hallyu Edge Functions.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable = status === 429 || status >= 500,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

export const fail = (status: number, message: string, extra: Record<string, unknown> = {}): Response => json({ error: message, status, ...extra }, status);

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

/** Wrap a handler: CORS preflight, method check, uniform error mapping. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'Use POST');
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, { retryable: e.retryable });
      console.error(e);
      return fail(500, 'Something went wrong on our side', { retryable: true });
    }
  });
}

/** Tiny per-instance rate limiter (best effort; the DB enforces the real limits). */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): void => {
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) throw new HttpError(429, 'Too many requests — try again later');
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
  };
}
