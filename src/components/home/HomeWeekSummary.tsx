import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks';
import { getScoreColor } from '@utils/score';
import { StatTile } from '@components/common/StatTile';

interface HomeWeekSummaryProps {
  weeklyAverage: number | null;
  driveCount: number;
  distanceKm: number;
}

export const HomeWeekSummary = (props: HomeWeekSummaryProps) => {
  const { weeklyAverage, driveCount, distanceKm } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.grid}>
        <StatTile
          label="Avg Score"
          value={weeklyAverage == null ? '—' : `${weeklyAverage}/100`}
          valueColor={weeklyAverage == null ? undefined : getScoreColor(weeklyAverage, theme)}
          style={styles.tile}
        />
        <StatTile label="Drives" value={`${driveCount}`} style={styles.tile} />
        <StatTile label="Distance" value={`${distanceKm.toFixed(1)} km`} style={styles.tileWide} />
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
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
      fontWeight: '800',
      color: theme.colors.onBackground,
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
