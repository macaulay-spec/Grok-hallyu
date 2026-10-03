import { Image } from 'expo-image';
import React, { useState } from 'react';
import { SettingsChoice, SettingsGroup, SettingsRow, SettingsToggle } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';

export default function DataSettings() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [clearing, setClearing] = useState(false);
  return (
    <Screen header={<TopBar mode="stack" title="Data & storage" />}>
      <ScrollScreen>
        <SettingsGroup title="Video autoplay" footer="Shorts always play when you open them. This controls previews in feeds.">
          <SettingsChoice value={state.prefs.autoplay} onChange={(v) => dispatch({ type: 'prefs', patch: { autoplay: v } })} options={[{ key: 'always', label: 'Always' }, { key: 'wifi', label: 'Wi-Fi only (recommended)' }, { key: 'never', label: 'Never' }]} />
        </SettingsGroup>
        <SettingsGroup title="Data saver">
          <SettingsToggle icon="cellular-outline" label="Data saver" detail="Smaller images, no background prefetch." value={state.prefs.dataSaver} onChange={(v) => dispatch({ type: 'prefs', patch: { dataSaver: v } })} />
        </SettingsGroup>
        <SettingsGroup title="Storage" footer="Clearing the cache removes downloaded images. Your watchlist, drafts and posts are untouched.">
          <SettingsRow icon="trash-bin-outline" label={clearing ? 'Clearing…' : 'Clear image cache'} onPress={async () => { setClearing(true); await Image.clearDiskCache().catch(() => {}); await Image.clearMemoryCache().catch(() => {}); setClearing(false); toast.show({ message: 'Cache cleared' }); }} chevron={false} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
