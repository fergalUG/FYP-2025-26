import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDatabaseWithMockData } from '@utils/database';
import { appHeaderOptions } from '@constants/navigation';
import { ThemeProvider, useTheme } from '@hooks';

export default function RootLayout() {
  useEffect(() => {
    initDatabaseWithMockData();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedRootStack />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const ThemedRootStack = () => {
  const { theme, mode } = useTheme();
  const headerOptions = appHeaderOptions(theme);
  const statusStyle = mode === 'dark' ? 'light' : 'dark';

  return (
    <>
      <StatusBar style={statusStyle} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackButtonDisplayMode: 'minimal',
            ...headerOptions,
          }}
        />
      </Stack>
    </>
  );
};
