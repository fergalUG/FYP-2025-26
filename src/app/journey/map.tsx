import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { JourneyMap } from '@components';
import { useHotspotCandidateEvents, useJourneyWithEvents, useTheme } from '@hooks';
import { buildJourneyHotspotMarkers } from '@utils/journeyHotspots';

export default function JourneyMapScreen() {
  const {
    journeyId,
    showLegend: showLegendParam,
    showHotspots: showHotspotsParam,
  } = useLocalSearchParams<{
    journeyId: string;
    showLegend?: string;
    showHotspots?: string;
  }>();
  const numericJourneyId = Number(journeyId);
  const { events, eventsLoading, eventsError } = useJourneyWithEvents(numericJourneyId);
  const {
    events: hotspotCandidateEvents,
    loading: hotspotsLoading,
    error: hotspotsError,
  } = useHotspotCandidateEvents(Number.isFinite(numericJourneyId) ? numericJourneyId : undefined);
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const initialShowLegend = useMemo(() => showLegendParam !== '0', [showLegendParam]);
  const initialShowHotspots = useMemo(() => showHotspotsParam !== '0', [showHotspotsParam]);
  const [showLegend, setShowLegend] = useState<boolean>(initialShowLegend);
  const [showHotspots, setShowHotspots] = useState<boolean>(initialShowHotspots);

  const hotspotMarkers = useMemo(
    () =>
      buildJourneyHotspotMarkers({
        routeEvents: events,
        candidateEvents: hotspotCandidateEvents,
        excludedJourneyId: numericJourneyId,
      }),
    [events, hotspotCandidateEvents, numericJourneyId]
  );

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
            <View style={styles.headerActions}>
              <Pressable onPress={() => setShowLegend((prev) => !prev)} style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={styles.headerText}>{showLegend ? 'Hide legend' : 'Show legend'}</Text>
              </Pressable>
              <Pressable onPress={() => setShowHotspots((prev) => !prev)} style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={styles.headerText}>{showHotspots ? 'Hide hotspots' : 'Show hotspots'}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        <JourneyMap
          events={events}
          hotspotMarkers={hotspotMarkers}
          height="100%"
          interactive={true}
          showLegend={showLegend}
          showHotspots={showHotspots}
        />
        {hotspotsLoading ? <Text style={styles.overlayText}>Loading historical hotspots...</Text> : null}
        {hotspotsError ? <Text style={styles.overlayErrorText}>Hotspots unavailable: {hotspotsError}</Text> : null}
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
    headerActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
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
    overlayText: {
      position: 'absolute',
      left: theme.spacing.md,
      bottom: theme.spacing.md,
      fontSize: 12,
      color: theme.colors.onSurface,
      backgroundColor: `${theme.colors.surface}F2`,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    overlayErrorText: {
      position: 'absolute',
      left: theme.spacing.md,
      bottom: theme.spacing.md,
      fontSize: 12,
      color: theme.colors.error,
      backgroundColor: `${theme.colors.surface}F2`,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
  });
