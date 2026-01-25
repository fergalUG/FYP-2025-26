import { Stack } from 'expo-router';
import { appHeaderOptions } from '@constants/navigation';

export default function JourneyLayout() {
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
          ...appHeaderOptions,
        }}
      />
    </Stack>
  );
}
