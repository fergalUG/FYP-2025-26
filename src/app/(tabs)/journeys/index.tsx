import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { theme } from '@theme';
import { useJourneys } from '@hooks';
import { useState } from 'react';
import * as JourneyService from '@services/JourneyService';

export default function Journeys() {
  const { journeys, loading, error, refetch } = useJourneys();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleExportDatabase = async () => {
    setExporting(true);
    await JourneyService.exportDatabase();
    setExporting(false);
  };

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
        <Pressable style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerButtonsRow}>
        <Pressable
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExportDatabase}
          disabled={exporting}
        >
          <Text style={styles.exportButtonText}>{exporting ? 'Exporting...' : 'Export DB'}</Text>
        </Pressable>
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={journeys}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Link href={{ pathname: `/journeys/${item.id}` }} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.distanceKm} km · {item.date}
              </Text>
            </Pressable>
          </Link>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerButtonsRow: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  exportButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
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
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  title: { fontWeight: '700', fontSize: 16, color: theme.colors.onSurface },
  meta: { marginTop: 4, color: theme.colors.onSurface, opacity: 0.7 },
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
