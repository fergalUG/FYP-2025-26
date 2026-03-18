import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, DrivingScoreWheel, JourneyMap, JourneyStats, ScoreTimelineChart, StatTile } from '@components';
import { useAppSettings, useJourneyWithEvents, useJourneys, useTheme } from '@hooks';
import type { JourneyComparisonSummary } from '@types';
import { buildJourneyComparisonSummary } from '@utils/journeyInsights';
import { getScoreColor } from '@utils/score';
import { buildScoreTimelineSeries } from '@utils/scoring/buildScoreTimelineSeries';

const formatDurationLabel = (durationMs: number): string => {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

const renderComparisonContent = (
  comparisonSummary: JourneyComparisonSummary | null,
  loading: boolean,
  rangeLabel: string,
  theme: ReturnType<typeof useTheme>['theme'],
  styles: ReturnType<typeof createStyles>
) => {
  if (loading || !comparisonSummary) {
    return <Text style={styles.mutedText}>Loading recent journey baseline...</Text>;
  }

  if (comparisonSummary.baselineAverageScore == null || comparisonSummary.currentScore == null) {
    return <Text style={styles.mutedText}>No earlier scored journeys in this {rangeLabel} window yet.</Text>;
  }

  const roundedCurrentScore = Math.round(comparisonSummary.currentScore);
  const roundedBaselineScore = Math.round(comparisonSummary.baselineAverageScore);
  const roundedDelta = Math.round(comparisonSummary.delta ?? 0);

  return (
    <>
      <View style={styles.comparisonGrid}>
        <StatTile
          label="This Journey"
          value={`${roundedCurrentScore}/100`}
          valueColor={getScoreColor(roundedCurrentScore, theme)}
          variant="compact"
          style={styles.comparisonTile}
        />
        <StatTile
          label="Your Usual"
          value={`${roundedBaselineScore}/100`}
          valueColor={getScoreColor(roundedBaselineScore, theme)}
          variant="compact"
          style={styles.comparisonTile}
        />
        <StatTile
          label="Delta"
          value={`${roundedDelta >= 0 ? '+' : ''}${roundedDelta}`}
          valueColor={roundedDelta >= 0 ? theme.colors.primary : theme.colors.error}
          variant="compact"
          style={styles.comparisonTileFull}
        />
      </View>
      <Text style={styles.mutedText}>Based on {comparisonSummary.baselineJourneyCount} prior completed journeys.</Text>
    </>
  );
};

export default function JourneyDetail() {
  const router = useRouter();
  const { theme } = useTheme();
  const { settings } = useAppSettings();
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const numericJourneyId = Number(journeyId);
  const { journey, events, journeyLoading, eventsLoading, journeyError, eventsError, updateJourney } =
    useJourneyWithEvents(numericJourneyId);
  const { journeys, loading: journeysLoading } = useJourneys();
  const styles = createStyles(theme);

  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [showMapLegend, setShowMapLegend] = useState<boolean>(true);

  useEffect(() => {
    if (journey) {
      setDraftTitle(journey.title || '');
    }
  }, [journey]);

  const comparisonSummary = useMemo(() => {
    if (!journey) {
      return null;
    }

    return buildJourneyComparisonSummary(journeys, journey, settings.summaryRange);
  }, [journey, journeys, settings.summaryRange]);

  const scoreTimelinePoints = useMemo(() => buildScoreTimelineSeries(events), [events]);

  const handleTitleSave = async () => {
    if (!journey || draftTitle === journey.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      await updateJourney({ title: draftTitle });
    } catch {
      setDraftTitle(journey.title || '');
    } finally {
      setIsEditingTitle(false);
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
          <Text style={styles.errorText}>Error: {journeyError || eventsError}</Text>
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

  const rangeLabel = settings.summaryRange === 'week' ? '7-day' : '30-day';

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
              {isEditingTitle ? (
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
                <AppButton style={styles.titleButton} onPress={() => setIsEditingTitle(true)}>
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
          {journey.stats ? (
            <Text style={styles.scoreMeta}>
              Avg {journey.stats.avgScore.toFixed(1)} • Min {Math.round(journey.stats.minScore)} • End {Math.round(journey.stats.endScore)}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Vs Your Usual</Text>
          <Text style={styles.sectionSubtitle}>Comparing this journey with your recent {rangeLabel} driving history.</Text>
          {renderComparisonContent(comparisonSummary, journeysLoading, rangeLabel, theme, styles)}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Score During Drive</Text>
          <Text style={styles.sectionSubtitle}>Shows how your score dropped and recovered over the length of the journey.</Text>
          <ScoreTimelineChart points={scoreTimelinePoints} />
          <View style={styles.timelineMetaRow}>
            <Text style={styles.timelineMetaText}>Start 100</Text>
            <Text style={styles.timelineMetaText}>{formatDurationLabel(journey.stats?.durationMs ?? 0)}</Text>
            <Text style={styles.timelineMetaText}>End {Math.round(journey.stats?.endScore ?? journey.score ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Route Map</Text>
            <View style={styles.headerActions}>
              <AppButton style={styles.legendToggleButton} onPress={() => setShowMapLegend((prev) => !prev)} variant="secondary">
                <Text style={styles.legendToggleText}>{showMapLegend ? 'Hide legend' : 'Show legend'}</Text>
              </AppButton>
            </View>
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
    sectionSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: -theme.spacing.sm,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      flexShrink: 1,
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
    comparisonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    comparisonTile: {
      width: '48%',
    },
    comparisonTileFull: {
      width: '100%',
    },
    timelineMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    timelineMetaText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    mutedText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
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
