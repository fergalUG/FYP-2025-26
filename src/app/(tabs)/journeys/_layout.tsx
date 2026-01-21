import { Stack } from 'expo-router';

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
          headerBackTitle: 'Journeys',
          headerBackTitleVisible: true,
        }}
      />
    </Stack>
  );
}
