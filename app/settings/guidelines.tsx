import React from 'react';
import { View } from 'react-native';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';

const RULES: { title: string; body: string }[] = [
  { title: 'Tag your spoilers', body: 'Anything past the premiere needs a spoiler level. Episode, season or ending — pick the one that matches. Untagged spoilers get removed and repeat offenders lose posting for a week.' },
  { title: 'Argue about the drama, not the person', body: 'Disagree with a take, not a human. Harassment, slurs, threats, and dogpiling get accounts removed.' },
  { title: 'Respect actors as people', body: 'Critique performances freely. Rumours about private lives, appearance shaming and dating speculation aren’t what Hallyu is for.' },
  { title: 'No piracy', body: 'Links to unlicensed streams or downloads are removed. Say where you watched instead.' },
  { title: 'Keep it safe for a mixed audience', body: 'No sexual or graphic content, even from the shows. Reference the scene; don’t reproduce it.' },
  { title: 'Be a real person', body: 'One account, your own words, no bots. Impersonating actors, writers or other members is grounds for removal.' },
  { title: 'Reports are reviewed by people', body: 'Usually within 24 hours. Reports are anonymous, retaliation isn’t tolerated, and false reports may limit your account.' },
];

export default function Guidelines() {
  return (
    <Screen header={<TopBar mode="stack" title="Community guidelines" />}>
      <ScrollScreen column padded>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2, marginBottom: space.x6 }}>
          Hallyu is for people who love Korean dramas enough to talk about them properly. Seven rules keep the rooms good.
        </Text>
        {RULES.map((r, i) => (
          <View key={r.title} style={{ marginBottom: space.x5 }}>
            <Text variant="titleSmall">
              {i + 1}. {r.title}
            </Text>
            <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
              {r.body}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="tertiary" style={{ marginBottom: space.x8 }}>
          Last updated September 2026. Posting on Hallyu means you accept these guidelines and the Terms of Service.
        </Text>
      </ScrollScreen>
    </Screen>
  );
}
