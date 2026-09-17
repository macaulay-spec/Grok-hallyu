import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, Button, Input, Avatar, IconButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function EditProfileScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
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

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;

      if (avatarUri && avatarUri !== profile?.avatar_url) {
        const ext = avatarUri.split('.').pop() ?? 'jpg';
        const fileName = `${user.id}/avatar.${ext}`;
        const response = await fetch(avatarUri);
        const blob = await response.blob();
        await supabase.storage.from('avatars').upload(fileName, blob, { upsert: true });
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton name="close" onPress={() => router.back()} />
        <Text variant="h3">Edit profile</Text>
        <Button title="Save" onPress={handleSave} loading={loading} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <Avatar uri={avatarUri} size={96} onPress={pickAvatar} showEditBadge />
        </View>

        <Input
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
        />
        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          maxLength={120}
          multiline
          numberOfLines={3}
          style={{ height: 90, textAlignVertical: 'top' }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    padding: spacing['2xl'],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
});
