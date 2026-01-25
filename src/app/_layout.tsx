import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDatabaseWithMockData } from '@utils/database';
import { theme } from '@theme';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    initDatabaseWithMockData();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="settings"
            options={{
              headerTitle: 'Settings',
              headerBackButtonDisplayMode: 'minimal',
              headerLeft: () => (
                <Pressable style={styles.headerBack} onPress={() => router.back()}>
                  <MaterialIcons name="arrow-back" size={24} color={theme.colors.onSurface} />
                </Pressable>
              ),
              headerStyle: {
                backgroundColor: theme.colors.surface,
              },
              headerTitleStyle: {
                color: theme.colors.onSurface,
              },
              headerTintColor: theme.colors.onSurface,
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  headerBack: {
    marginLeft: 8,
  },
});
