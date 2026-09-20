import { useRouter } from 'expo-router';
import React from 'react';
import { Linking } from 'react-native';
import { SettingsGroup, SettingsRow } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';

export default function Help() {
  const router = useRouter();
  const mail = (subject: string) => Linking.openURL(`mailto:hello@hallyu.app?subject=${encodeURIComponent(subject)}`).catch(() => {});
  return (
    <Screen header={<TopBar mode="stack" title="Help & feedback" />}>
      <ScrollScreen>
        <SettingsGroup title="Common questions">
          <SettingsRow icon="eye-off-outline" label="Why is a post veiled for me?" detail="Spoiler protection follows your watchlist progress." onPress={() => router.push('/settings/content')} />
          <SettingsRow icon="radio-outline" label="When do episode rooms go live?" detail="The moment an episode airs in Korea, in your local time." onPress={() => router.push('/schedule')} />
          <SettingsRow icon="search-outline" label="A drama is missing" detail="Search pulls from the wider catalog; tell us if it’s still missing." onPress={() => mail('Missing drama')} />
        </SettingsGroup>
        <SettingsGroup title="Contact">
          <SettingsRow icon="mail-outline" label="Email support" value="hello@hallyu.app" onPress={() => mail('Support')} />
          <SettingsRow icon="bug-outline" label="Report a bug" onPress={() => mail('Bug report')} />
          <SettingsRow icon="bulb-outline" label="Suggest a feature" onPress={() => mail('Feature idea')} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
