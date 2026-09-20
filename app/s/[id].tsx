import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/s/{id} → Shorts, starting on that short */
export default function ShortAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/shorts', params: { id: String(id) } }} />;
}
