import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/a/{slug} → actor page */
export default function ActorAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/actor/[id]', params: { id: String(id) } }} />;
}
