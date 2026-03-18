import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks/useTheme';

import type { JourneyMapLegendFlags } from '@components/journey/map/types';

interface JourneyMapLegendProps {
  showLegend: boolean;
  hasLegendContent: boolean;
  legendFlags: JourneyMapLegendFlags;
}

export const JourneyMapLegend = (props: JourneyMapLegendProps) => {
  const { theme } = useTheme();
  const { showLegend, hasLegendContent, legendFlags } = props;
  const styles = createStyles(theme);

  if (!showLegend || !hasLegendContent) {
    return null;
  }

  return (
    <View style={styles.legend} pointerEvents="none">
      {legendFlags.hasLightSpeeding && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.lightSpeeding }]} />
          <Text style={styles.legendText}>Light speeding</Text>
        </View>
      )}
      {legendFlags.hasModerateSpeeding && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.moderateSpeeding }]} />
          <Text style={styles.legendText}>Moderate speeding</Text>
        </View>
      )}
      {legendFlags.hasHarshSpeeding && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.harshSpeeding }]} />
          <Text style={styles.legendText}>Harsh speeding</Text>
        </View>
      )}
      {legendFlags.hasLightOscillation && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.lightOscillation }]} />
          <Text style={styles.legendText}>Light oscillation</Text>
        </View>
      )}
      {legendFlags.hasModerateOscillation && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.moderateOscillation }]} />
          <Text style={styles.legendText}>Moderate oscillation</Text>
        </View>
      )}
      {legendFlags.hasHarshOscillation && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.colors.event.harshOscillation }]} />
          <Text style={styles.legendText}>Harsh oscillation</Text>
        </View>
      )}
      {legendFlags.hasBraking && (
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.brake }]} />
          <Text style={styles.legendText}>Braking</Text>
        </View>
      )}
      {legendFlags.hasAcceleration && (
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.accel }]} />
          <Text style={styles.legendText}>Acceleration</Text>
        </View>
      )}
      {legendFlags.hasCornering && (
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.corner }]} />
          <Text style={styles.legendText}>Cornering</Text>
        </View>
      )}
      {legendFlags.hasStopAndGo && (
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.stopAndGo }]} />
          <Text style={styles.legendText}>Stop & Go</Text>
        </View>
      )}
      {legendFlags.hasHotspots && (
        <View style={styles.legendItem}>
          <View style={styles.legendHotspotWrap}>
            <View style={[styles.legendHotspotCore, { backgroundColor: theme.colors.warning }]} />
          </View>
          <Text style={styles.legendText}>Historical hotspot</Text>
        </View>
      )}
      {legendFlags.hasTieredIncidents && (
        <View style={styles.legendItem}>
          <View style={styles.markerSizeLegend}>
            <View style={[styles.legendDot, styles.legendDotLight]} />
            <View style={[styles.legendDot, styles.legendDotModerate]} />
            <View style={[styles.legendDot, styles.legendDotHarsh]} />
          </View>
          <Text style={styles.legendText}>Event severity</Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    legend: {
      position: 'absolute',
      right: theme.spacing.sm,
      top: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      padding: theme.spacing.sm,
      gap: theme.spacing.xs,
      opacity: 0.9,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    legendSwatch: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    legendLine: {
      width: 18,
      height: 4,
      borderRadius: 2,
    },
    legendHotspotWrap: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: theme.colors.warning,
      backgroundColor: `${theme.colors.warning}33`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legendHotspotCore: {
      width: 7,
      height: 7,
      borderRadius: 999,
    },
    legendText: {
      fontSize: 12,
      color: theme.colors.onSurface,
    },
    legendSpeedingEpisodeMarker: {
      width: 12,
      height: 12,
      borderRadius: 3,
      borderWidth: 1.5,
      transform: [{ rotate: '45deg' }],
      justifyContent: 'center',
      alignItems: 'center',
    },
    legendSpeedingEpisodeMarkerCore: {
      width: 4,
      height: 4,
      borderRadius: 999,
      transform: [{ rotate: '-45deg' }],
    },
    legendOscillationEpisodeMarker: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    legendOscillationEpisodeMarkerCore: {
      width: 4,
      height: 4,
      borderRadius: 999,
    },
    markerSizeLegend: {
      width: 24,
      height: 12,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    legendDot: {
      position: 'absolute',
      backgroundColor: theme.colors.onSurface,
      opacity: 0.8,
      borderRadius: 999,
    },
    legendDotLight: {
      width: 6,
      height: 6,
      top: 3,
      left: 1,
    },
    legendDotModerate: {
      width: 8,
      height: 8,
      top: 2,
      left: 8,
    },
    legendDotHarsh: {
      width: 10,
      height: 10,
      top: 1,
      left: 14,
    },
  });
