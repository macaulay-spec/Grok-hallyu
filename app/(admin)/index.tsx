import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { adminApi, AdminError, AnalyticsPayload, AuditAction } from '../../lib/admin';
import { reportError } from '../../lib/analytics';

/**
 * Admin console home — KPIs, live analytics (Supabase Postgres aggregates via /admin/analytics)
 * and moderation entry points. The server re-checks the admin role on every call; a 403 lands
 * here as a quiet "admins only" state, never a crash.
 */
export default function AdminConsole() {
  const router = useRouter();
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof adminApi.overview>> | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [audit, setAudit] = useState<AuditAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, a, log] = await Promise.all([adminApi.overview(), adminApi.analytics(), adminApi.audit()]);
      setOverview(o);
      setAnalytics(a);
      setAudit(log.actions.slice(0, 5));
      setError(null);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Something went wrong');
      reportError('admin.overview', e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error) {
    return (
      <Screen header={<TopBar mode="stack" title="Admin console" />}>
        <View style={styles.center}>
          <Text variant="titleLarge">{error === 'Admins only' ? 'Admins only' : 'Console unavailable'}</Text>
          <Text variant="body" tone="secondary" style={styles.centerSub}>
            {error}
          </Text>
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const o = analytics?.overview;
  const maxDaily = Math.max(1, ...(o?.daily.map((d) => d.count) ?? [1]));

  return (
    <Screen header={<TopBar mode="stack" title="Admin console" />}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
      >
        {/* KPIs straight from the cloud database (Row Level Security decides who may read) */}
        <View style={styles.grid}>
          <Kpi label="Members" value={overview?.users} />
          <Kpi label="Signups today" value={overview?.signupsToday} />
          <Kpi label="Posts" value={overview?.posts} />
          <Kpi label="Comments" value={overview?.comments} />
          <Kpi label="Reactions" value={overview?.reactions} />
          <Kpi label="Events today" value={overview?.eventsToday} />
          <Kpi label="Open reports" value={overview?.openReports} accent={!!overview?.openReports} />
          <Kpi label="Banned" value={overview?.banned} />
        </View>

        {/* Analytics from Supabase Postgres (fallback: computed in the cloud object) */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text variant="label">Analytics</Text>
            <View style={[styles.sourceChip, { backgroundColor: analytics?.source === 'postgres' ? 'rgba(34,197,94,0.14)' : colors.warmSoft }]}>
              <Text variant="caption" style={{ color: analytics?.source === 'postgres' ? colors.live : colors.spoiler }}>
                {analytics?.source === 'postgres' ? 'LIVE · POSTGRES' : 'CLOUD FALLBACK'}
              </Text>
            </View>
          </View>
          <Text variant="bodySmall" tone="secondary">
            Events · last 14 days {o ? `· ${o.events7d} this week` : ''}
          </Text>
          <View style={styles.chart}>
            {(o?.daily ?? []).map((d) => (
              <View key={d.day} style={styles.barColumn}>
                <View style={[styles.bar, { height: Math.max(3, (d.count / maxDaily) * 72) }]} />
                <View style={styles.barBase} />
              </View>
            ))}
          </View>
          {o?.topEvents.slice(0, 4).map((e) => (
            <View key={e.name} style={styles.row}>
              <Text variant="bodySmall" style={styles.rowMain}>
                {e.name}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {e.count}
              </Text>
            </View>
          ))}
          <View style={styles.statRow}>
            <MiniStat label="Members" value={o?.members.total} />
            <MiniStat label="Verified" value={o?.members.verified} />
            <MiniStat label="New 7d" value={o?.members.new7d} />
            <MiniStat label="Reports open" value={o?.reports.open} />
          </View>
        </View>

        {/* Moderation entry points */}
        <Pressable style={styles.link} onPress={() => router.push('/(admin)/reports')} accessibilityRole="button">
          <Text variant="body">Moderation queue</Text>
          <Text variant="bodySmall" tone="secondary">
            {overview?.openReports ?? 0} open · resolve reports
          </Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push('/(admin)/people')} accessibilityRole="button">
          <Text variant="body">People</Text>
          <Text variant="bodySmall" tone="secondary">
            Search members · verify · ban
          </Text>
        </Pressable>

        {/* Audit trail */}
        <View style={styles.card}>
          <Text variant="label">Recent admin actions</Text>
          {audit.length === 0 && (
            <Text variant="bodySmall" tone="secondary">
              Nothing yet — verify, ban and report resolutions land here.
            </Text>
          )}
          {audit.map((a) => (
            <View key={a.id} style={styles.row}>
              <Text variant="bodySmall" style={styles.rowMain}>
                {a.action}
                {a.target ? ` · ${a.target.slice(0, 14)}` : ''}
              </Text>
              <Text variant="caption" tone="secondary">
                {(a.created_at ?? '').slice(0, 10)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number | undefined; accent?: boolean }) {
  return (
    <View style={[styles.kpi, accent && value ? styles.kpiAccent : null]}>
      <Text variant="titleLarge" style={accent && value ? { color: colors.accentText } : undefined}>
        {value ?? '—'}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.mini}>
      <Text variant="body">{value ?? '—'}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.x6, paddingTop: space.x3, gap: space.x3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.x3, padding: space.x6 },
  centerSub: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 },
  kpi: { width: '47%', flexGrow: 1, backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.x4, gap: 2 },
  kpiAccent: { borderColor: colors.accentSoft },
  card: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.x4, gap: space.x3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sourceChip: { paddingHorizontal: space.x2, paddingVertical: 3, borderRadius: 999 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  bar: { width: '70%', backgroundColor: colors.accent, borderRadius: 3 },
  barBase: { height: 2, marginTop: 2, backgroundColor: colors.borderSubtle, width: '70%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.x3 },
  rowMain: { flexShrink: 1 },
  statRow: { flexDirection: 'row', gap: space.x3 },
  mini: { flex: 1, backgroundColor: colors.glass, borderRadius: radius.lg, padding: space.x3, gap: 2 },
  link: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.x4, gap: 2 },
});
