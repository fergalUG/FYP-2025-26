import { Stack } from 'expo-router';

export default function JourneyLayout() {
  return (
    <>
      <Stack.Screen options={{ headerTitle: 'My Journeys' }} />

      <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
