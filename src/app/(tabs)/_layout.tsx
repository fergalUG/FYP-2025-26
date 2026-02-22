import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@hooks';

export default function Layout() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <NativeTabs iconColor={{ default: theme.colors.onSurface, selected: theme.colors.primary }}>
      <NativeTabs.Trigger name="index" options={{ title: 'Home' }}>
        <Label>Home</Label>
        <Icon src={<VectorIcon family={MaterialIcons} name="home" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="journeys" options={{ title: 'Journeys' }}>
        <Label>Journeys</Label>
        <Icon src={<VectorIcon family={MaterialIcons} name="directions-car" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="../settings" options={{ title: 'settings' }}>
        <Label>Settings</Label>
        <Icon src={<VectorIcon family={MaterialIcons} name="account-circle" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
