import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/p/{id} → post detail */
export default function PostAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/post/[id]', params: { id: String(id) } }} />;
}
