import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@hooks';

export default function Layout() {
  const { theme } = useTheme();

  return (
    <NativeTabs iconColor={{ default: theme.colors.onSurface, selected: theme.colors.primary }}>
      <NativeTabs.Trigger name="index" options={{ title: 'Home' }}>
        <Label>Home</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="journeys" options={{ title: 'Journeys' }}>
        <Label>Journeys</Label>
        <Icon sf={{ default: 'car', selected: 'car.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="overview" options={{ title: 'Overview' }}>
        <Label>Overview</Label>
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" options={{ title: 'Settings' }}>
        <Label>Settings</Label>
        <Icon sf={{ default: 'gear', selected: 'gear' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
