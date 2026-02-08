import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { useTheme } from '@hooks';
import type { Event } from '@types';
import { EventType } from '@types';
import { DEFAULT_EFFICIENCY_SCORING_CONFIG } from '@utils/scoring/efficiencyScoringConfig';
import { normalizeJourneyEvents } from '@utils/scoring/normalizeEvents';

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface SpeedingSegment {
  id: string;
  severity: 'moderate' | 'harsh';
  coordinates: Array<{ latitude: number; longitude: number }>;
}

const isValidCoordinate = (latitude: number, longitude: number): boolean => {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
};

const isRouteEventType = (type: EventType): boolean => {
  return type === EventType.LocationUpdate || type === EventType.JourneyStart || type === EventType.JourneyEnd;
};

const isIncidentType = (type: EventType): boolean => {
  return (
    type === EventType.HarshBraking || type === EventType.HarshAcceleration || type === EventType.SharpTurn || type === EventType.StopAndGo
  );
};

const getIncidentLabel = (type: EventType): string => {
  if (type === EventType.HarshBraking) return 'Harsh Brake';
  if (type === EventType.HarshAcceleration) return 'Harsh Accel';
  if (type === EventType.StopAndGo) return 'Stop & Go';
  return 'Sharp Turn';
};

const getIncidentColor = (type: EventType, theme: ReturnType<typeof useTheme>['theme']): string => {
  if (type === EventType.HarshBraking) return theme.colors.event.brake;
  if (type === EventType.HarshAcceleration) return theme.colors.event.accel;
  if (type === EventType.StopAndGo) return theme.colors.event.stopAndGo;
  return theme.colors.event.corner;
};

const getSpeedingColor = (severity: SpeedingSegment['severity'], theme: ReturnType<typeof useTheme>['theme']): string => {
  return severity === 'harsh' ? theme.colors.event.harshSpeeding : theme.colors.event.moderateSpeeding;
};

const findClosestIndex = (points: RoutePoint[], timestamp: number): number => {
  if (points.length === 0) {
    return 0;
  }

  // binary search instead of relying on typescript...
  let left = 0;
  let right = points.length - 1;
  let closestIndex = 0;
  let closestDiff = Number.POSITIVE_INFINITY;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midTimestamp = points[mid].timestamp;
    const diff = Math.abs(midTimestamp - timestamp);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = mid;
    }

    if (midTimestamp < timestamp) {
      left = mid + 1;
    } else if (midTimestamp > timestamp) {
      right = mid - 1;
    } else {
      return mid;
    }
  }

  return closestIndex;
};

const buildSpeedingSegment = (points: RoutePoint[], startTimestamp: number, endTimestamp: number): RoutePoint[] => {
  if (points.length < 2) {
    return [];
  }

  const startIndex = findClosestIndex(points, startTimestamp);
  const endIndex = findClosestIndex(points, endTimestamp);
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);

  return points.slice(from, to + 1);
};

