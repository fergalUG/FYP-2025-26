import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@hooks';

import { ServiceStatusIndicator } from '@components';

import { appHeaderOptions } from '@constants/navigation';

export default function Layout() {
  const router = useRouter();
  const { theme } = useTheme();
  const headerOptions = appHeaderOptions(theme);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurface,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          height: 80,
        },
        ...headerOptions,
        headerLeft: () => (
          <View style={styles.headerLeft}>
            <ServiceStatusIndicator />
          </View>
        ),
        headerRight: () => (
          <Pressable style={styles.headerRight} onPress={() => router.push('/settings')}>
            <MaterialIcons name="account-circle" size={26} color={theme.colors.onSurface} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'VeloMetry',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journeys"
        options={{
          title: 'Journeys',
          headerTitle: 'My Journeys',
          headerShown: true,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="directions-car" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerLeft: {
    marginLeft: 10,
  },
  headerRight: {
    marginRight: 12,
  },
});
