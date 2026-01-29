import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { JourneyMap } from '@components';
import { useJourneyWithEvents, useTheme } from '@hooks';

export default function JourneyMapScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const { events, eventsLoading, eventsError } = useJourneyWithEvents(Number(journeyId));
  const { theme } = useTheme();
  const styles = createStyles(theme);

  if (eventsLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (eventsError) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Error loading map: {eventsError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <JourneyMap events={events} height="100%" interactive={true} />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 16,
    },
  });
