import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** hallyu.app/d/{slug}/e/{season}/{episode} → episode room */
export default function EpisodeAlias() {
  const { id, season, number } = useLocalSearchParams<{ id: string; season: string; number: string }>();
  return <Redirect href={{ pathname: '/episode/[dramaId]/[season]/[number]', params: { dramaId: String(id), season: String(season), number: String(number) } }} />;
}