interface JourneyMapProps {
  events: Event[];
  height?: DimensionValue;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const JourneyMap = (props: JourneyMapProps) => {
  const { theme } = useTheme();
  const { events, height = 300, interactive = true, style } = props;
  const styles = createStyles(theme);

  const routePoints = useMemo<RoutePoint[]>(() => {
    return events
      .filter((event) => isRouteEventType(event.type))
      .filter((event) => isValidCoordinate(event.latitude, event.longitude))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((event) => ({
        latitude: event.latitude,
        longitude: event.longitude,
        timestamp: event.timestamp,
      }));
  }, [events]);

  const routeCoordinates = useMemo(() => {
    return routePoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  }, [routePoints]);

  const incidentMarkers = useMemo(() => {
    return events
      .filter((event) => isIncidentType(event.type))
      .filter((event) => isValidCoordinate(event.latitude, event.longitude))
      .map((event) => ({
        id: event.id,
        type: event.type,
        latitude: event.latitude,
        longitude: event.longitude,
      }));
  }, [events]);

  const speedingSegments = useMemo<SpeedingSegment[]>(() => {
    if (routePoints.length < 2) {
      return [];
    }

    const normalized = normalizeJourneyEvents(events, DEFAULT_EFFICIENCY_SCORING_CONFIG);
    return normalized.speedingEpisodes
      .map((episode, index) => {
        const segmentPoints = buildSpeedingSegment(routePoints, episode.startTimestamp, episode.endTimestamp);
        if (segmentPoints.length < 2) {
          return null;
        }
        return {
          id: `${episode.startTimestamp}-${index}`,
          severity: episode.severity,
          coordinates: segmentPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
        };
      })
      .filter((segment): segment is SpeedingSegment => Boolean(segment));
  }, [events, routePoints]);

  const hasModerateSpeeding = speedingSegments.some((segment) => segment.severity === 'moderate');
  const hasHarshSpeeding = speedingSegments.some((segment) => segment.severity === 'harsh');
  const hasHarshBraking = incidentMarkers.some((marker) => marker.type === EventType.HarshBraking);
  const hasHarshAcceleration = incidentMarkers.some((marker) => marker.type === EventType.HarshAcceleration);
  const hasSharpTurn = incidentMarkers.some((marker) => marker.type === EventType.SharpTurn);
  const hasStopAndGo = incidentMarkers.some((marker) => marker.type === EventType.StopAndGo);

  if (events.length === 0) {
    return (
      <View style={[styles.container, { height }, style]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No route data available</Text>
        </View>
      </View>
    );
  }

  if (routeCoordinates.length === 0) {
    return (
      <View style={[styles.container, { height }, style]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No valid GPS coordinates</Text>
        </View>
      </View>
    );
  }

  const startPoint = routePoints[0];
  const endPoint = routePoints[routePoints.length - 1];

  const latitudes = routeCoordinates.map((coord) => coord.latitude);
  const longitudes = routeCoordinates.map((coord) => coord.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const deltaLat = Math.abs(maxLat - minLat) * 1.2;
  const deltaLng = Math.abs(maxLng - minLng) * 1.2;

  const region = {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: Math.max(deltaLat, 0.01),
    longitudeDelta: Math.max(deltaLng, 0.01),
  };

  return (
    <View style={[{ height }, styles.container, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapView
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
      >
        {routeCoordinates.length > 1 && (
          <Polyline coordinates={routeCoordinates} strokeColor={theme.colors.primary} strokeWidth={4} lineCap="round" lineJoin="round" />
        )}

        {speedingSegments.map((segment) => (
          <Polyline
            key={segment.id}
            coordinates={segment.coordinates}
            strokeColor={getSpeedingColor(segment.severity, theme)}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {incidentMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={getIncidentLabel(marker.type)}
            pinColor={getIncidentColor(marker.type, theme)}
          />
        ))}

        {startPoint && (
          <Marker
            coordinate={{
              latitude: startPoint.latitude,
              longitude: startPoint.longitude,
            }}
            title="Start"
            description="Journey started here"
            pinColor={theme.colors.event.start}
          />
        )}

        {startPoint && endPoint && startPoint.timestamp !== endPoint.timestamp && (
          <Marker
            coordinate={{
              latitude: endPoint.latitude,
              longitude: endPoint.longitude,
            }}
            title="End"
            description="Journey ended here"
            pinColor={theme.colors.event.end}
          />
        )}
      </MapView>

      {(incidentMarkers.length > 0 || speedingSegments.length > 0) && (
        <View style={styles.legend} pointerEvents="none">
          {hasModerateSpeeding && (
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: theme.colors.event.moderateSpeeding }]} />
              <Text style={styles.legendText}>Speeding</Text>
            </View>
          )}
          {hasHarshSpeeding && (
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: theme.colors.event.harshSpeeding }]} />
              <Text style={styles.legendText}>Harsh speeding</Text>
            </View>
          )}
          {hasHarshBraking && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.brake }]} />
              <Text style={styles.legendText}>Harsh brake</Text>
            </View>
          )}
          {hasHarshAcceleration && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.accel }]} />
              <Text style={styles.legendText}>Harsh accel</Text>
            </View>
          )}
          {hasSharpTurn && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.corner }]} />
              <Text style={styles.legendText}>Sharp turn</Text>
            </View>
          )}
          {hasStopAndGo && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.colors.event.stopAndGo }]} />
              <Text style={styles.legendText}>Stop & go</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      borderRadius: theme.radius.lg,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
      width: '100%',
    },
    map: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    placeholderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    placeholderText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
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
    legendText: {
      fontSize: 12,
      color: theme.colors.onSurface,
    },
  });
