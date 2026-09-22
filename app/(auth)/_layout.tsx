import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../constants/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right', animationDuration: 260 }}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="gate" options={{ presentation: 'transparentModal', animation: 'fade' }} />
    </Stack>
  );
}
