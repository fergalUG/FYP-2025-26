import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks/useTheme';
import { getScoreColor } from '@utils/score';
import { createSurfaceCardStyle } from '@utils/themeStyles';
import { StatTile } from '@components/common/StatTile';
import { AppButton } from '@components/common/AppButton';
import type { JourneyPeriodSummary, SummaryRange } from '@types';

interface HomeWeekSummaryProps {
  summary: JourneyPeriodSummary;
  summaryRange: SummaryRange;
  onChangeRange: (range: SummaryRange) => void;
}

export const HomeWeekSummary = (props: HomeWeekSummaryProps) => {
  const { summary, summaryRange, onChangeRange } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const averageScore = summary.averageScore == null ? null : Math.round(summary.averageScore);
  const title = summaryRange === 'week' ? 'This Week' : 'This Month';

  return (
    <View style={styles.sectionCard}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.toggleGroup}>
          {(['week', 'month'] as const).map((range) => {
            const selected = range === summaryRange;
            return (
              <AppButton
                key={range}
                variant="secondary"
                style={[
                  styles.toggleButton,
                  selected ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary } : null,
                ]}
                onPress={() => onChangeRange(range)}
              >
                <Text style={[styles.toggleText, selected ? { color: theme.colors.background } : null]}>
                  {range === 'week' ? 'Week' : 'Month'}
                </Text>
              </AppButton>
            );
          })}
        </View>
      </View>
      <View style={styles.grid}>
        <StatTile
          label="Avg Score"
          value={averageScore == null ? '—' : `${averageScore}/100`}
          valueColor={averageScore == null ? undefined : getScoreColor(averageScore, theme)}
          style={styles.tile}
        />
        <StatTile label="Drives" value={`${summary.journeyCount}`} style={styles.tile} />
        <StatTile label="Distance" value={`${summary.distanceKm.toFixed(1)} km`} style={styles.tileWide} />
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    sectionCard: createSurfaceCardStyle(theme, { padding: 'lg', gap: 'md' }),
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    toggleGroup: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    toggleButton: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      minHeight: 0,
      borderRadius: theme.radius.md,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    tile: {
      width: '48%',
    },
    tileWide: {
      width: '100%',
    },
  });
