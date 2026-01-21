import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { theme } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Layout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs>
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
