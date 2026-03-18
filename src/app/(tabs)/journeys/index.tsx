import { Link } from 'expo-router';
import { FlatList, Text, View, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useJourneys, useTheme } from '@hooks';
import { memo, useCallback, useMemo, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import type { Journey } from '@/types/db';

import { IconChip, ScoreBadge, AppButton } from '@components';

import { withLoadingState } from '@utils/async';
import { getScoreColor } from '@utils/score';
import { createScreenStyle, createSurfaceCardStyle } from '@utils/themeStyles';
import { SafeAreaView } from 'react-native-safe-area-context';

type JourneysStyles = ReturnType<typeof createStyles>;

interface JourneyListItemProps {
  actionForegroundColor: string;
  isDeleting: boolean;
  journey: Journey;
  onDeleteJourney: (journeyId: number) => void;
  scoreColor: string;
  styles: JourneysStyles;
}

const JourneyListItem = memo(
  ({ actionForegroundColor, isDeleting, journey, onDeleteJourney, scoreColor, styles }: JourneyListItemProps) => {
    const journeyDate = useMemo(() => (journey.startTime ? new Date(journey.startTime).toLocaleDateString() : 'Time'), [journey.startTime]);
    const journeyDistance = useMemo(() => `${(journey.distanceKm ?? 0).toFixed(2)} km`, [journey.distanceKm]);
    const deleteLabel = isDeleting ? 'Deleting' : 'Delete';

    const handleDeletePress = useCallback(() => {
      onDeleteJourney(journey.id);
    }, [journey.id, onDeleteJourney]);

    const renderRightActions = useCallback(
      () => (
        <View>
          <AppButton style={styles.deleteAction} onPress={handleDeletePress} disabled={isDeleting}>
            {isDeleting ? (
              <ActivityIndicator size="small" color={actionForegroundColor} />
            ) : (
              <MaterialIcons name="delete" size={22} color={actionForegroundColor} />
            )}
            <Text style={styles.deleteActionText}>{deleteLabel}</Text>
          </AppButton>
        </View>
      ),
      [actionForegroundColor, deleteLabel, handleDeletePress, isDeleting, styles.deleteAction, styles.deleteActionText]
    );

    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <Link href={{ pathname: '/journey/[journeyId]', params: { journeyId: journey.id } }} asChild>
          <AppButton style={styles.card}>
            <View style={styles.cardTopRow}>
              <ScoreBadge score={journey.score ?? 0} color={scoreColor} />
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={2}>
                  {journey.title}
                </Text>
                <View style={styles.metaRow}>
                  <IconChip icon="calendar-month" text={journeyDate} />
                  <IconChip icon="route" text={journeyDistance} />
                </View>
              </View>
            </View>
          </AppButton>
        </Link>
      </Swipeable>
    );
  },
  (prev, next) =>
    prev.actionForegroundColor === next.actionForegroundColor &&
    prev.isDeleting === next.isDeleting &&
    prev.journey === next.journey &&
    prev.scoreColor === next.scoreColor &&
    prev.styles === next.styles
);

export default function Journeys() {
  const { theme } = useTheme();
  const { journeys, loading, error, refetch, deleteJourney } = useJourneys();
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const actionForegroundColor = theme.colors.background;

  const completedJourneys = useMemo(() => journeys.filter((journey) => journey.endTime && journey.distanceKm != null), [journeys]);

  const handleRefresh = useCallback(async () => {
    await withLoadingState(refetch, setRefreshing);
  }, [refetch]);

  const handleDeleteJourney = useCallback(
    async (journeyId: number) => {
      setDeletingId(journeyId);
      try {
        await deleteJourney(journeyId);
      } finally {
        setDeletingId(null);
      }
    },
    [deleteJourney]
  );

  const keyExtractor = useCallback((item: Journey) => item.id.toString(), []);

  const renderItem = useCallback<ListRenderItem<Journey>>(
    ({ item }) => (
      <JourneyListItem
        actionForegroundColor={actionForegroundColor}
        isDeleting={deletingId === item.id}
        journey={item}
        onDeleteJourney={handleDeleteJourney}
        scoreColor={getScoreColor(item.score ?? 0, theme)}
        styles={styles}
      />
    ),
    [actionForegroundColor, deletingId, handleDeleteJourney, styles, theme]
  );

  const renderItemSeparator = useCallback(() => <View style={styles.separator} />, [styles.separator]);

  const listEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No journeys yet</Text>
        <Text style={styles.emptySubtext}>Your driving sessions will appear here</Text>
      </View>
    ),
    [styles.emptyContainer, styles.emptySubtext, styles.emptyText]
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={theme.colors.primary}
        titleColor={theme.colors.onSurface}
      />
    ),
    [handleRefresh, refreshing, theme.colors.onSurface, theme.colors.primary]
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.list, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading journeys...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.list, styles.centerContent]}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <AppButton style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </AppButton>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={completedJourneys}
        extraData={deletingId}
        initialNumToRender={8}
        ItemSeparatorComponent={renderItemSeparator}
        keyExtractor={keyExtractor}
        ListEmptyComponent={listEmptyComponent}
        maxToRenderPerBatch={8}
        refreshControl={refreshControl}
        renderItem={renderItem}
        windowSize={9}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: createScreenStyle(theme),
    list: {
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      flexGrow: 1,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: createSurfaceCardStyle(theme, { gap: 'md' }),
    cardTopRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      alignItems: 'center',
    },
    cardBody: {
      flex: 1,
      gap: 6,
    },
    metaRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    deleteAction: {
      backgroundColor: theme.colors.error,
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing.lg,
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.xs,
      height: '100%',
      marginVertical: 0,
    },
    deleteActionPressed: {
      opacity: 0.85,
    },
    deleteActionText: {
      color: theme.colors.background,
      fontWeight: '600',
    },
    title: { fontWeight: '700', fontSize: 16, color: theme.colors.onSurface },
    meta: { color: theme.colors.onSurface, opacity: 0.7 },
    separator: { height: theme.spacing.md },
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
      marginBottom: theme.spacing.md,
    },
    retryButton: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
    },
    retryButtonText: {
      color: theme.colors.background,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.colors.onSurface,
      opacity: 0.7,
      textAlign: 'center',
    },
  });
