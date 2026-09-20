import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { uid } from '../../lib/format';
import { haptic, useApp } from '../../lib/hooks';
import { Collection, LIMITS } from '../../lib/model';
import { myCollections } from '../../lib/selectors';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useToast } from '../ui/Toast';

/** Toggle membership of a drama across my collections; create a new one inline (sheet replaces itself, never stacks). */
export function AddToCollectionSheet({ dramaId, visible, onClose }: { dramaId: string; visible: boolean; onClose: () => void }) {
  const { state, dispatch, getDrama } = useApp();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const mine = myCollections(state);
  const drama = getDrama(dramaId);

  const toggle = (c: Collection) => {
    const has = c.items.some((i) => i.dramaId === dramaId);
    haptic.select();
    dispatch({ type: 'collectionItem', collectionId: c.id, dramaId, on: !has });
    toast.show({ message: has ? `Removed from ${c.title}` : `Added to ${c.title}`, icon: has ? 'remove-circle-outline' : 'checkmark-circle' });
  };

  const create = () => {
    const t = title.trim();
    if (!t) return;
    const c: Collection = { id: uid('col'), ownerId: state.profile.id, title: t, visibility: isPrivate ? 'private' : 'public', items: [{ dramaId, addedAt: new Date().toISOString() }], followerCount: 0, updatedAt: new Date().toISOString() };
    dispatch({ type: 'upsertCollection', collection: c });
    toast.show({ message: `Created “${t}” with ${drama?.title ?? 'this drama'}`, icon: 'albums' });
    setTitle('');
    setCreating(false);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={creating ? 'New collection' : 'Add to collection'} subtitle={drama?.title}>
      {creating ? (
        <View style={{ gap: space.x3 }}>
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Slow burns worth it" counter={LIMITS.collectionTitle} maxLength={LIMITS.collectionTitle} autoFocus returnKeyType="done" onSubmitEditing={create} />
          <Pressable onPress={() => setPrivate((p) => !p)} style={styles.privacy} accessibilityRole="switch" accessibilityState={{ checked: isPrivate }}>
            <Ionicons name={isPrivate ? 'lock-closed' : 'globe-outline'} size={18} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall">{isPrivate ? 'Private' : 'Public'}</Text>
              <Text variant="caption" tone="tertiary">
                {isPrivate ? 'Only you can see it' : 'Anyone can find and follow it'}
              </Text>
            </View>
            <Ionicons name={isPrivate ? 'toggle' : 'toggle-outline'} size={28} color={isPrivate ? colors.accent : colors.textTertiary} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space.x2, justifyContent: 'flex-end' }}>
            <Button label="Back" variant="ghost" onPress={() => setCreating(false)} />
            <Button label="Create" onPress={create} disabled={!title.trim()} />
          </View>
        </View>
      ) : (
        <>
          {mine.map((c) => {
            const has = c.items.some((i) => i.dramaId === dramaId);
            return (
              <Pressable key={c.id} onPress={() => toggle(c)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: has }} accessibilityLabel={c.title}>
                <View style={[styles.box, has ? styles.boxOn : null]}>{has ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{c.title}</Text>
                  <Text variant="caption" tone="tertiary">
                    {c.items.length} {c.items.length === 1 ? 'drama' : 'dramas'} · {c.visibility === 'private' ? 'Private' : 'Public'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {mine.length === 0 ? (
            <Text variant="bodySmall" tone="secondary" style={{ paddingVertical: space.x3 }}>
              You have no collections yet. Make the first one — a shelf for the dramas you would hand to a friend.
            </Text>
          ) : null}
          <Button label="New collection" variant="secondary" icon="add" onPress={() => setCreating(true)} style={{ marginTop: space.x3 }} block />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x3, minHeight: 52 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: space.x3, backgroundColor: colors.surface1, borderRadius: radius.md, padding: space.x3 },
});
