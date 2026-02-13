import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, ScrollView, Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { useJourneyWithEvents, useTheme } from '@hooks';

import { DrivingScoreWheel, JourneyMap, JourneyStats, AppButton } from '@components';

export default function JourneyDetail() {
  const router = useRouter();
  const { theme } = useTheme();
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const { journey, events, journeyLoading, eventsLoading, journeyError, eventsError, updateJourney } = useJourneyWithEvents(
    Number(journeyId)
  );
  const styles = createStyles(theme);

  const [isEditingtitle, setIsEditingtitle] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [showMapLegend, setShowMapLegend] = useState<boolean>(true);

  useEffect(() => {
    if (journey) {
      setDraftTitle(journey.title || '');
    }
  }, [journey]);

  const handleTitleSave = async () => {
    if (!journey || draftTitle === journey.title) {
      setIsEditingtitle(false);
      return;
    }

    try {
      await updateJourney({ title: draftTitle });
    } catch {
      setDraftTitle(journey.title || '');
    } finally {
      setIsEditingtitle(false);
    }
  };

  const handleMapPress = () => {
    router.push({
      pathname: '/journey/map',
      params: { journeyId, showLegend: showMapLegend ? '1' : '0' },
    });
  };

  if (journeyLoading || eventsLoading) {
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

  if (journeyError || eventsError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={[styles.screen, styles.centerContent]}>
          <Text style={styles.errorText}>Error: {journeyError}</Text>
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
      <Stack.Screen options={{ title: 'Journey Details', contentStyle: styles.screen, headerBackVisible: true }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerText}>
              {isEditingtitle ? (
                <TextInput
                  style={[styles.journeyTitle, styles.journeyTitleInput]}
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleTitleSave}
                  onBlur={handleTitleSave}
                  multiline={false}
                />
              ) : (
                <AppButton style={styles.titleButton} onPress={() => setIsEditingtitle(true)}>
                  <Text style={styles.journeyTitle}>{journey.title || 'Untitled Journey'}</Text>
                </AppButton>
              )}
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
            <DrivingScoreWheel score={journey.score ?? journey.stats?.score ?? 0} size={200} />
          </View>
          {journey.stats && (
            <Text style={styles.scoreMeta}>
              Avg {journey.stats.avgScore.toFixed(1)} • Min {Math.round(journey.stats.minScore)} • End {Math.round(journey.stats.endScore)}
            </Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Route Map</Text>
            <AppButton style={styles.legendToggleButton} onPress={() => setShowMapLegend((prev) => !prev)} variant="secondary">
              <Text style={styles.legendToggleText}>{showMapLegend ? 'Hide legend' : 'Show legend'}</Text>
            </AppButton>
          </View>
          <AppButton style={styles.mapButton} onPress={handleMapPress} variant="secondary">
            <JourneyMap events={events} height={300} interactive={false} showLegend={showMapLegend} />
          </AppButton>
        </View>

        <View style={styles.sectionCard}>
          <JourneyStats journey={journey} />
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
      textAlign: 'center',
      color: theme.colors.onBackground,
    },
    journeyDate: {
      fontSize: 14,
      alignSelf: 'center',
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
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    scoreWheelContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreMeta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      fontWeight: '600',
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
    journeyTitleInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary,
      paddingVertical: 0,
      color: theme.colors.primary,
    },
    titleButton: {
      backgroundColor: 'transparent',
    },
    mapButton: {
      padding: 0,
      overflow: 'hidden',
      borderWidth: 0,
    },
    legendToggleButton: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: theme.radius.md,
    },
    legendToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.onSurface,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
  });
