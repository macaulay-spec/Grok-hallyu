/**
 * Product analytics seam. Screens call `track(event, props)`; today it only buffers in memory
 * (and logs in dev), so a real sink (PostHog, Amplitude…) can be attached later without
 * touching call sites. Nothing personal is sent: ids are opaque, no free text.
 */
export type AnalyticsEvent =
  | 'app.open'
  | 'auth.signin'
  | 'auth.signup'
  | 'auth.guest'
  | 'auth.delete'
  | 'onboarding.done'
  | 'post.publish'
  | 'post.delete'
  | 'comment.add'
  | 'reaction.set'
  | 'follow.set'
  | 'watch.set'
  | 'progress.set'
  | 'spoiler.reveal'
  | 'search.query'
  | 'catalog.import'
  | 'sync.failed'
  | 'error.boundary'
  | 'error.async';

export interface AnalyticsSink {
  track(event: AnalyticsEvent, props?: Record<string, unknown>): void;
}

const buffer: { event: AnalyticsEvent; props?: Record<string, unknown>; at: number }[] = [];
let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
  if (sink) for (const b of buffer.splice(0)) sink.track(b.event, b.props);
}

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (sink) return sink.track(event, props);
  buffer.push({ event, props, at: Date.now() });
  if (buffer.length > 200) buffer.shift();
  if (__DEV__ && event === 'error.boundary') console.warn('[analytics]', event, props);
}

/** For debugging / tests. */
export function drainAnalytics(): typeof buffer {
  return buffer.splice(0);
}

/**
 * Diagnostics for a caught async failure in a background component. Unlike a bare `catch {}`, this
 * always logs a useful line (dev) and forwards to the analytics sink, so a swallowed failure is
 * still observable. Never throws.
 */
export function reportError(scope: string, error: unknown, props?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  if (__DEV__) console.warn(`[hallyu:${scope}]`, message, error);
  try {
    track('error.async', { scope, message, ...props });
  } catch {
    /* analytics must never break the caller */
  }
}
