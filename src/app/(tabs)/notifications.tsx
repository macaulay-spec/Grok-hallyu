import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

const DEMO_NOTIFICATIONS = [
  {
    id: '1',
    actor: 'kdrama.love',
    message: 'liked your post about Queen of Tears',
    time: '2h ago',
  },
  {
    id: '2',
    actor: 'seoul.obsessed',
    message: 'started following you',
    time: '5h ago',
  },
  {
    id: '3',
    actor: 'dorama.diaries',
    message: 'commented: “This scene destroyed me 😭”',
    time: '1d ago',
  },
];

export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="h2">Notifications</Text>
      </View>

      <FlatList
        data={DEMO_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar size={44} />
            <View style={styles.content}>
              <Text variant="body">
                <Text variant="bodyMedium">{item.actor}</Text>
                {' '}
                {item.message}
              </Text>
              <Text variant="captionSmall" color={colors.textTertiary} style={{ marginTop: 4 }}>
                {item.time}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="h3">No notifications yet</Text>
            <Text variant="body" color={colors.textSecondary} style={{ marginTop: 8, textAlign: 'center' }}>
              When people interact with your posts you’ll see it here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    flex: 1,
    marginLeft: spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing['2xl'],
  },
});
