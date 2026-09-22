import React, { useRef } from 'react';
import { AccessibilityInfo, Animated, StyleProp, ViewStyle } from 'react-native';
import { Button, ButtonSize } from '../ui/Button';
import { useApp, useRequireMember, haptic, useReduceMotion } from '../../lib/hooks';
import { springs } from '../../lib/motion';
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
  const reduce = useReduceMotion();
  const on = isFollowing(kind, id);
  const noun = kind === 'users' ? 'person' : kind === 'dramas' ? 'drama' : kind === 'actors' ? 'actor' : 'collection';
  const pulse = useRef(new Animated.Value(1)).current;
  /** The state change is the feedback: a small settle when it flips to Following. */
  const settle = () => {
    if (reduce) return;
    pulse.setValue(0.94);
    Animated.spring(pulse, { toValue: 1, ...springs.bouncy }).start();
  };
  return (
    <Animated.View style={[block ? { alignSelf: 'stretch' } : null, { transform: [{ scale: pulse }] }]}>
      <Button
        label={on ? 'Following' : 'Follow'}
        variant={on ? 'secondary' : 'primary'}
        size={size}
        block={block}
        style={style}
        icon={on ? 'checkmark' : undefined}
        accessibilityLabel={`${on ? 'Unfollow' : 'Follow'} ${name ?? noun}`}
        accessibilityState={{ selected: on }}
        onPress={() =>
          require(`follow this ${noun}`, () => {
            if (on) haptic.select();
            else haptic.success();
            dispatch({ type: 'follow', kind, id, on: !on });
            track('follow.set', { kind, on: !on });
            AccessibilityInfo.announceForAccessibility?.(on ? `Unfollowed ${name ?? noun}` : `Following ${name ?? noun}`);
            if (!on) {
              settle();
              onFollowed?.();
              toast.show({ message: `Following ${name ?? `this ${noun}`}`, actionLabel: 'Undo', onAction: () => dispatch({ type: 'follow', kind, id, on: false }) });
            }
          })
        }
      />
    </Animated.View>
  );
}
