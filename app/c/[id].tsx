import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/c/{id} → collection */
export default function CollectionAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/collection/[id]', params: { id: String(id) } }} />;
}
