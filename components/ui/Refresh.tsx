import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../../constants/theme';
import { PullScope } from '../../lib/data/backend';
import { refresh } from '../../lib/data/sync';
import { toast } from './Toast';

/**
 * Pull-to-refresh bound to the data layer: round-trips the backend for `scope`, refreshes catalog
 * art and pushes anything pending. Returns a ready-made RefreshControl plus the raw handlers.
 */
export function useRefresh(scope: PullScope) {
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { ok } = await refresh(scope);
    if (!alive.current) return;
    setRefreshing(false);
    if (!ok) toast.show({ message: 'Couldn’t refresh — showing what’s on this device', icon: 'cloud-offline-outline' });
  }, [scope]);
  const control = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface2} />;
  return { refreshing, onRefresh, control };
}
