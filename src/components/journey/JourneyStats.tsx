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
  const styles = createStyles(theme);

  const stats = journey.stats;
  if (!stats) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Efficiency Summary</Text>
        <Text style={styles.subtitle}>No statistics available</Text>
      </View>
    );
  }

  const displayedScore = Math.round(journey.score ?? stats.score);
  const averageScore = Math.round(stats.avgScore);

  const durationMinutes = Math.floor(stats.durationMs / 60000);
  const durationHours = Math.floor(durationMinutes / 60);
  const remainingMinutes = durationMinutes % 60;

  const durationText = durationHours > 0 ? `${durationHours}h ${remainingMinutes}m` : `${durationMinutes}m`;

  const harshIncidentCount = stats.harshBrakingCount + stats.harshAccelerationCount + stats.sharpTurnCount;
  const stopAndGoCount = stats.stopAndGoCount ?? 0;
  const totalSpeedingEpisodes = stats.moderateSpeedingEpisodeCount + stats.harshSpeedingEpisodeCount;
  const summaryParts: string[] = [];

  if (harshIncidentCount === 0) {
    summaryParts.push('No harsh events');
  } else {
    summaryParts.push(`${harshIncidentCount} harsh event${harshIncidentCount === 1 ? '' : 's'}`);
  }

  if (stopAndGoCount === 0) {
    summaryParts.push('no stop & go');
  } else {
    summaryParts.push(`${stopAndGoCount} stop & go event${stopAndGoCount === 1 ? '' : 's'}`);
  }

  if (totalSpeedingEpisodes === 0) {
    summaryParts.push('no speeding');
  } else {
    summaryParts.push(`${totalSpeedingEpisodes} speeding episode${totalSpeedingEpisodes === 1 ? '' : 's'}`);
  }

  const formatSeconds = (seconds: number): string => {
    const rounded = Math.round(seconds);
    if (rounded < 60) {
      return `${rounded}s`;
    }
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Efficiency Summary</Text>
      <Text style={styles.subtitleMuted}>{summaryParts.join(', ')}</Text>

      <View style={styles.statsGrid}>
        <StatTile
          label="Score"
          value={`${displayedScore}/100`}
          valueColor={getScoreColor(displayedScore, theme)}
          variant="compact"
          style={styles.tile}
        />
        <StatTile label="Avg Score" value={`${averageScore}/100`} variant="compact" style={styles.tile} />
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

      <Text style={styles.subtitle}>Driving Events</Text>

      <View style={styles.statsGrid}>
        <StatTile label="Harsh Brakes" value={`${stats.harshBrakingCount}`} variant="compact" style={styles.tile} />
        <StatTile label="Harsh Accel" value={`${stats.harshAccelerationCount}`} variant="compact" style={styles.tile} />
        <StatTile label="Sharp Turns" value={`${stats.sharpTurnCount}`} variant="compact" style={styles.tile} />
        <StatTile label="Stop & Go" value={`${stopAndGoCount}`} variant="compact" style={styles.tile} />
      </View>

      {(stats.moderateSpeedingEpisodeCount > 0 ||
        stats.harshSpeedingEpisodeCount > 0 ||
        stats.moderateSpeedingSeconds > 0 ||
        stats.harshSpeedingSeconds > 0) && (
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
    subtitleMuted: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: -theme.spacing.sm,
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
