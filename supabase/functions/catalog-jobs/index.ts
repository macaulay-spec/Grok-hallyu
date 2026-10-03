// catalog-jobs — the scheduler's entry point.
//
// Every recurring task in Hallyu is a function in the database with an idempotent run key, so this
// Edge Function does almost nothing: it calls `run_scheduled_jobs()`, which claims each job once
// per window, runs it, records the outcome, and moves on to the next even if one fails.
//
// Keeping the scheduling logic in SQL rather than here is the point. A second worker, a manual run
// from the dashboard and a cron tick all take the same path and cannot collide, because
// `job_claim()` refuses to hand the same (job, run_key) to two callers.
//
// Schedule it with pg_cron (see supabase/migrations/20260101122700_27_scheduled_jobs.sql) or call it
// by hand with the service-role bearer token.
//
//   {"jobs": ["catalog.status", "notifications.fanout"]}   run a specific list
//   {"jobs": ["catalog.status"], "force": true}            same run keys, retried

import { adminClient, requireServiceRole } from '../_shared/supabase.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

interface JobOutcome {
  job: string;
  status: string;
  run_id: string;
  items: number;
  error: string | null;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = requireServiceRole(request);
  if (!guard.ok) return guard.response;

  let body: { jobs?: string[] } = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      // An empty body runs the default list.
    }
  }

  const supabase = adminClient();
  const { data, error } = await supabase.rpc('run_scheduled_jobs', {
    p_jobs: body.jobs ?? null,
  });

  if (error) return errorResponse(`could not run the scheduled jobs: ${error.message}`, 500);

  const outcomes = (data ?? []) as JobOutcome[];

  // A job that failed is reported as a failed run of the scheduler, so a monitoring check sees it
  // without having to parse the payload. Individual failures are in the body.
  const failures = outcomes.filter((o) => o.status === 'failed');

  return jsonResponse({
    ran: outcomes.length,
    failed: failures.length,
    jobs: outcomes.map((o) => ({
      job: o.job,
      status: o.status,
      run_id: o.run_id,
      items: o.items,
      ...(o.error ? { error: o.error } : {}),
    })),
    ran_at: new Date().toISOString(),
  }, failures.length > 0 ? 207 : 200);
});