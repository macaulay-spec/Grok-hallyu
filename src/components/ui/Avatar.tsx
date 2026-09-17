import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

interface AvatarProps {
  uri?: string | null;
  size?: number;
  onPress?: () => void;
  showEditBadge?: boolean;
}

export function Avatar({
  uri,
  size = 48,
  onPress,
  showEditBadge = false,
}: AvatarProps) {
  // Fall back to the placeholder if the image fails to load
  // (e.g. a stale local picker uri after an app restart in demo mode).
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const content = (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="person" size={size * 0.45} color={colors.textTertiary} />
        </View>
      )}
      {showEditBadge && (
        <View style={styles.badge}>
          <Ionicons name="camera" size={14} color={colors.textPrimary} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.accent,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
});
