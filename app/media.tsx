import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/ui/IconButton';
import { Text } from '../components/ui/Text';
import { colors, space } from '../constants/theme';
import { useApp } from '../lib/hooks';

type Slide = { kind: 'image'; source: string | number } | { kind: 'video'; uri: string; poster?: string | number };

/**
 * Full-screen media viewer: swipe between a post's images (or play its video with sound and
 * controls), drag down to dismiss, tap to toggle chrome. Accepts `postId` (+ `index`) or raw
 * `uri`/`uris` for images that don't belong to a post.
 */
export default function MediaViewer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ postId?: string; uri?: string; uris?: string; index?: string; title?: string }>();
  const { getPost, getUser } = useApp();
  const post = getPost(params.postId);
  const slides = useMemo<Slide[]>(() => {
    if (post?.video) return [{ kind: 'video', uri: post.video.url, poster: post.video.poster ?? post.images?.[0] }];
    if (post?.images?.length) return post.images.map((source) => ({ kind: 'image', source }));
    return (params.uris ? params.uris.split('|') : params.uri ? [params.uri] : []).filter(Boolean).map((source) => ({ kind: 'image', source }));
  }, [post, params.uris, params.uri]);
  const title = params.title ?? (post ? `@${getUser(post.authorId)?.handle ?? 'post'}` : '');
  const [index, setIndex] = useState(Math.min(Number(params.index) || 0, Math.max(0, slides.length - 1)));
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
  const current = slides[index];
  const shareUrl = current?.kind === 'video' ? current.uri : current?.kind === 'image' && typeof current.source === 'string' ? current.source : post ? `https://hallyu.app/p/${post.id}` : undefined;

  return (
    <Animated.View style={[styles.root, { opacity }]} {...pan.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: y }] }}>
        {slides.length ? (
          <FlatList
            data={slides}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) =>
              item.kind === 'video' ? (
                <View style={{ width, height, justifyContent: 'center' }} accessibilityLabel="Video">
                  <Video
                    source={{ uri: item.uri }}
                    posterSource={typeof item.poster === 'string' ? { uri: item.poster } : item.poster}
                    usePoster={!!item.poster}
                    style={{ width, height: height * 0.8 }}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    isLooping
                    useNativeControls
                    videoStyle={{ width: '100%', height: '100%' }}
                  />
                </View>
              ) : (
                <Pressable onPress={() => setChrome((c) => !c)} style={{ width, height, justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel={title || 'Image'}>
                  <Image source={typeof item.source === 'string' ? { uri: item.source } : item.source} style={{ width, height: height * 0.8 }} contentFit="contain" transition={160} />
                </Pressable>
              )
            }
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
            <Text variant="bodySmall" tone="secondary">
              This media isn’t available.
            </Text>
          </View>
        )}
      </Animated.View>
      {chrome ? (
        <View style={[styles.bar, { top: insets.top }]}>
          <IconButton icon="close" label="Close" tone="onMedia" onPress={() => router.back()} />
          <Text variant="label" style={{ color: colors.onMedia, flex: 1 }} numberOfLines={1}>
            {title}
            {slides.length > 1 ? `  ${index + 1}/${slides.length}` : ''}
          </Text>
          {shareUrl ? <IconButton icon="share-social-outline" label="Share" tone="onMedia" onPress={() => Share.share({ url: shareUrl, message: shareUrl }).catch(() => {})} /> : null}
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
