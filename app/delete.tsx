import { Redirect } from 'expo-router';
import React from 'react';

/** hallyu.app/delete — the public account-deletion link required by Play policy lands on the in-app flow. */
export default function DeleteAlias() {
  return <Redirect href="/settings/delete-account" />;
}
