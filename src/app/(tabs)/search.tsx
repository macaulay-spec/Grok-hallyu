import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';

// Simple static discovery for MVP – later connect to real search
const TRENDING: { id: string; title: string; year: number; poster: ImageSourcePropType }[] = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'Queen of Tears', year: 2024, poster: require('@/assets/images/posters/the-glory.jpg') },
  { id: '00000000-0000-4000-8000-000000000002', title: 'Lovely Runner', year: 2024, poster: require('@/assets/images/posters/goblin.jpg') },
  { id: '00000000-0000-4000-8000-000000000003', title: 'Goblin', year: 2016, poster: require('@/assets/images/posters/goblin.jpg') },
  { id: '00000000-0000-4000-8000-000000000004', title: 'The Glory', year: 2022, poster: require('@/assets/images/posters/the-glory.jpg') },
  { id: '00000000-0000-4000-8000-000000000005', title: 'Crash Landing on You', year: 2019, poster: require('@/assets/images/posters/cloy.jpg') },
  { id: '00000000-0000-4000-8000-000000000006', title: 'Business Proposal', year: 2022, poster: require('@/assets/images/posters/business-proposal.jpg') },
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="h2">Discover</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.input}
          placeholder="Search dramas or people"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <Text variant="caption" color={colors.textSecondary} style={styles.section}>
        TRENDING DRAMAS
      </Text>

      <FlatList
        data={TRENDING}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/drama/${item.id}`)}
          >
            <Image source={item.poster} style={styles.poster} />
            <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
              {item.title}
            </Text>
            <Text variant="captionSmall" color={colors.textTertiary}>
              {item.year}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing['2xl'],
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    color: colors.textPrimary,
    fontSize: 16,
  },
  section: {
    paddingHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  list: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['4xl'],
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  card: {
    width: '48%',
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: 2,
  },
});
