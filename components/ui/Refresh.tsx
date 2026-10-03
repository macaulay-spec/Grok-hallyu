import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../../constants/theme';

/**
 * Pull-to-refresh for a screen. There is no server to round-trip: the data on screen IS the data on
 * this device, so the gesture simply re-reads the local store and settles. `scope` is kept as the
 * screen's data interest (home, activity, drama…) so a future data layer can map it again.
 */
export function useRefresh(_scope?: string) {
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
    // A short beat so the gesture reads as intentional; nothing is fetched and nothing is claimed.
    await new Promise((r) => setTimeout(r, 350));
    if (!alive.current) return;
    setRefreshing(false);
  }, []);
  const control = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface2} />;
  return { refreshing, onRefresh, control };
}
