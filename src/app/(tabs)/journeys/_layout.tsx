import { Stack } from 'expo-router';

import { useTheme } from '@hooks';

import { appHeaderOptions } from '@constants/navigation';

export default function JourneyLayout() {
  const { theme } = useTheme();
  const headerOptions = appHeaderOptions(theme);

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[journeyId]"
        options={{
          headerShown: true,
          presentation: 'card',
          headerBackTitle: 'Back',
          ...headerOptions,
        }}
      />
    </Stack>
  );
}
