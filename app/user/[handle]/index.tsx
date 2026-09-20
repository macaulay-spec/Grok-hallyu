import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ProfileView } from '../../../components/profile/ProfileView';
import { Screen } from '../../../components/ui/Screen';
import { ErrorState } from '../../../components/ui/States';
import { TopBar } from '../../../components/ui/TopBar';
import { useApp } from '../../../lib/hooks';

/** Public profile by handle (also the /u/{handle} deep link). Your own handle redirects to the You tab experience. */
export default function UserProfile() {
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { getUserByHandle, me } = useApp();
  const clean = (handle ?? '').replace(/^@/, '');
  const user = clean.toLowerCase() === me.handle.toLowerCase() ? me : getUserByHandle(clean);
  if (!user) {
    return (
      <Screen header={<TopBar mode="stack" title="Profile" />}>
        <ErrorState kind="notFound" title={`@${clean} isn’t here`} body="The account may have been deleted or the handle changed." onRetry={() => router.back()} />
      </Screen>
    );
  }
  return (
    <Screen header={<TopBar mode="stack" title={`@${user.handle}`} />}>
      <ProfileView user={user} isMe={user.id === me.id} />
    </Screen>
  );
}
