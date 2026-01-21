import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { theme } from '../../../theme';
import { Journey } from '../../../types/types';
import { useJourneys } from '../../../hooks/useJourney';

export default function Journeys() {
  const journeysData: Journey[] = useJourneys();

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={journeysData}
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
  list: { padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.background },
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
});
