import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDatabaseWithMockData } from '@utils/database';
import { JourneyService } from '@services/JourneyService';
import { initBackgroundService } from '@services/BackgroundService';
import { appHeaderOptions } from '@constants/navigation';
import { BackgroundServiceProvider, ThemeProvider, useTheme } from '@hooks';

export default function RootLayout() {
  useEffect(() => {
    initBackgroundService();
    if (__DEV__) {
      initDatabaseWithMockData();
      return;
    }

    JourneyService.initDatabase();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <BackgroundServiceProvider>
          <SafeAreaProvider>
            <ThemedRootStack />
          </SafeAreaProvider>
        </BackgroundServiceProvider>
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
        <Stack.Screen
          name="journey/[journeyId]"
          options={{
            presentation: 'modal',
            title: 'Journey Details',
            headerShown: true,
            headerBackTitle: 'Back',
            headerBackVisible: true,
            ...headerOptions,
          }}
        />
      </Stack>
    </>
  );
};
