import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../constants/theme';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right', animationDuration: 260 }} />;
}
