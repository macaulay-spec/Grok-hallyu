import React from 'react';
import { View } from 'react-native';
import { colors } from '../../constants/theme';

/** The Create tab never renders — the tab bar intercepts the press and opens the Create sheet. */
export default function CreateTab() {
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
