import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '@hooks';
import type { Journey } from '@types';
import { getScoreColor } from '@utils/score';
import { StatTile } from '@components/common/StatTile';

interface JourneyStatsProps {
  journey: Journey;
}

export const JourneyStats = (props: JourneyStatsProps) => {
  const { theme } = useTheme();
  const { journey } = props;

  const stats = journey.stats;
  if (!stats) {
    return (
      <View style={createStyles(theme).container}>
        <Text style={createStyles(theme).title}>Journey Statistics</Text>
        <Text style={createStyles(theme).subtitle}>No statistics available</Text>
      </View>
    );
  }

  const displayedScore = Math.round(journey.score ?? stats.score);

  const durationMinutes = Math.floor(stats.durationMs / 60000);
  const durationHours = Math.floor(durationMinutes / 60);
  const remainingMinutes = durationMinutes % 60;

  const durationText = durationHours > 0 ? `${durationHours}h ${remainingMinutes}m` : `${durationMinutes}m`;

  const formatSeconds = (seconds: number): string => {
    const rounded = Math.round(seconds);
    if (rounded < 60) {
      return `${rounded}s`;
    }
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  };

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Journey Statistics</Text>

      <View style={styles.statsGrid}>
        <StatTile
          label="Score"
          value={`${displayedScore}/100`}
          valueColor={getScoreColor(displayedScore, theme)}
          variant="compact"
          style={styles.tile}
        />
        <StatTile
          label="Distance"
          value={`${Math.round((journey.distanceKm ?? 0) * 100) / 100} km`}
          variant="compact"
          style={styles.tile}
        />
        <StatTile label="Duration" value={durationText} variant="compact" style={styles.tile} />
        <StatTile label="Avg Speed" value={`${stats.avgSpeed} km/h`} variant="compact" style={styles.tile} />
        <StatTile label="Max Speed" value={`${stats.maxSpeed} km/h`} variant="compact" style={styles.tile} />
      </View>

      <Text style={styles.subtitle}>Efficiency Breakdown</Text>

      <View style={styles.statsGrid}>
        <StatTile label="Time Avg" value={`${stats.avgScore.toFixed(1)}/100`} variant="compact" style={styles.tile} />
        <StatTile label="Lowest" value={`${Math.round(stats.minScore)}/100`} variant="compact" style={styles.tile} />
        <StatTile label="End" value={`${Math.round(stats.endScore)}/100`} variant="compact" style={styles.tile} />
        <StatTile label="Brakes" value={`${stats.harshBrakingCount}`} variant="compact" style={styles.tile} />
        <StatTile label="Accel" value={`${stats.harshAccelerationCount}`} variant="compact" style={styles.tile} />
        <StatTile label="Turns" value={`${stats.sharpTurnCount}`} variant="compact" style={styles.tile} />
      </View>

      {(stats.moderateSpeedingEpisodeCount > 0 || stats.harshSpeedingEpisodeCount > 0) && (
        <>
          <Text style={styles.subtitle}>Speeding</Text>
          <View style={styles.statsGrid}>
            <StatTile
              label="Moderate"
              value={`${stats.moderateSpeedingEpisodeCount} • ${formatSeconds(stats.moderateSpeedingSeconds)}`}
              variant="compact"
              style={styles.tileWide}
            />
            <StatTile
              label="Harsh"
              value={`${stats.harshSpeedingEpisodeCount} • ${formatSeconds(stats.harshSpeedingSeconds)}`}
              variant="compact"
              style={styles.tileWide}
            />
          </View>
        </>
      )}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      gap: theme.spacing.lg,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.onBackground,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onBackground,
    },
    statsGrid: {
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
