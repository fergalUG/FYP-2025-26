import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDatabaseWithMockData } from '@utils/database';
import { JourneyService } from '@services/JourneyService';
import { initBackgroundService } from '@services/BackgroundService';
import { LogService } from '@services/LogService';
import { appHeaderOptions } from '@constants/navigation';
import { BackgroundServiceProvider, DebugOverlayProvider, ThemeProvider, ToastProvider, useTheme } from '@hooks';

const compose = (providers: React.FC<{ children: React.ReactNode }>[]) =>
  providers.reduce((Prev, Curr) => ({ children }: { children: React.ReactNode }) => {
    if (!Prev) return <Curr>{children}</Curr>;

    return (
      <Prev>
        <Curr>{children}</Curr>
      </Prev>
    );
  });

const Providers = compose([
  GestureHandlerRootView,
  SafeAreaProvider,
  ThemeProvider,
  ToastProvider,
  BackgroundServiceProvider,
  DebugOverlayProvider,
]);

export default function RootLayout() {
  useEffect(() => {
    LogService.initSession();
    initBackgroundService();
    if (__DEV__) {
      initDatabaseWithMockData();
      return;
    }

    JourneyService.initDatabase();
  }, []);

  return (
    <Providers>
      <ThemedRootStack />
    </Providers>
  );
  // return (
  //   <GestureHandlerRootView style={{ flex: 1 }}>
  //     <SafeAreaProvider>
  //       <ThemeProvider>
  //         <ToastProvider>
  //           <BackgroundServiceProvider>
  //             <DebugOverlayProvider>
  //               <ThemedRootStack />
  //             </DebugOverlayProvider>
  //           </BackgroundServiceProvider>
  //         </ToastProvider>
  //       </ThemeProvider>
  //     </SafeAreaProvider>
  //   </GestureHandlerRootView>
  // );
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
            presentation: 'card',
            title: 'Journey Details',
            headerShown: true,
            headerBackTitle: 'Back',
            headerBackVisible: true,
            ...headerOptions,
          }}
        />
        <Stack.Screen
          name="journey/map"
          options={{
            title: 'Route Map',
            presentation: 'card',
            headerBackTitle: 'Details',
            contentStyle: { backgroundColor: theme.colors.background },
            ...headerOptions,
          }}
        />
      </Stack>
    </>
  );
};
