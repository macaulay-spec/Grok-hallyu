import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { Drama } from '@/types/database';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing['2xl'] * 2 - spacing.md) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.45;

export default function OnboardingDramasScreen() {
  const [dramas, setDramas] = useState<Drama[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDramas();
  }, []);

  const loadDramas = async () => {
    // In production this comes from Supabase.
    // For zero-budget bootstrap we also ship a small seed set.
    if (DEMO_MODE) {
      setDramas(SEED_DRAMAS);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('dramas')
      .select('*')
      .order('title')
      .limit(12);

    if (error) {
      console.warn('Could not load dramas:', error.message);
    }

    if (data && data.length > 0) {
      setDramas(data);
    } else {
      // Fallback seed so the screen is never empty during development
      setDramas(SEED_DRAMAS);
    }
    setLoading(false);
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleContinue = () => {
    // Pass selected IDs to next screen via global or params later if needed
    router.push({
      pathname: '/(onboarding)/profile',
      params: { dramaIds: Array.from(selected).join(',') },
    });
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text variant="caption" color={colors.accent} style={styles.step}>
          STEP 1 OF 2
        </Text>
        <Text variant="h1" style={styles.title}>
          Which dramas still live rent-free in your head?
        </Text>
        <Text variant="callout" color={colors.textSecondary}>
          Select the ones that stayed with you. Your picks help us recommend stories you’ll love.
        </Text>
      </View>

      <FlatList
        data={dramas}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggle(item.id)}
              style={[styles.card, isSelected && styles.cardSelected]}
            >
              {item.poster_url ? (
                <Image source={{ uri: item.poster_url }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text variant="caption" color={colors.textTertiary}>
                    {item.title}
                  </Text>
                </View>
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                style={styles.gradient}
              />
              <Text variant="caption" style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {isSelected && (
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={16} color={colors.textPrimary} />
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          title={selected.size > 0 ? `Continue (${selected.size})` : 'Continue'}
          onPress={handleContinue}
          disabled={selected.size === 0}
          fullWidth
          size="lg"
        />
      </View>
    </SafeAreaView>
  );
}

const SEED_DRAMAS: Drama[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Crash Landing on You',
    original_title: '사랑의 불시착',
    poster_url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400',
    year: 2019,
    genres: ['Romance', 'Drama'],
    synopsis: null,
    cast_text: null,
    episode_count: 16,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Goblin',
    original_title: '도깨비',
    poster_url: 'https://images.unsplash.com/photo-1518674660708-6f684e78f4f6?w=400',
    year: 2016,
    genres: ['Fantasy', 'Romance'],
    synopsis: null,
    cast_text: null,
    episode_count: 16,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Squid Game',
    original_title: '오징어 게임',
    poster_url: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=400',
    year: 2021,
    genres: ['Thriller', 'Drama'],
    synopsis: null,
    cast_text: null,
    episode_count: 9,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    title: 'The Glory',
    original_title: '더 글로리',
    poster_url: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400',
    year: 2022,
    genres: ['Revenge', 'Drama'],
    synopsis: null,
    cast_text: null,
    episode_count: 16,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Business Proposal',
    original_title: '사내맞선',
    poster_url: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400',
    year: 2022,
    genres: ['Romance', 'Comedy'],
    synopsis: null,
    cast_text: null,
    episode_count: 12,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Extraordinary Attorney Woo',
    original_title: '이상한 변호사 우영우',
    poster_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    year: 2022,
    genres: ['Legal', 'Drama'],
    synopsis: null,
    cast_text: null,
    episode_count: 16,
    created_at: new Date().toISOString(),
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  step: {
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: 120,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  cardTitle: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    backgroundColor: colors.background,
  },
});
