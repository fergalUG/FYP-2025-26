import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, StatTile } from '@components';
import { OverviewCategoryCard } from '@components/overview/OverviewCategoryCard';
import { formatOverviewDrivingTime, shouldUseCompactOverviewCards } from '@components/overview/model';
import { useAppSettings, useJourneys, useTheme } from '@hooks';
import { buildDrivingOverviewSummary } from '@utils/journeyInsights';

const formatDistance = (distanceKm: number): string => `${distanceKm.toFixed(1)} km`;

export default function OverviewScreen() {
  const { theme } = useTheme();
  const { settings, setSummaryRange } = useAppSettings();
  const { journeys, loading, error, refetch } = useJourneys();
  const { width } = useWindowDimensions();
  const styles = createStyles(theme);
  const overview = useMemo(
    () => buildDrivingOverviewSummary(journeys, settings.summaryRange, Date.now()),
    [journeys, settings.summaryRange]
  );
  const useCompactCards = shouldUseCompactOverviewCards(width);
  const emptyStateLabel = settings.summaryRange === 'week' ? '7-day' : '30-day';

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading overview...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.screen, styles.centerContent]}>
        <Text style={styles.errorText}>Error loading overview: {error}</Text>
        <AppButton style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </AppButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Overview</Text>
              <Text style={styles.subtitle}>Driving event patterns across your completed journeys in the selected range.</Text>
            </View>
            <View style={styles.toggleGroup}>
              {(['week', 'month'] as const).map((range) => {
                const selected = range === settings.summaryRange;
                return (
                  <AppButton
                    key={range}
                    variant="secondary"
                    style={[styles.toggleButton, selected ? styles.toggleButtonSelected : null]}
                    onPress={() => setSummaryRange(range)}
                  >
                    <Text style={[styles.toggleText, selected ? styles.toggleTextSelected : null]}>
                      {range === 'week' ? 'Week' : 'Month'}
                    </Text>
                  </AppButton>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <StatTile label="Analyzed Drives" value={`${overview.analyzedJourneyCount}`} variant="compact" style={styles.summaryTile} />
          <StatTile
            label="Driving Time"
            value={formatOverviewDrivingTime(overview.drivingTimeMs)}
            variant="compact"
            style={styles.summaryTile}
          />
          <StatTile label="Distance" value={formatDistance(overview.distanceKm)} variant="compact" style={styles.summaryTile} />
          <StatTile label="Events / Episodes" value={`${overview.totalOccurrenceCount}`} variant="compact" style={styles.summaryTile} />
        </View>

        {overview.analyzedJourneyCount === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No completed drives with saved stats yet</Text>
            <Text style={styles.emptyText}>
              Finish a few drives in this {emptyStateLabel} window and the event breakdown will appear here.
            </Text>
          </View>
        ) : null}

        <View style={styles.categoriesGrid}>
          {overview.categories.map((category) => (
            <OverviewCategoryCard
              key={category.key}
              category={category}
              totalJourneyCount={overview.analyzedJourneyCount}
              compact={useCompactCards}
              style={useCompactCards ? styles.categoryCardCompact : styles.categoryCard}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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
      maxWidth: theme.dimensions.deviceMaxWidth,
      width: '100%',
      alignSelf: 'center',
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    headerCard: {
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    headerRow: {
      alignItems: 'stretch',
      gap: theme.spacing.md,
    },
    headerText: {
      gap: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    toggleGroup: {
      flexDirection: 'row',
      width: '100%',
      gap: theme.spacing.sm,
    },
    toggleButton: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 0,
      height: 35,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.md,
    },
    toggleButtonSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    toggleTextSelected: {
      color: theme.colors.background,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    summaryTile: {
      width: '48%',
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    categoryCard: {
      width: '100%',
    },
    categoryCardCompact: {
      width: '48%',
    },
    emptyCard: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.xs,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.onBackground,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    loadingText: {
      fontSize: 16,
      color: theme.colors.onSurface,
    },
    errorText: {
      fontSize: 16,
      color: theme.colors.error,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: theme.spacing.lg,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.background,
    },
  });
