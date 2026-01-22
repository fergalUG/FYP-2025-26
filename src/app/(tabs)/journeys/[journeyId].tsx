import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { theme } from '../../../theme';
import { useJourneyWithEvents } from '../../../hooks';
import { DrivingScoreWheel, JourneyMap, JourneyStats } from '../../../components';

export default function JourneyDetail() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const { journey, events, loading, error } = useJourneyWithEvents(Number(journeyId));

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <View style={[styles.screen, styles.centerContent]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading journey...</Text>
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={[styles.screen, styles.centerContent]}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      </>
    );
  }

  if (!journey) {
    return (
      <>
        <Stack.Screen options={{ title: 'Journey Not Found' }} />
        <View style={[styles.screen, styles.centerContent]}>
          <Text style={styles.title}>Journey not found</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: journey.title || 'Journey Detail' }} />
      <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.journeyTitle}>{journey.title}</Text>
          <Text style={styles.journeyDate}>{new Date(journey.date).toLocaleDateString()}</Text>
        </View>

        <View style={styles.scoreSection}>
          <Text style={styles.sectionTitle}>Driving Efficiency Score</Text>
          <View style={styles.scoreWheelContainer}>
            <DrivingScoreWheel score={journey.score} size={220} />
          </View>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.sectionTitle}>Route Map</Text>
          <JourneyMap events={events} height={280} />
        </View>

        <View style={styles.statsSection}>
          <JourneyStats journey={journey} events={events} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  header: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
  },
  journeyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.onBackground,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  journeyDate: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  scoreSection: {
    padding: theme.spacing.lg,
    paddingTop: 0,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onBackground,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  scoreWheelContainer: {
    padding: theme.spacing.lg,
  },
  mapSection: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  statsSection: {
    padding: theme.spacing.lg,
    paddingTop: 0,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.onSurface,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.error,
    textAlign: 'center',
  },
});
