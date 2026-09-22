import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/u/{handle} → profile */
export default function UserAlias() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <Redirect href={{ pathname: '/user/[handle]', params: { handle: String(handle) } }} />;
}
