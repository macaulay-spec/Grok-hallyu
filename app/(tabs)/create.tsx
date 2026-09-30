import { Redirect } from 'expo-router';
import React from 'react';

/** The Create tab is intercepted by the tab bar, and redirects to `/create/post` on direct URL navigation. */
export default function CreateTab() {
  return <Redirect href="/create/post" />;
}
