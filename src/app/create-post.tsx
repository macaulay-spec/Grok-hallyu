import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, Button, IconButton, DramaChip } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function CreatePostScreen() {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!body.trim() && !mediaUri) {
      Alert.alert('Empty post', 'Write something or add a photo.');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      let mediaUrls: string[] = [];

      if (mediaUri) {
        const ext = mediaUri.split('.').pop() ?? 'jpg';
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        const response = await fetch(mediaUri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(fileName, blob);

        if (!uploadError) {
          const { data } = supabase.storage.from('posts').getPublicUrl(fileName);
          mediaUrls = [data.publicUrl];
        }
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        body: body.trim() || null,
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        media_type: mediaUrls.length > 0 ? 'image' : 'none',
      });

      if (error) throw error;

      router.back();
    } catch (err: any) {
      Alert.alert('Could not post', err.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconButton name="close" onPress={() => router.back()} />
          <Text variant="h3">New post</Text>
          <Button
            title="Post"
            onPress={handlePost}
            loading={loading}
            size="sm"
            disabled={!body.trim() && !mediaUri}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <TextInput
            style={styles.input}
            placeholder="What drama is living in your head rent-free?"
            placeholderTextColor={colors.textTertiary}
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
            maxLength={2000}
          />

          {mediaUri && (
            <View style={styles.mediaPreview}>
              <Image source={{ uri: mediaUri }} style={styles.previewImage} />
              <IconButton
                name="close-circle"
                color={colors.textPrimary}
                style={styles.removeMedia}
                onPress={() => setMediaUri(null)}
              />
            </View>
          )}

          <View style={styles.toolbar}>
            <IconButton name="image-outline" onPress={pickImage} color={colors.accent} />
            <Text variant="caption" color={colors.textTertiary}>
              Add a still or moment
            </Text>
          </View>
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
  input: {
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  mediaPreview: {
    marginTop: spacing.lg,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
  },
  removeMedia: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing['2xl'],
    gap: spacing.sm,
  },
});
