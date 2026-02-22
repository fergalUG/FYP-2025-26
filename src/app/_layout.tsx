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
import { BackgroundServiceProvider, DebugLogsProvider, DebugOverlayProvider, ThemeProvider, ToastProvider, useTheme } from '@hooks';

type ProviderEntry<Props extends Record<string, unknown> = Record<string, unknown>> = {
  Provider: React.ComponentType<{ children: React.ReactNode } & Props>;
  props?: Props;
};

//compose but also allowing passing props (removes the need to have a massive nested return in root)
//https://stackoverflow.com/questions/51504506/too-many-react-context-providers
const composeProviders = (providers: ProviderEntry[]) => {
  return ({ children }: { children: React.ReactNode }) =>
    providers.reduceRight<React.ReactNode>((acc, { Provider, props }) => {
      return <Provider {...props}>{acc}</Provider>;
    }, children);
};

const Providers = composeProviders([
  { Provider: GestureHandlerRootView, props: { style: { flex: 1 } } },
  { Provider: SafeAreaProvider },
  { Provider: ThemeProvider },
  { Provider: ToastProvider },
  { Provider: BackgroundServiceProvider },
  { Provider: DebugLogsProvider },
  { Provider: DebugOverlayProvider },
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

    return () => {
      LogService.cleanup();
    };
  }, []);

  return (
    <Providers>
      <ThemedRootStack />
    </Providers>
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
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
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
