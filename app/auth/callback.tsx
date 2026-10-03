import { Redirect } from 'expo-router';
import React from 'react';

/** Deep-link landing for email verification / recovery. Nothing to consume without a backend; we just route home. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
