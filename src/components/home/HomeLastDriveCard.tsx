import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Journey } from '@types';

import { useTheme } from '@hooks';
import { getScoreColor } from '@utils/score';
import { IconChip } from '@components/common/IconChip';
import { ScoreBadge } from '@components/common/ScoreBadge';

interface HomeLastDriveCardProps {
  lastJourney: Journey | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPressJourney: (journeyId: number) => void;
}

const formatDurationMinutes = (startTime: number, endTime: number): string => {
  const minutes = Math.max(0, Math.round((endTime - startTime) / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

export const HomeLastDriveCard = (props: HomeLastDriveCardProps) => {
  const { lastJourney, loading, error, onRefresh, onPressJourney } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Last Drive</Text>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Pressable onPress={onRefresh}>
            <Text style={styles.sectionLink}>Refresh</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text style={styles.errorText}>Error loading journeys: {error}</Text> : null}

      {!lastJourney && !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No drives yet</Text>
          <Text style={styles.emptySubtitle}>Once you finish a drive, your score and route will show up here.</Text>
        </View>
      ) : null}

      {lastJourney ? (
        <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => onPressJourney(lastJourney.id)}>
          <View style={styles.topRow}>
            <ScoreBadge score={lastJourney.score ?? 0} color={getScoreColor(lastJourney.score ?? 0, theme)} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>
                {lastJourney.title || 'Journey'}
              </Text>
              <Text style={styles.date}>
                {lastJourney.startTime ? new Date(lastJourney.startTime).toLocaleString() : new Date(lastJourney.date).toLocaleDateString()}
              </Text>
              <View style={styles.metaRow}>
                <IconChip icon="route" text={`${(lastJourney.distanceKm ?? 0).toFixed(1)} km`} />
                <IconChip
                  icon="schedule"
                  text={
                    lastJourney.startTime && lastJourney.endTime ? formatDurationMinutes(lastJourney.startTime, lastJourney.endTime) : '—'
                  }
                />
              </View>
            </View>
          </View>
        </Pressable>
      ) : null}
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    sectionLink: {
      color: theme.colors.primary,
      fontWeight: '700',
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.error,
    },
    emptyState: {
      paddingVertical: theme.spacing.md,
      gap: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    card: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    cardPressed: {
      opacity: 0.9,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    body: {
      flex: 1,
      gap: 6,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    date: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
  });
