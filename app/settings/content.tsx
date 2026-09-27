import React, { useState } from 'react';
import { View } from 'react-native';
import { SettingsChoice, SettingsGroup, SettingsToggle } from '../../components/settings/Rows';
import { Button } from '../../components/ui/Button';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { FANDOMS } from '../../lib/fandoms';
import { useApp } from '../../lib/hooks';
import { SpoilerProtection } from '../../lib/model';

/** Content & spoilers — protection level, one-tap reactions, muted words, personalisation. */
export default function ContentSettings() {
  const { state, dispatch } = useApp();
  const [word, setWord] = useState('');
  const p = state.prefs;
  const addWord = () => {
    const w = word.trim().toLowerCase();
    if (!w || p.mutedWords.includes(w)) return setWord('');
    dispatch({ type: 'prefs', patch: { mutedWords: [...p.mutedWords, w] } });
    setWord('');
  };
  return (
    <Screen header={<TopBar mode="stack" title="Content & spoilers" />}>
      <ScrollScreen keyboard>
        <SettingsGroup title="Spoiler protection" footer="Completed and dropped dramas are never veiled. Watching veils anything past your current episode. Want-to-watch veils everything.">
          <SettingsChoice<SpoilerProtection>
            value={p.protection}
            onChange={(v) => dispatch({ type: 'prefs', patch: { protection: v } })}
            options={[
              { key: 'strict', label: 'Strict', detail: 'Also veils spoilers for dramas you haven’t tracked.' },
              { key: 'balanced', label: 'Balanced (recommended)', detail: 'Veils based on your watchlist progress.' },
              { key: 'off', label: 'Off', detail: 'Show everything. Spoiler tags still appear.' },
            ]}
          />
        </SettingsGroup>
        <SettingsGroup
          title="Your worlds"
          footer="Your worlds lead For You and Explore — they never hide the others. Add a world back here any time; Hallyu shows all four when you belong to none."
        >
          <View style={{ padding: space.x4, gap: space.x3 }}>
            <ChipRow>
              {FANDOMS.map((f) => {
                const on = (state.profile.fandoms ?? []).includes(f.id);
                return (
                  <Chip
                    key={f.id}
                    label={`${f.flag} ${f.label}`}
                    selected={on}
                    onPress={() => {
                      const next = on ? (state.profile.fandoms ?? []).filter((x) => x !== f.id) : [...(state.profile.fandoms ?? []), f.id];
                      dispatch({ type: 'profile', patch: { fandoms: next } });
                      dispatch({ type: 'onboarding', patch: { fandoms: next } });
                    }}
                    accessibilityLabel={`${on ? 'Remove' : 'Add'} ${f.label}`}
                  />
                );
              })}
            </ChipRow>
            <Text variant="caption" tone="tertiary">
              {state.profile.fandoms?.length ? `Following ${state.profile.fandoms.length} of 4 worlds.` : 'No worlds picked — showing all four equally.'}
            </Text>
          </View>
        </SettingsGroup>
        <SettingsGroup title="Reactions & feed">
          <SettingsToggle icon="heart-outline" label="One-tap Loved" detail="Tap reacts Loved; long-press picks another. Off = always show the picker." value={p.oneTapReactions} onChange={(v) => dispatch({ type: 'prefs', patch: { oneTapReactions: v } })} />
          <SettingsToggle icon="sparkles-outline" label="Personalised recommendations" detail="Use your watchlist and genres to rank For You and Explore." value={p.personalization} onChange={(v) => dispatch({ type: 'prefs', patch: { personalization: v } })} />
          <SettingsToggle icon="pulse-outline" label="Reduce motion" detail="Fades only, no autoplay, no spring effects." value={p.reduceMotion} onChange={(v) => dispatch({ type: 'prefs', patch: { reduceMotion: v } })} />
        </SettingsGroup>
        <SettingsGroup title="Muted words" footer="Posts and comments containing these words are hidden from your feeds and rooms. Case-insensitive.">
          <View style={{ padding: space.x4, gap: space.x3 }}>
            <View style={{ flexDirection: 'row', gap: space.x2, alignItems: 'flex-end' }}>
              <TextField value={word} onChangeText={setWord} placeholder="e.g. finale, leak" containerStyle={{ flex: 1 }} returnKeyType="done" onSubmitEditing={addWord} autoCapitalize="none" />
              <Button label="Add" variant="secondary" onPress={addWord} disabled={!word.trim()} />
            </View>
            {p.mutedWords.length ? (
              <ChipRow>
                {p.mutedWords.map((w) => (
                  <Chip key={w} label={w} icon="close" onPress={() => dispatch({ type: 'prefs', patch: { mutedWords: p.mutedWords.filter((x) => x !== w) } })} accessibilityLabel={`Remove muted word ${w}`} />
                ))}
              </ChipRow>
            ) : (
              <Text variant="caption" tone="tertiary">
                No muted words.
              </Text>
            )}
          </View>
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
