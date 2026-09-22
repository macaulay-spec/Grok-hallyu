import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { uid } from '../../lib/format';
import { haptic, useApp } from '../../lib/hooks';
import { Collection, LIMITS } from '../../lib/model';

/** Create / edit a collection (modal). */
export default function NewCollection() {
  const router = useRouter();
  const toast = useToast();
  const { id, dramaId } = useLocalSearchParams<{ id?: string; dramaId?: string }>();
  const { state, dispatch, getCollection, getDrama } = useApp();
  const existing = getCollection(id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isPrivate, setPrivate] = useState(existing?.visibility === 'private');
  const seed = getDrama(dramaId);
  const valid = title.trim().length >= 2;

  const save = () => {
    if (!valid) return;
    const c: Collection = existing
      ? { ...existing, title: title.trim(), description: description.trim() || undefined, visibility: isPrivate ? 'private' : 'public', updatedAt: new Date().toISOString() }
      : { id: uid('col'), ownerId: state.profile.id, title: title.trim(), description: description.trim() || undefined, visibility: isPrivate ? 'private' : 'public', items: seed ? [{ dramaId: seed.id, addedAt: new Date().toISOString() }] : [], followerCount: 0, updatedAt: new Date().toISOString() };
    dispatch({ type: 'upsertCollection', collection: c });
    haptic.success();
    toast.show({ message: existing ? 'Collection updated' : `Created “${c.title}”`, icon: 'albums' });
    if (existing) router.back();
    else router.replace(`/collection/${c.id}`);
  };

  return (
    <Screen header={<TopBar mode="modal" title={existing ? 'Edit collection' : 'New collection'} right={<Button label={existing ? 'Save' : 'Create'} size="sm" onPress={save} disabled={!valid} />} />}>
      <ScrollScreen keyboard column padded>
        <View style={{ gap: space.x4, marginTop: space.x2 }}>
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Second-lead syndrome, certified" counter={LIMITS.collectionTitle} maxLength={LIMITS.collectionTitle} autoFocus returnKeyType="next" />
          <TextField label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What ties these together?" counter={LIMITS.collectionDescription} maxLength={LIMITS.collectionDescription} multiline multilineHeight={88} />
          <Pressable onPress={() => setPrivate((p) => !p)} style={styles.privacy} accessibilityRole="switch" accessibilityState={{ checked: isPrivate }}>
            <Ionicons name={isPrivate ? 'lock-closed' : 'globe-outline'} size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text variant="body">{isPrivate ? 'Private' : 'Public'}</Text>
              <Text variant="caption" tone="secondary">
                {isPrivate ? 'Only you can see it. You can flip it later.' : 'Anyone can find, follow and share it.'}
              </Text>
            </View>
            <Ionicons name={isPrivate ? 'toggle' : 'toggle-outline'} size={32} color={isPrivate ? colors.accent : colors.textTertiary} />
          </Pressable>
          {seed ? (
            <Text variant="caption" tone="secondary">
              Starts with {seed.title}.
            </Text>
          ) : null}
        </View>
      </ScrollScreen>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', alignItems: 'center', gap: space.x3, padding: space.x4, borderRadius: radius.md, backgroundColor: colors.surface1 },
});
