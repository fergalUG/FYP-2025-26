import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';

import { useJourneyWithEvents, useTheme } from '@hooks';

import { DrivingScoreWheel, JourneyMap, JourneyStats } from '@components';

export default function JourneyDetail() {
  const { theme } = useTheme();
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const { journey, events, loading, error } = useJourneyWithEvents(Number(journeyId));
  const styles = createStyles(theme);

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
      <Stack.Screen options={{ title: journey.title || 'Journey Detail', contentStyle: styles.screen, headerBackVisible: true }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerText}>
              <Text style={styles.journeyTitle}>{journey.title}</Text>
              <Text style={styles.journeyDate}>
                {new Date(journey.date).toLocaleDateString() +
                  ', ' +
                  (journey.startTime ? new Date(journey.startTime).toLocaleTimeString() : 'Time')}
              </Text>
            </View>
          </View>
          <View style={styles.headerMetaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Distance</Text>
              <Text style={styles.metaValue}>{(journey.distanceKm ?? 0).toFixed(1)} km</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Duration</Text>
              <Text style={styles.metaValue}>
                {journey.endTime ? Math.max(0, Math.round((journey.endTime - journey.startTime) / 60000)) : 0} min
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Driving Efficiency</Text>
          <View style={styles.scoreWheelContainer}>
            <DrivingScoreWheel score={journey.score ?? 0} size={200} />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Route Map</Text>
          <JourneyMap events={events} height={260} />
        </View>

        <View style={styles.sectionCard}>
          <JourneyStats journey={journey} events={events} />
        </View>
      </ScrollView>
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.lg,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.lg,
    },
    headerCard: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.md,
    },
    headerTop: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      alignItems: 'center',
    },
    scoreBadge: {
      width: 70,
      height: 70,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreValue: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.colors.background,
    },
    scoreLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.background,
      opacity: 0.9,
    },
    headerText: {
      flex: 1,
      gap: 4,
    },
    journeyTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    journeyDate: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    headerMetaRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    metaChip: {
      flex: 1,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      gap: 4,
    },
    metaLabel: {
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: theme.colors.textSecondary,
    },
    metaValue: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.onBackground,
    },
    sectionCard: {
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onBackground,
    },
    scoreWheelContainer: {
      alignItems: 'center',
      justifyContent: 'center',
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
