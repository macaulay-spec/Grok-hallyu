import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, Button, Input, Avatar } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { DEMO_MODE } from '@/lib/demo';

export default function OnboardingProfileScreen() {
  const { dramaIds } = useLocalSearchParams<{ dramaIds?: string }>();
  const { user, refreshProfile, startDemoSession } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleFinish = async () => {
    if (!displayName.trim()) {
      Alert.alert('Display name required', 'Please enter a display name.');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in again.');
      router.replace('/(auth)/welcome');
      return;
    }

    if (DEMO_MODE) {
      // Offline demo: save the profile locally, skip uploads and follows.
      setLoading(true);
      await startDemoSession({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUri, // local file uri, rendered directly
        username:
          displayName.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 30) || 'demo_user',
      });
      setLoading(false);
      router.replace('/(tabs)');
      return;
    }

    setLoading(true);

    try {
      let avatarUrl: string | null = null;

      // Upload avatar if selected
      if (avatarUri) {
        const ext = avatarUri.split('.').pop() ?? 'jpg';
        const fileName = `${user.id}/avatar.${ext}`;
        const response = await fetch(avatarUri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, blob, { upsert: true });

        if (uploadError) {
          throw new Error(uploadError.message || 'Avatar upload failed');
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
      }

      // Upsert profile — username marks onboarding as complete.
      // profiles.username is UNIQUE, so on collision (23505) retry once
      // with a random numeric suffix instead of failing onboarding (fix B8).
      const baseUsername =
        displayName.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 30) ||
        `user_${user.id.slice(0, 8)}`;

      const buildPayload = (username: string) => ({
        id: user.id,
        username,
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });

      let { error } = await supabase.from('profiles').upsert(buildPayload(baseUsername));

      if (error && (error as { code?: string }).code === '23505') {
        const fallback = `${baseUsername.slice(0, 24)}_${Math.floor(1000 + Math.random() * 9000)}`;
        ({ error } = await supabase.from('profiles').upsert(buildPayload(fallback)));
      }

      if (error) throw error;

      // Optionally follow the selected dramas (only if they are real UUIDs)
      if (dramaIds) {
        const ids = dramaIds.split(',').filter((id) => id.length > 10); // skip short seed ids
        if (ids.length > 0) {
          const rows = ids.map((drama_id) => ({
            user_id: user.id,
            drama_id,
          }));
          const { error: followError } = await supabase.from('follows_dramas').upsert(rows);
          if (followError) {
            console.warn('Could not follow dramas:', followError.message);
          }
        }
      }

      await refreshProfile();
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="caption" color={colors.accent} style={styles.step}>
            STEP 2 OF 2
          </Text>
          <Text variant="h1" style={styles.title}>
            Complete your profile
          </Text>
          <Text variant="callout" color={colors.textSecondary} style={styles.subtitle}>
            Tell us a little about you. This helps us recommend stories you’ll love.
          </Text>

          <View style={styles.avatarSection}>
            <Avatar
              uri={avatarUri}
              size={100}
              onPress={pickAvatar}
              showEditBadge
            />
          </View>

          <Input
            label="Display name"
            placeholder="e.g. Alex Morgan"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
            autoCapitalize="words"
          />
          <Input
            label="Short bio"
            placeholder="Coffee lover ☕ | Always rooting for the second lead"
            value={bio}
            onChangeText={setBio}
            maxLength={120}
            multiline
            numberOfLines={3}
            style={{ height: 90, textAlignVertical: 'top' }}
          />

          <Button
            title="Finish"
            onPress={handleFinish}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.xl }}
          />

          <Text variant="captionSmall" color={colors.textTertiary} style={styles.note}>
            Your data is private and secure.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['4xl'],
  },
  step: {
    letterSpacing: 1.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing['2xl'],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  note: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
