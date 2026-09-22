import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';

const DOCS = {
  privacy: {
    title: 'Privacy policy',
    sections: [
      ['What we collect', 'Your email and display name; the posts, comments, reactions, watchlist, collections and follows you create; device and crash diagnostics. Nothing is sold.'],
      ['What stays on the device', 'Drafts, revealed spoilers and cached images never leave your phone unless you post them.'],
      ['Catalog data', 'Drama, episode and actor information comes from TMDB and community edits. Searching sends only your query to the catalog provider.'],
      ['Deleting your data', 'Delete your account in Settings → Account, or request deletion at hallyu.app/delete. Posts are removed within 30 days; anonymised aggregates may remain.'],
      ['Contact', 'privacy@hallyu.app'],
    ],
  },
  terms: {
    title: 'Terms of service',
    sections: [
      ['Your account', 'You must be 13 or older. One account per person. You are responsible for what is posted from it.'],
      ['Your content', 'You own what you post and grant Hallyu a licence to display it in the app. Untagged spoilers, harassment, piracy links and explicit content may be removed; repeat violations end accounts.'],
      ['Catalog', 'Drama information is provided as-is from third-party sources including TMDB. Hallyu is not endorsed or certified by TMDB.'],
      ['Changes', 'We will notify you in-app before material changes take effect.'],
    ],
  },
} as const;

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: keyof typeof DOCS }>();
  const d = DOCS[doc === 'terms' ? 'terms' : 'privacy'];
  return (
    <Screen header={<TopBar mode="stack" title={d.title} />}>
      <ScrollScreen column padded>
        {d.sections.map(([h, b]) => (
          <React.Fragment key={h}>
            <Text variant="titleSmall" style={{ marginTop: space.x5 }}>
              {h}
            </Text>
            <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
              {b}
            </Text>
          </React.Fragment>
        ))}
        <Text variant="caption" tone="tertiary" style={{ marginVertical: space.x8 }}>
          Effective September 2026.
        </Text>
      </ScrollScreen>
    </Screen>
  );
}
