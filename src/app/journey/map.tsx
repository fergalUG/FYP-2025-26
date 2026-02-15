import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { JourneyMap } from '@components';
import { useJourneyWithEvents, useTheme } from '@hooks';

export default function JourneyMapScreen() {
  const { journeyId, showLegend: showLegendParam } = useLocalSearchParams<{ journeyId: string; showLegend?: string }>();
  const { events, eventsLoading, eventsError } = useJourneyWithEvents(Number(journeyId));
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
    headerLegendButton: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    headerText: {
      fontWeight: '500',
      fontSize: 16,
      color: theme.colors.onSurface,
      paddingLeft: theme.spacing.xs,
      paddingRight: theme.spacing.xs,
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
