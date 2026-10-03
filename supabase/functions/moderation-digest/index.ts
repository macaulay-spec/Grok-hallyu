// moderation-digest — the moderation inbox.
//
// Reads the open reports, groups them by target so one bad post with nine reports is one decision,
// marks the reports it surfaced as "reviewing" so two moderators do not work the same queue, and
// returns the digest. Nothing here is exposed to a member: the function requires the service role
// and the caller (the dashboard, or the moderation tooling in the next phase) decides what to do.

import { adminClient, requireServiceRole } from '../_shared/supabase.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

const STALE_REVIEWING_HOURS = 48;

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = requireServiceRole(request);
  if (!guard.ok) return guard.response;

  const supabase = adminClient();

  // A report left in "reviewing" by a crashed run is returned to the queue.
  const staleCutoff = new Date(Date.now() - STALE_REVIEWING_HOURS * 3_600_000).toISOString();
  const { error: staleError } = await supabase
    .from('reports')
    .update({ status: 'open' })
    .eq('status', 'reviewing')
    .lt('updated_at', staleCutoff);

  if (staleError) return errorResponse(`could not release stale reports: ${staleError.message}`, 500);

  const { data: open, error: openError } = await supabase
    .from('reports')
    .select('id, reporter_id, target_type, target_id, reason, detail, status, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(200);

  if (openError) return errorResponse(`could not read reports: ${openError.message}`, 500);

  const reports = (open ?? []) as ReportRow[];

  // Group by the thing being reported: nine reports on one post is one moderation decision.
  const grouped = new Map<string, { target_type: string; target_id: string; reports: ReportRow[]; oldest: string }>();
  for (const report of reports) {
    const key = `${report.target_type}:${report.target_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.reports.push(report);
    } else {
      grouped.set(key, {
        target_type: report.target_type,
        target_id: report.target_id,
        reports: [report],
        oldest: report.created_at,
      });
    }
  }

  const digest = [...grouped.values()]
    .map((group) => ({
      target_type: group.target_type,
      target_id: group.target_id,
      report_count: group.reports.length,
      distinct_reporters: new Set(group.reports.map((r) => r.reporter_id)).size,
      reasons: [...new Set(group.reports.map((r) => r.reason))],
      oldest_report_at: group.oldest,
      report_ids: group.reports.map((r) => r.id),
    }))
    .sort((a, b) => b.distinct_reporters - a.distinct_reporters || a.oldest_report_at.localeCompare(b.oldest_report_at));

  const surfaced = digest.flatMap((item) => item.report_ids);
  if (surfaced.length > 0) {
    const { error: claimError } = await supabase
      .from('reports')
      .update({ status: 'reviewing' })
      .in('id', surfaced);

    if (claimError) return errorResponse(`could not claim reports: ${claimError.message}`, 500);
  }

  return jsonResponse({
    open_reports: reports.length,
    unique_targets: digest.length,
    digest,
    released_stale_before: staleCutoff,
  });
});