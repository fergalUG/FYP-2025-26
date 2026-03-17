import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '@hooks/useTheme';
import type { Journey } from '@types';
import { getScoreColor } from '@utils/score';
import { StatTile } from '@components/common/StatTile';
import { buildJourneyStatsSummary, isSpeedLimitDetectionEnabledForJourney } from '@components/journey/journeyStatsModel';

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

  const lightOscillationEpisodeCount = stats.lightOscillationEpisodeCount ?? 0;
  const moderateOscillationEpisodeCount = stats.moderateOscillationEpisodeCount ?? 0;
  const harshOscillationEpisodeCount = stats.harshOscillationEpisodeCount ?? 0;
  const lightOscillationSeconds = stats.lightOscillationSeconds ?? 0;
  const moderateOscillationSeconds = stats.moderateOscillationSeconds ?? 0;
  const harshOscillationSeconds = stats.harshOscillationSeconds ?? 0;

  const stopAndGoCount = stats.stopAndGoCount ?? 0;
  const speedLimitDetectionEnabled = isSpeedLimitDetectionEnabledForJourney(stats);

  const formatSeconds = (seconds: number): string => {
    const rounded = Math.round(seconds);
    if (rounded < 60) {
      return `${rounded}s`;
    }
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  };

  const formatTierCount = (lightCount: number, moderateCount: number, harshCount: number): string => {
    return `Light ${lightCount} • Moderate ${moderateCount} • Harsh ${harshCount}`;
  };

  const formatEpisodeCount = (episodeCount: number): string => {
    return `${episodeCount} episode${episodeCount === 1 ? '' : 's'}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Efficiency Summary</Text>
      <Text style={styles.subtitleMuted}>{buildJourneyStatsSummary(stats)}</Text>

      <View style={styles.tileGrid}>
        <StatTile
          label="Score"
          value={`${displayedScore}/100`}
          valueColor={getScoreColor(displayedScore, theme)}
          variant="compact"
          style={styles.tileHalf}
        />
        <StatTile label="Avg Score" value={`${averageScore}/100`} variant="compact" style={styles.tileHalf} />
        <StatTile
          label="Distance"
          value={`${Math.round((journey.distanceKm ?? 0) * 100) / 100} km`}
          variant="compact"
          style={styles.tileHalf}
        />
        <StatTile label="Duration" value={durationText} variant="compact" style={styles.tileHalf} />
        <StatTile label="Avg Speed" value={`${stats.avgSpeed} km/h`} variant="compact" style={styles.tileHalf} />
        <StatTile label="Max Speed" value={`${stats.maxSpeed} km/h`} variant="compact" style={styles.tileHalf} />
      </View>

      <Text style={styles.subtitle}>Driving Events</Text>

      <View style={styles.stackGrid}>
        <StatTile
          label="Braking"
          value={formatTierCount(stats.lightBrakingCount, stats.moderateBrakingCount, stats.harshBrakingCount)}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
        <StatTile
          label="Acceleration"
          value={formatTierCount(stats.lightAccelerationCount, stats.moderateAccelerationCount, stats.harshAccelerationCount)}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
        <StatTile
          label="Cornering"
          value={formatTierCount(stats.lightTurnCount, stats.moderateTurnCount, stats.sharpTurnCount)}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
        <StatTile
          label="Stop & Go"
          value={`${stopAndGoCount} event${stopAndGoCount === 1 ? '' : 's'}`}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
      </View>

      {speedLimitDetectionEnabled && (
        <>
          <Text style={styles.subtitle}>Speeding</Text>
          <View style={styles.stackGrid}>
            <StatTile
              label="Light"
              value={`${formatEpisodeCount(stats.lightSpeedingEpisodeCount)} • ${formatSeconds(stats.lightSpeedingSeconds)}`}
              variant="compact"
              allowValueWrap={true}
              style={styles.tileFull}
            />
            <StatTile
              label="Moderate"
              value={`${formatEpisodeCount(stats.moderateSpeedingEpisodeCount)} • ${formatSeconds(stats.moderateSpeedingSeconds)}`}
              variant="compact"
              allowValueWrap={true}
              style={styles.tileFull}
            />
            <StatTile
              label="Harsh"
              value={`${formatEpisodeCount(stats.harshSpeedingEpisodeCount)} • ${formatSeconds(stats.harshSpeedingSeconds)}`}
              variant="compact"
              allowValueWrap={true}
              style={styles.tileFull}
            />
          </View>
        </>
      )}

      <Text style={styles.subtitle}>Speed Oscillation</Text>
      <View style={styles.stackGrid}>
        <StatTile
          label="Light"
          value={`${formatEpisodeCount(lightOscillationEpisodeCount)} • ${formatSeconds(lightOscillationSeconds)}`}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
        <StatTile
          label="Moderate"
          value={`${formatEpisodeCount(moderateOscillationEpisodeCount)} • ${formatSeconds(moderateOscillationSeconds)}`}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
        <StatTile
          label="Harsh"
          value={`${formatEpisodeCount(harshOscillationEpisodeCount)} • ${formatSeconds(harshOscillationSeconds)}`}
          variant="compact"
          allowValueWrap={true}
          style={styles.tileFull}
        />
      </View>
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
    tileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    stackGrid: {
      gap: theme.spacing.sm,
    },
    tileHalf: {
      width: '48%',
    },
    tileFull: {
      width: '100%',
    },
  });
