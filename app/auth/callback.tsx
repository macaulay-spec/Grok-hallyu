import { Redirect } from 'expo-router';
import React from 'react';

/** Deep-link landing for email verification / OAuth / recovery. Tokens are consumed by AuthProvider; we just route home. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
