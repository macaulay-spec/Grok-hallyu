import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { colors, radius, space } from '../../constants/theme';
import { reportError } from '../../lib/analytics';
import { adminApi, AdminReport } from '../../lib/admin';

type Filter = 'open' | 'all';

/** Moderation queue — open reports with one-tap resolutions; every action is audit-logged. */
export default function AdminReports() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: Filter) => {
    try {
      const { reports: rows } = await adminApi.reports(status);
      setReports(rows);
    } catch (e) {
      reportError('admin.reports', e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load(filter).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [filter, load]);

  const resolve = async (report: AdminReport, status: string) => {
    setBusyId(report.id);
    try {
      await adminApi.resolveReport(report.id, status);
      toast.show({ message: `Report ${status}`, tone: 'success' });
      setReports((rows) => rows.filter((r) => r.id !== report.id));
    } catch (e) {
      reportError('admin.resolve', e);
      toast.show({ message: 'Could not update that report', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }, [filter, load]);

  return (
    <Screen header={<TopBar mode="stack" title="Moderation queue" />}>
      <View style={styles.filters}>
        {(['open', 'all'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            style={[styles.chip, filter === f && styles.chipOn]}
          >
            <Text variant="label" style={filter === f ? { color: colors.onAccent } : undefined}>
              {f === 'open' ? 'Open' : 'All'}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
        >
          {reports.length === 0 && (
            <Text variant="body" tone="secondary" style={styles.empty}>
              {filter === 'open' ? 'Queue is clear — nothing open.' : 'No reports yet.'}
            </Text>
          )}
          {reports.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.head}>
                <Text variant="label">{r.target_type}</Text>
                <Text variant="caption" tone="secondary">
                  {(r.created_at ?? '').slice(0, 10)}
                </Text>
              </View>
              {r.reason ? <Text variant="body">{r.reason}</Text> : null}
              {r.detail ? (
                <Text variant="bodySmall" tone="secondary">
                  {r.detail}
                </Text>
              ) : null}
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                target {r.target_id} · by {r.reporter_id || 'someone'}
              </Text>
              {r.status === 'open' ? (
                <View style={styles.actions}>
                  <Button label="Reviewed" size="md" loading={busyId === r.id} disabled={busyId !== null} onPress={() => void resolve(r, 'reviewed')} />
                  <Button label="Dismissed" size="md" variant="secondary" disabled={busyId !== null} onPress={() => void resolve(r, 'dismissed')} />
                  <Button label="Actioned" size="md" variant="ghost" disabled={busyId !== null} onPress={() => void resolve(r, 'actioned')} />
                </View>
              ) : (
                <Text variant="caption" style={{ color: colors.success }}>
                  {r.status}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.x2, paddingHorizontal: space.x6, paddingTop: space.x2 },
  chip: { paddingHorizontal: space.x4, paddingVertical: space.x2, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  spinner: { marginTop: space.x8 },
  body: { padding: space.x6, paddingTop: space.x3, gap: space.x3 },
  empty: { textAlign: 'center', marginTop: space.x8 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.x4, gap: space.x2 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: space.x2, marginTop: space.x1 },
});
