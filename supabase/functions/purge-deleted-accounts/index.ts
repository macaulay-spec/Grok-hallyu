// purge-deleted-accounts — retention enforcement.
//
// delete_account() leaves an anonymous tombstone so replies and posts never dangle. This function is
// the other half of that promise: after the retention window it hard-deletes the account, its posts,
// its comments and every storage object it uploaded.
//
// Schedule it with pg_cron (see supabase/migrations/20260101122200_22_retention.sql) or run it by
// hand from the Supabase dashboard's function tester with the service-role bearer token.

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
  const retention = `${retentionDays} days`;

  // 1. Report what is about to go, so the run is auditable before it deletes anything.
  const { data: doomed, error: listError } = await supabase
    .from('profiles')
    .select('id, handle, deleted_at')
    .eq('account_status', 'deleted')
    .lt('deleted_at', new Date(Date.now() - retentionDays * 86_400_000).toISOString())
    .limit(500);

  if (listError) return errorResponse(`could not list deleted profiles: ${listError.message}`, 500);

  const ids = (doomed ?? []).map((p) => p.id as string);
  if (ids.length === 0) {
    return jsonResponse({ purged: 0, retention_days: retentionDays, profiles: [], storage_objects_removed: 0 });
  }

  // 2. Audit the events that go with them (analytics rows are nulled on delete, so count first).
  const { count: eventCount, error: eventError } = await supabase
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .in('user_id', ids);

  if (eventError) return errorResponse(`could not size the deletion: ${eventError.message}`, 500);

  const { data: removed, error: purgeError } = await supabase.rpc('purge_deleted_accounts', {
    retention: retention,
  });

  if (purgeError) return errorResponse(`purge failed: ${purgeError.message}`, 500);

  const row = Array.isArray(removed) ? removed[0] : removed;

  return jsonResponse({
    purged: row?.profiles_purged ?? ids.length,
    retention_days: retentionDays,
    profiles: (doomed ?? []).map((p) => ({ id: p.id, handle: p.handle, deleted_at: p.deleted_at })),
    storage_objects_removed: row?.storage_objects_removed ?? 0,
    events_deleted_for_these_accounts: eventCount ?? 0,
  });
});