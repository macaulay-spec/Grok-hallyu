import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { colors, fonts, sizes } from '../../constants/theme';
import { initials } from '../../lib/format';
import { Text } from './Text';

interface AvatarProps {
  uri?: string;
  name: string;
  size?: keyof typeof sizes.avatar | number;
  ring?: boolean; // accent ring (e.g. live / story)
  style?: StyleProp<ViewStyle>;
}

const HUES = ['#3B2F4A', '#2F3A2A', '#3A2A2A', '#2A3A3A', '#3F352A', '#2A3340', '#4A2F3A'];

export function Avatar({ uri, name, size = 'md', ring, style }: AvatarProps) {
  const px = typeof size === 'number' ? size : sizes.avatar[size];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const bg = HUES[name.length % HUES.length];
  const fontSize = Math.max(10, Math.round(px * 0.38));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${name} avatar`}
      style={[
        { width: px, height: px, borderRadius: px / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        ring ? { borderWidth: 2, borderColor: colors.accent } : null,
        style,
      ]}
    >
      {uri && !failed ? (
        <Image source={{ uri }} style={{ width: px, height: px }} contentFit="cover" transition={160} onError={() => setFailed(true)} cachePolicy="memory-disk" recyclingKey={uri} />
      ) : (
        <Text style={{ fontFamily: fonts.semibold, fontSize, lineHeight: fontSize + 4, color: colors.textPrimary }}>{initials(name)}</Text>
      )}
    </View>
  );
}
