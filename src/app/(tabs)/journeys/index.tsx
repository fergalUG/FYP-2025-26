import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../../../theme';
import { useJourneys } from '../../../hooks';

export default function Journeys() {
  const { journeys, loading, error, refetch } = useJourneys();

  if (loading) {
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

  if (journeys.length === 0) {
    return (
      <View style={[styles.list, styles.centerContent]}>
        <Text style={styles.emptyText}>No journeys yet</Text>
        <Text style={styles.emptySubtext}>Your driving sessions will appear here</Text>
      </View>
    );
  }

  return (
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
    />
  );
}

const styles = StyleSheet.create({
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
    color: '#ffffff',
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
