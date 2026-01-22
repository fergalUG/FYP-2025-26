import { useLocalSearchParams } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { theme } from '../../../theme';
import { useJourney } from '../../../hooks/useJourney';
import type { Journey } from '../../../types/db';

export default function JourneyDetail() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const journey: Journey | undefined = useJourney(Number(journeyId));

  if (!journey) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Journey not found</Text>
      </View>
    );
  }

  const durationMinutes: number = Math.floor((journey.endTime - journey.startTime) / 60000);

  return (
    <>
      <Stack.Screen options={{ title: journey.title || 'Journey detail' }} />
      <View style={styles.screen}>
        <Text style={styles.line}>Distance: {journey.distanceKm} km</Text>
        <Text style={styles.line}>Duration: {durationMinutes} minutes</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.onBackground },
  line: { fontSize: 16, color: theme.colors.onSurface },
});
