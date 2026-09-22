import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/d/{slug} → drama hub */
export default function DramaAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/drama/[id]', params: { id: String(id) } }} />;
}
