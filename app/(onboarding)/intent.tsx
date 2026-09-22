import { Redirect } from 'expo-router';
import React from 'react';

/** The intent question was cut from onboarding (it added a step without changing the product). Old links land on the first real step. */
export default function IntentStep() {
  return <Redirect href="/(onboarding)/genres" />;
}
