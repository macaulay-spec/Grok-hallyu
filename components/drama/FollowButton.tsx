import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Button, ButtonSize } from '../ui/Button';
import { useApp, useRequireMember, haptic } from '../../lib/hooks';
import { useToast } from '../ui/Toast';
import { AppState } from '../../lib/store';
import { track } from '../../lib/analytics';

interface FollowButtonProps {
  kind: keyof AppState['follows'];
  id: string;
  name?: string; // for toast copy
  size?: ButtonSize;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Called after a follow (e.g. to offer notifications) */
  onFollowed?: () => void;
}

/** One verb everywhere: Follow / Following. Optimistic, instant, undoable via toast. */
export function FollowButton({ kind, id, name, size = 'sm', block, style, onFollowed }: FollowButtonProps) {
  const { isFollowing, dispatch } = useApp();
  const require = useRequireMember();
  const toast = useToast();
  const on = isFollowing(kind, id);
  const noun = kind === 'users' ? 'person' : kind === 'dramas' ? 'drama' : kind === 'actors' ? 'actor' : 'collection';
  return (
    <Button
      label={on ? 'Following' : 'Follow'}
      variant={on ? 'secondary' : 'primary'}
      size={size}
      block={block}
      style={style}
      icon={on ? 'checkmark' : undefined}
      accessibilityLabel={`${on ? 'Unfollow' : 'Follow'} ${name ?? noun}`}
      onPress={() =>
        require(`follow this ${noun}`, () => {
          haptic.light();
          dispatch({ type: 'follow', kind, id, on: !on });
          track('follow.set', { kind, on: !on });
          if (!on) {
            onFollowed?.();
            toast.show({ message: `Following ${name ?? `this ${noun}`}`, actionLabel: 'Undo', onAction: () => dispatch({ type: 'follow', kind, id, on: false }) });
          }
        })
      }
    />
  );
}
