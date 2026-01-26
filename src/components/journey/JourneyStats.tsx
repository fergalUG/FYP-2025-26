import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '@hooks';
import { Journey, Event, EventType } from '@types';
import { getScoreColor } from '@utils/score';

interface JourneyStatsProps {
  journey: Journey;
  events: Event[];
}

interface StatItemProps {
  label: string;
  value: string;
  color?: string;
}

interface StatItemInnerProps extends StatItemProps {
  styles: ReturnType<typeof createStyles>;
}

const StatItem = (props: StatItemInnerProps) => {
  const { label, value, color, styles } = props;
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </View>
  );
};

export const JourneyStats = (props: JourneyStatsProps) => {
  const { theme } = useTheme();
  const { journey, events } = props;
  const durationMs = (journey.endTime ?? journey.startTime) - journey.startTime;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationHours = Math.floor(durationMinutes / 60);
  const remainingMinutes = durationMinutes % 60;

  const durationText = durationHours > 0 ? `${durationHours}h ${remainingMinutes}m` : `${durationMinutes}m`;

  const speeds = events.filter((event) => event.speed > 0).map((event) => event.speed);
  const avgSpeed = speeds.length > 0 ? (speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length).toFixed(1) : '0.0';
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds).toFixed(1) : '0.0';

  const negativeEvents = events.filter((event) =>
    [
      EventType.HarshAcceleration,
      EventType.HarshBraking,
      EventType.SharpTurn,
      EventType.ModerateSpeeding,
      EventType.HarshSpeeding,
    ].includes(event.type)
  );

  const eventCounts = negativeEvents.reduce(
    (acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Journey Statistics</Text>

      <View style={styles.statsGrid}>
        <StatItem
          styles={styles}
          label="Score"
          value={`${Math.round(journey.score ?? 0)}/100`}
          color={getScoreColor(journey.score ?? 0, theme)}
        />
        <StatItem styles={styles} label="Distance" value={`${Math.round((journey.distanceKm ?? 0) * 100) / 100} km`} />
        <StatItem styles={styles} label="Duration" value={durationText} />
        <StatItem styles={styles} label="Avg Speed" value={`${avgSpeed} km/h`} />
        <StatItem styles={styles} label="Max Speed" value={`${maxSpeed} km/h`} />
      </View>

      {Object.keys(eventCounts).length > 0 && (
        <>
          <Text style={styles.subtitle}>Event Summary</Text>
          <View style={styles.eventsGrid}>
            {Object.entries(eventCounts).map(([eventType, count]) => (
              <StatItem styles={styles} key={eventType} label={eventType.replace(/_/g, ' ').toUpperCase()} value={`${count}`} />
            ))}
          </View>
        </>
      )}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.onBackground,
      marginBottom: theme.spacing.md,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onBackground,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    eventsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    statItem: {
      width: '48%',
      marginBottom: theme.spacing.md,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
      textAlign: 'center',
      textTransform: 'uppercase',
      fontWeight: '500',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onBackground,
      textAlign: 'center',
    },
  });
