import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

/**
 * This tab only exists to host the center “+” button.
 * Tapping it opens the create-post modal.
 */
export default function CreateTab() {
  useEffect(() => {
    router.push('/create-post');
  }, []);

  return <View />;
}
