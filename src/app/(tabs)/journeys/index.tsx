import { Link } from 'expo-router';
import { FlatList, Text, View, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useJourneys, useTheme } from '@hooks';
import { useMemo, useState } from 'react';

import { IconChip, ScoreBadge, AppButton } from '@components';

import { getScoreColor } from '@utils/score';

export default function Journeys() {
  const { theme } = useTheme();
  const { journeys, loading, error, refetch, deleteJourney } = useJourneys();
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const styles = createStyles(theme);

  const completedJourneys = useMemo(() => journeys.filter((journey) => journey.endTime && journey.distanceKm != null), [journeys]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDeleteJourney = async (journeyId: number) => {
    setDeletingId(journeyId);
    try {
      await deleteJourney(journeyId);
    } finally {
      setDeletingId(null);
    }
  };

  const renderRightActions = (journeyId: number) => (
    <View style={{}}>
      <AppButton
        style={[styles.deleteAction, { height: '100%' }]}
        onPress={() => handleDeleteJourney(journeyId)}
        disabled={deletingId === journeyId}
      >
        {deletingId === journeyId ? (
          <ActivityIndicator size="small" color={theme.colors.background} />
        ) : (
          <MaterialIcons name="delete" size={22} color={theme.colors.background} />
        )}
        <Text style={styles.deleteActionText}>{deletingId === journeyId ? 'Deleting' : 'Delete'}</Text>
      </AppButton>
    </View>
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
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={completedJourneys}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Swipeable renderRightActions={() => renderRightActions(item.id)} overshootRight={false}>
            <Link href={{ pathname: '/journey/[journeyId]', params: { journeyId: item.id } }} asChild>
              <AppButton style={styles.card}>
                <View style={styles.cardTopRow}>
                  <ScoreBadge score={item.score ?? 0} color={getScoreColor(item.score ?? 0, theme)} />
                  <View style={styles.cardBody}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <IconChip icon="schedule" text={item.startTime ? new Date(item.startTime).toLocaleDateString() : 'Time'} />
                      <IconChip icon="route" text={`${(item.distanceKm ?? 0).toFixed(2)} km`} />
                    </View>
                  </View>
                </View>
              </AppButton>
            </Link>
          </Swipeable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No journeys yet</Text>
            <Text style={styles.emptySubtext}>Your driving sessions will appear here</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            titleColor={theme.colors.onSurface}
          />
        }
      />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
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
    card: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.md,
    },
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
