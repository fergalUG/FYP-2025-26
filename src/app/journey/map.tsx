import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { JourneyMap } from '@components';
import { useJourneyWithEvents, useTheme } from '@hooks';

export default function JourneyMapScreen() {
  const { journeyId, showLegend: showLegendParam } = useLocalSearchParams<{ journeyId: string; showLegend?: string }>();
  const numericJourneyId = Number(journeyId);
  const { events, eventsLoading, eventsError } = useJourneyWithEvents(numericJourneyId);
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const initialShowLegend = useMemo(() => showLegendParam !== '0', [showLegendParam]);
  const [showLegend, setShowLegend] = useState<boolean>(initialShowLegend);

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
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => setShowLegend((prev) => !prev)} style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.headerText}>{showLegend ? 'Hide legend' : 'Show legend'}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <JourneyMap events={events} height="100%" interactive={true} showLegend={showLegend} />
      </View>
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerText: {
      fontWeight: '500',
      fontSize: 14,
      color: theme.colors.onSurface,
      paddingHorizontal: theme.spacing.xs,
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
