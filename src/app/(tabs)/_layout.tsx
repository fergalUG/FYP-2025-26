import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@theme';
import { ServiceStatusIndicator } from '@components/ServiceStatusIndicator';

export default function Layout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTitleStyle: {
          color: theme.colors.onSurface,
        },
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
