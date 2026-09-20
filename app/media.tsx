import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/ui/IconButton';
import { Text } from '../components/ui/Text';
import { colors, space } from '../constants/theme';

/** Full-screen media viewer: swipe between images, drag down to dismiss, tap to toggle chrome. */
export default function MediaViewer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ uri?: string; uris?: string; index?: string; title?: string }>();
  const uris = (params.uris ? params.uris.split('|') : params.uri ? [params.uri] : []).filter(Boolean);
  const [index, setIndex] = useState(Math.min(Number(params.index) || 0, Math.max(0, uris.length - 1)));
  const [chrome, setChrome] = useState(true);
  const y = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => y.setValue(g.dy),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dy) > 120 || Math.abs(g.vy) > 1.2) router.back();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;
  const opacity = y.interpolate({ inputRange: [-300, 0, 300], outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });

  return (
    <Animated.View style={[styles.root, { opacity }]} {...pan.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: y }] }}>
        {uris.length ? (
          <FlatList
            data={uris}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(u, i) => `${i}-${u}`}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Pressable onPress={() => setChrome((c) => !c)} style={{ width, height, justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel={params.title ?? 'Image'}>
                <Image source={{ uri: item }} style={{ width, height: height * 0.8 }} contentFit="contain" transition={160} />
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
            <Text variant="bodySmall" tone="secondary">
              This image isn’t available.
            </Text>
          </View>
        )}
      </Animated.View>
      {chrome ? (
        <View style={[styles.bar, { top: insets.top }]}>
          <IconButton icon="close" label="Close" tone="onMedia" onPress={() => router.back()} />
          <Text variant="label" style={{ color: colors.onMedia, flex: 1 }} numberOfLines={1}>
            {params.title ?? ''}
            {uris.length > 1 ? `  ${index + 1}/${uris.length}` : ''}
          </Text>
          {uris[index] ? <IconButton icon="share-social-outline" label="Share image" tone="onMedia" onPress={() => Share.share({ url: uris[index]!, message: uris[index]! })} /> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { position: 'absolute', left: 0, right: 0, height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x2, gap: space.x2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.x2 },
});
