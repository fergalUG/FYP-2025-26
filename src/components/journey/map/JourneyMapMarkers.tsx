import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';

import { useTheme } from '@hooks/useTheme';
import { EventType, type Event, type HotspotMarker } from '@types';

import { getIncidentLabel, getIncidentMarkerSize, formatSeverityLabel } from '@components/journey/map/model';
import type {
  IncidentMarker,
  OscillationEpisodeMarker,
  OscillationSegment,
  RoutePoint,
  SpeedingEpisodeMarker,
  SpeedingSegment,
} from '@components/journey/map/types';

interface JourneyMapMarkersProps {
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  speedingSegments: SpeedingSegment[];
  oscillationSegments: OscillationSegment[];
  incidentMarkers: IncidentMarker[];
  hotspotMarkers: HotspotMarker[];
  speedingEpisodeMarkers: SpeedingEpisodeMarker[];
  oscillationEpisodeMarkers: OscillationEpisodeMarker[];
  startPoint: RoutePoint | undefined;
  endPoint: RoutePoint | undefined;
  interactive: boolean;
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
}

const selectPin = (interactive: boolean, onSelectPin: (pinId: string) => void, pinId: string): void => {
  if (interactive) {
    onSelectPin(pinId);
  }
};

const getIncidentColor = (event: Event, theme: ReturnType<typeof useTheme>['theme']): string => {
  if (event.type === EventType.StopAndGo) return theme.colors.event.stopAndGo;
  if (event.family === 'braking') return theme.colors.event.brake;
  if (event.family === 'acceleration') return theme.colors.event.accel;
  return theme.colors.event.corner;
};

const getSpeedingColor = (severity: SpeedingSegment['severity'], theme: ReturnType<typeof useTheme>['theme']): string => {
  if (severity === 'harsh') return theme.colors.event.harshSpeeding;
  if (severity === 'moderate') return theme.colors.event.moderateSpeeding;
  return theme.colors.event.lightSpeeding;
};

const getOscillationColor = (severity: OscillationSegment['severity'], theme: ReturnType<typeof useTheme>['theme']): string => {
  if (severity === 'harsh') return theme.colors.event.harshOscillation;
  if (severity === 'moderate') return theme.colors.event.moderateOscillation;
  return theme.colors.event.lightOscillation;
};

const getHotspotMarkerSize = (count: number): number => {
  return Math.max(22, Math.min(34, 20 + count * 2));
};

export const JourneyMapMarkers = (props: JourneyMapMarkersProps) => {
  const { theme } = useTheme();
  const {
    routeCoordinates,
    speedingSegments,
    oscillationSegments,
    incidentMarkers,
    hotspotMarkers,
    speedingEpisodeMarkers,
    oscillationEpisodeMarkers,
    startPoint,
    endPoint,
    interactive,
    selectedPinId,
    onSelectPin,
  } = props;
  const styles = createStyles(theme);

  return (
    <>
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

      {oscillationSegments.map((segment) => (
        <Polyline
          key={segment.id}
          coordinates={segment.coordinates}
          strokeColor={getOscillationColor(segment.severity, theme)}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
      ))}

      {hotspotMarkers.map((marker) => {
        const selected = selectedPinId === marker.id;
        const markerSize = getHotspotMarkerSize(marker.count);
        return (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title="Historical hotspot"
            description={`${marker.count} repeated events`}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            stopPropagation
            onPress={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
            onSelect={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
          >
            <View
              style={[
                styles.hotspotMarker,
                {
                  width: markerSize,
                  height: markerSize,
                  borderRadius: markerSize / 2,
                  borderColor: selected ? theme.colors.onSurface : theme.colors.warning,
                },
              ]}
            >
              <View style={[styles.hotspotMarkerCore, { backgroundColor: theme.colors.warning }]}>
                <Text style={[styles.hotspotCountText, { color: theme.colors.onBackground }]}>{marker.count}</Text>
              </View>
            </View>
          </Marker>
        );
      })}

      {incidentMarkers.map((marker) => {
        const markerSize = getIncidentMarkerSize(marker.event.type, marker.severity);
        const selected = selectedPinId === marker.id;
        return (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={getIncidentLabel(marker.event)}
            description={marker.event.type === EventType.StopAndGo ? 'Traffic wave event' : 'Driving incident'}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            stopPropagation
            onPress={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
            onSelect={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
          >
            <View
              style={[
                styles.incidentMarker,
                {
                  backgroundColor: getIncidentColor(marker.event, theme),
                  width: markerSize,
                  height: markerSize,
                  borderRadius: markerSize / 2,
                  borderColor: selected ? theme.colors.onSurface : theme.colors.surface,
                  borderWidth: selected ? 2.5 : 1.5,
                },
              ]}
            />
          </Marker>
        );
      })}

      {speedingEpisodeMarkers.map((marker) => {
        const selected = selectedPinId === marker.id;
        return (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={`${formatSeverityLabel(marker.severity)} speeding`}
            description="Speeding episode"
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            stopPropagation
            onPress={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
            onSelect={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
          >
            <View
              style={[
                styles.speedingEpisodeMarker,
                {
                  backgroundColor: getSpeedingColor(marker.severity, theme),
                  borderColor: selected ? theme.colors.onSurface : theme.colors.surface,
                  borderWidth: selected ? 2.5 : 1.5,
                },
              ]}
            >
              <View style={[styles.speedingEpisodeMarkerCore, { backgroundColor: theme.colors.surface }]} />
            </View>
          </Marker>
        );
      })}

      {oscillationEpisodeMarkers.map((marker) => {
        const selected = selectedPinId === marker.id;
        const oscillationColor = getOscillationColor(marker.severity, theme);
        return (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={`${formatSeverityLabel(marker.severity)} oscillation`}
            description="Oscillation episode"
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            stopPropagation
            onPress={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
            onSelect={() => {
              selectPin(interactive, onSelectPin, marker.id);
            }}
          >
            <View
              style={[
                styles.oscillationEpisodeMarker,
                {
                  borderColor: selected ? theme.colors.onSurface : oscillationColor,
                  borderWidth: selected ? 2.5 : 2,
                },
              ]}
            >
              <View style={[styles.oscillationEpisodeMarkerCore, { backgroundColor: oscillationColor }]} />
            </View>
          </Marker>
        );
      })}

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
    </>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    incidentMarker: {
      borderWidth: 1.5,
      borderColor: theme.colors.surface,
    },
    hotspotMarker: {
      borderWidth: 2,
      backgroundColor: `${theme.colors.warning}33`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hotspotMarkerCore: {
      minWidth: 18,
      height: 18,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    hotspotCountText: {
      fontSize: 10,
      fontWeight: '800',
    },
    speedingEpisodeMarker: {
      width: 18,
      height: 18,
      borderRadius: 4,
      transform: [{ rotate: '45deg' }],
      justifyContent: 'center',
      alignItems: 'center',
    },
    speedingEpisodeMarkerCore: {
      width: 6,
      height: 6,
      borderRadius: 999,
      transform: [{ rotate: '-45deg' }],
    },
    oscillationEpisodeMarker: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    oscillationEpisodeMarkerCore: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
  });
