import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { aspect, colors, fonts, radius } from '../../constants/theme';
import { Drama } from '../../lib/model';
import { Text } from './Text';

interface PosterProps {
  drama: Pick<Drama, 'title' | 'posterUrl' | 'posterLocal' | 'tone' | 'year' | 'originalTitle'>;
  width: number;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
  children?: React.ReactNode; // overlays
}

/**
 * 2:3 poster. Never distorted (cover). When there is no artwork we render a typographic
 * placeholder in the drama's tone — a designed state, not a broken image.
 */
export function Poster({ drama, width, style, rounded = radius.sm, children }: PosterProps) {
  const height = Math.round(width / aspect.poster);
  const [failed, setFailed] = useState(false);
  // Real catalog art wins over the bundled placeholder artwork.
  const source = drama.posterUrl ? { uri: drama.posterUrl } : drama.posterLocal ?? null;
  const titleSize = Math.max(11, Math.min(18, width / 7));
  return (
    <View style={[{ width, height, borderRadius: rounded, backgroundColor: drama.tone, overflow: 'hidden' }, width >= 56 ? styles.edge : null, style]} accessibilityRole="image" accessibilityLabel={`${drama.title} poster`}>
      {source && !failed ? (
        <Image source={source} style={{ width, height }} contentFit="cover" transition={200} cachePolicy="memory-disk" onError={() => setFailed(true)} recyclingKey={drama.title} />
      ) : (
        <View style={styles.fallback}>
          <View style={styles.rule} />
          <Text style={{ fontFamily: fonts.bold, fontSize: titleSize, lineHeight: titleSize * 1.15, color: colors.textPrimary, letterSpacing: -0.2 }} numberOfLines={4}>
            {drama.title}
          </Text>
          {drama.originalTitle && width >= 100 ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: Math.max(10, titleSize * 0.7), lineHeight: titleSize, color: colors.textSecondary, marginTop: 4 }} numberOfLines={2}>
              {drama.originalTitle}
            </Text>
          ) : null}
          <Text style={{ fontFamily: fonts.medium, fontSize: Math.max(9, titleSize * 0.65), color: colors.textTertiary, position: 'absolute', left: 10, bottom: 10 }}>{drama.year}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

/** 16:9 backdrop / still with the same fallback rules. */
export function Backdrop({ uri, fallbackColor, width, height, children, style, label }: { uri?: string | number; fallbackColor: string; width: number | `${number}%`; height: number; children?: React.ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const [failed, setFailed] = useState(false);
  const source = typeof uri === 'number' ? uri : uri ? { uri } : null;
  return (
    <View style={[{ width, height, backgroundColor: fallbackColor, overflow: 'hidden' }, style]} accessibilityLabel={label}>
      {source && !failed ? <Image source={source} style={{ width: '100%', height }} contentFit="cover" transition={200} cachePolicy="memory-disk" onError={() => setFailed(true)} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, padding: 10, paddingTop: 14, justifyContent: 'flex-start' },
  rule: { width: 18, height: 2, backgroundColor: colors.accent, marginBottom: 8, borderRadius: 1 },
  edge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
});
