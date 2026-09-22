import { Stack, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../components/ui/Screen';
import { EmptyState } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { space } from '../constants/theme';

/** Unknown deep link or a route that moved. Never a dead end: two ways back into the app. */
export default function NotFound() {
  const router = useRouter();
  const path = usePathname();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen offlineBanner={false}>
        <View style={styles.wrap}>
          <EmptyState
            icon="compass-outline"
            title="This page isn’t here."
            body="The link may be broken, or it points at something that was removed."
            actionLabel="Go home"
            onAction={() => router.replace('/(tabs)')}
            secondaryLabel="Search instead"
            onSecondary={() => router.replace('/search')}
          />
          <Text variant="caption" tone="tertiary" align="center" numberOfLines={2} style={styles.path}>{path}</Text>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: space.margin },
  path: { marginTop: space.x4 },
});
