import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { TabBar } from '../../components/navigation/TabBar';
import { colors } from '../../constants/theme';
import { useLayout } from '../../lib/hooks';

export default function TabsLayout() {
  const { wc } = useLayout();
  const rail = wc !== 'compact';
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingLeft: rail ? 80 : 0 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true }}
        sceneContainerStyle={{ backgroundColor: colors.canvas }}
        backBehavior="history"
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen name="create" options={{ title: 'Create' }} listeners={{ tabPress: (e) => e.preventDefault() }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen name="you" options={{ title: 'You' }} />
      </Tabs>
    </View>
  );
}
