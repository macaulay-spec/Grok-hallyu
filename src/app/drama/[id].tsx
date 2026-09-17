import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, IconButton } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

// Demo data – replace with real fetch by id
const DEMO_DRAMA = {
  id: '1',
  title: 'Goblin',
  original_title: '도깨비',
  year: 2016,
  genres: ['Fantasy', 'Romance', 'Historical'],
  synopsis:
    'A centuries-old goblin, cursed to live forever, seeks to end his immortality. When he meets a young woman who can lift his curse, their fated love changes everything.',
  poster_url: 'https://images.unsplash.com/photo-1518674660708-6f684e78f4f6?w=800',
  followers_count: 128000,
};

export default function DramaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [following, setFollowing] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: DEMO_DRAMA.poster_url }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.7)', colors.background]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={styles.heroTop} edges={['top']}>
            <IconButton
              name="arrow-back"
              onPress={() => router.back()}
              color={colors.textPrimary}
            />
            <IconButton name="bookmark-outline" color={colors.textPrimary} />
          </SafeAreaView>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text variant="display">{DEMO_DRAMA.title}</Text>
          <Text variant="body" color={colors.accent} style={{ marginTop: 4 }}>
            {DEMO_DRAMA.original_title}
          </Text>

          <View style={styles.meta}>
            <Text variant="caption" color={colors.textSecondary}>
              {DEMO_DRAMA.year}
            </Text>
            <View style={styles.dot} />
            {DEMO_DRAMA.genres.map((g) => (
              <View key={g} style={styles.genreChip}>
                <Text variant="captionSmall" color={colors.textSecondary}>
                  {g}
                </Text>
              </View>
            ))}
          </View>

          <Text variant="body" color={colors.textSecondary} style={styles.synopsis}>
            {DEMO_DRAMA.synopsis}
          </Text>

          <Button
            title={following ? 'Following' : 'Follow Drama'}
            onPress={() => setFollowing(!following)}
            variant={following ? 'secondary' : 'primary'}
            fullWidth
            style={{ marginTop: spacing.xl }}
          />
        </View>

        {/* Recent posts placeholder */}
        <View style={styles.section}>
          <Text variant="h3" style={{ marginBottom: spacing.lg }}>
            Posts about this drama
          </Text>
          <View style={styles.emptyPosts}>
            <Text variant="body" color={colors.textTertiary}>
              Be the first to post about {DEMO_DRAMA.title}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    height: height * 0.48,
    width,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  info: {
    paddingHorizontal: spacing['2xl'],
    marginTop: -spacing['3xl'],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
  },
  genreChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  synopsis: {
    marginTop: spacing.lg,
    lineHeight: 24,
  },
  section: {
    paddingHorizontal: spacing['2xl'],
    marginTop: spacing['3xl'],
    paddingBottom: spacing['5xl'],
  },
  emptyPosts: {
    padding: spacing['2xl'],
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
});
