import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../constants/theme';

/** Admin console stack — entry points are role-gated (the Settings row checks the server-side role). */
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
        animationDuration: 240,
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
    </Stack>
  );
}
