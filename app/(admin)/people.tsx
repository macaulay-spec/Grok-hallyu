import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { colors, radius, space } from '../../constants/theme';
import { reportError } from '../../lib/analytics';
import { adminApi, AdminMember } from '../../lib/admin';

/** People — search members, grant/revoke the Crimson Critic badge, ban/unban. */
export default function AdminPeople() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const { members: rows } = await adminApi.members(q);
      setMembers(rows);
    } catch (e) {
      reportError('admin.people', e);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      void load(query).finally(() => setLoading(false));
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, load]);

  const act = async (member: AdminMember, kind: 'verify' | 'ban') => {
    setBusyId(member.id);
    const on = kind === 'verify' ? !member.verified : !member.banned;
    try {
      if (kind === 'verify') await adminApi.setVerified(member.id, on);
      else await adminApi.setBanned(member.id, on);
      toast.show({ message: on ? (kind === 'verify' ? 'Badge granted' : 'Member banned') : kind === 'verify' ? 'Badge removed' : 'Ban lifted', tone: 'success' });
      setMembers((rows) => rows.map((m) => (m.id === member.id ? { ...m, verified: kind === 'verify' ? on : m.verified, banned: kind === 'ban' ? on : m.banned } : m)));
    } catch (e) {
      reportError('admin.peopleAction', e);
      toast.show({ message: 'That action failed — try again', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen header={<TopBar mode="stack" title="People" />}>
      <View style={styles.search}>
        <TextField label="Search members" leading="search-outline" value={query} onChangeText={setQuery} placeholder="Handle or display name" autoCapitalize="none" />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {members.length === 0 && (
            <Text variant="body" tone="secondary" style={styles.empty}>
              No members match “{query}”.
            </Text>
          )}
          {members.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={styles.identity}>
                <View style={styles.avatar}>
                  <Text variant="body">{(m.display_name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.who}>
                  <View style={styles.nameRow}>
                    <Text variant="body" numberOfLines={1} style={styles.name}>
                      {m.display_name}
                    </Text>
                    {m.verified && <Text style={styles.badge}>✓</Text>}
                    {m.role === 'admin' && (
                      <View style={styles.roleChip}>
                        <Text variant="caption" style={{ color: colors.onAccent }}>
                          admin
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {m.handle ? `@${m.handle}` : m.id} · joined {(m.created_at ?? '').slice(0, 10)}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Button
                  label={m.verified ? 'Unverify' : 'Verify'}
                  size="md"
                  variant="secondary"
                  loading={busyId === m.id}
                  disabled={busyId !== null}
                  onPress={() => void act(m, 'verify')}
                />
                <Button
                  label={m.banned ? 'Unban' : 'Ban'}
                  size="md"
                  variant="ghost"
                  disabled={busyId !== null}
                  onPress={() => void act(m, 'ban')}
                />
              </View>
              {m.banned ? (
                <Text variant="caption" style={{ color: colors.accentText }}>
                  Banned — their posts are hidden.
                </Text>
              ) : null}
            </View>
          ))}
          <Pressable onPress={() => void load(query)} accessibilityRole="button" style={styles.reload}>
            <Text variant="bodySmall" tone="secondary">
              Refresh
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: space.x6, paddingTop: space.x2 },
  spinner: { marginTop: space.x8 },
  body: { padding: space.x6, paddingTop: space.x3, gap: space.x3 },
  empty: { textAlign: 'center', marginTop: space.x8 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.x4, gap: space.x3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  who: { flexShrink: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  name: { flexShrink: 1 },
  badge: { color: colors.accentText },
  roleChip: { backgroundColor: colors.accent, paddingHorizontal: space.x2, paddingVertical: 1, borderRadius: 999 },
  actions: { flexDirection: 'row', gap: space.x2 },
  reload: { alignSelf: 'center', padding: space.x3 },
});
