// media-cleanup — storage reconciliation.
//
// Calls `job_reconcile_media()`, which does the deciding in SQL: it drops `post_media` rows whose
// object no longer exists, deletes `u/<id>/…` objects nothing references any more, retires catalog
// artwork that has been unreferenced for longer than the refresh window, and purges the upload
// bookkeeping rows for all of it.
//
// Schedule it daily (see supabase/migrations/20260101123000_30_media_lifecycle.sql) or run it by
// hand from the dashboard with the service-role bearer token.
//
//   {"retention_days": 30}   how long unreferenced member uploads are kept

import { adminClient, requireServiceRole } from '../_shared/supabase.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

const DEFAULT_RETENTION_DAYS = 30;

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = requireServiceRole(request);
  if (!guard.ok) return guard.response;

  let retentionDays = DEFAULT_RETENTION_DAYS;
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (typeof body?.retention_days === 'number') retentionDays = body.retention_days;
    } catch {
      // An empty or malformed body simply means "use the default window".
    }
  }

  if (retentionDays < 1 || retentionDays > 365) {
    return errorResponse('retention_days must be between 1 and 365');
  }

  const supabase = adminClient();

  // What is about to go, counted before anything is removed, so the run is auditable.
  const { count: pendingUploads, error: pendingError } = await supabase
    .from('media_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'pending');

  if (pendingError) return errorResponse(`could not size the cleanup: ${pendingError.message}`, 500);

  const { data, error } = await supabase.rpc('job_reconcile_media', {
    p_user_retention: `${retentionDays} days`,
  });

  if (error) return errorResponse(`cleanup failed: ${error.message}`, 500);

  const report = (data ?? {}) as Record<string, unknown>;

  return jsonResponse({
    retention_days: retentionDays,
    pending_uploads_before: pendingUploads ?? 0,
    broken_rows_removed: report.broken_rows_removed ?? 0,
    orphan_objects_removed: report.orphan_objects_removed ?? 0,
    upload_rows_purged: report.upload_rows_purged ?? 0,
    pending_expired: report.pending_expired ?? 0,
    attached_uploads: report.attached ?? 0,
  });
});