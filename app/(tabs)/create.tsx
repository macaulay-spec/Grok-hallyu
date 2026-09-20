import React from 'react';
import { View } from 'react-native';
import { colors } from '../../constants/theme';

/** The Create tab never renders — the tab bar intercepts the press: tap opens the composer (`/create/post`), long-press opens the type sheet. */
export default function CreateTab() {
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
