import { Image } from 'expo-image';
import React, { useState } from 'react';
import { SettingsChoice, SettingsGroup, SettingsRow, SettingsToggle } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { discardAllFailed, retryAllFailed, useSyncStatus } from '../../lib/data/sync';
import { useApp } from '../../lib/hooks';

export default function DataSettings() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [clearing, setClearing] = useState(false);
  const sync = useSyncStatus();
  const pendingDetail = sync.failed
    ? `${sync.failed} couldn’t be sent${sync.queued ? ` · ${sync.queued} waiting` : ''}`
    : sync.queued
      ? `${sync.queued} waiting to send${sync.sending ? ' · sending…' : ''}`
      : 'Everything is up to date';
  return (
    <Screen header={<TopBar mode="stack" title="Data & storage" />}>
      <ScrollScreen>
        <SettingsGroup title="Video autoplay" footer="Shorts always play when you open them. This controls previews in feeds.">
          <SettingsChoice value={state.prefs.autoplay} onChange={(v) => dispatch({ type: 'prefs', patch: { autoplay: v } })} options={[{ key: 'always', label: 'Always' }, { key: 'wifi', label: 'Wi-Fi only (recommended)' }, { key: 'never', label: 'Never' }]} />
        </SettingsGroup>
        <SettingsGroup title="Data saver">
          <SettingsToggle icon="cellular-outline" label="Data saver" detail="Smaller images, no background prefetch." value={state.prefs.dataSaver} onChange={(v) => dispatch({ type: 'prefs', patch: { dataSaver: v } })} />
        </SettingsGroup>
        <SettingsGroup title="Pending changes" footer="Follows, reactions, posts and settings are saved on this device first and sent when you’re online.">
          <SettingsRow icon="cloud-upload-outline" label="Waiting to sync" detail={pendingDetail} chevron={false} />
          {sync.failed ? (
            <>
              <SettingsRow icon="refresh-outline" label="Retry failed changes" onPress={() => { retryAllFailed(); toast.show({ message: 'Retrying…' }); }} chevron={false} />
              <SettingsRow icon="close-circle-outline" label="Discard failed changes" detail="Rolls back what couldn’t be sent." tone="danger" onPress={() => { discardAllFailed(); toast.show({ message: 'Failed changes discarded' }); }} chevron={false} />
            </>
          ) : null}
        </SettingsGroup>
        <SettingsGroup title="Simulate network" footer="Developer option for this device only: makes every save behave as if the connection were slow, flaky or gone, so you can see how Hallyu copes.">
          <SettingsChoice
            value={state.prefs.devNetwork}
            onChange={(v) => dispatch({ type: 'prefs', patch: { devNetwork: v } })}
            options={[
              { key: 'fast', label: 'Normal', detail: 'Saves round-trip in well under a second.' },
              { key: 'slow', label: 'Slow', detail: '2–3 seconds per save. Watch the “Posting…” strip.' },
              { key: 'flaky', label: 'Flaky', detail: 'Almost half of the saves fail once and are retried; a few are rejected outright.' },
              { key: 'offline', label: 'Offline', detail: 'Nothing is sent; everything queues until you switch back.' },
            ]}
          />
        </SettingsGroup>
        <SettingsGroup title="Storage" footer="Clearing the cache removes downloaded images. Your watchlist, drafts and posts are untouched.">
          <SettingsRow icon="trash-bin-outline" label={clearing ? 'Clearing…' : 'Clear image cache'} onPress={async () => { setClearing(true); await Image.clearDiskCache().catch(() => {}); await Image.clearMemoryCache().catch(() => {}); setClearing(false); toast.show({ message: 'Cache cleared' }); }} chevron={false} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
