import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp, type DimensionValue } from 'react-native';
import MapView, { type MapPressEvent } from 'react-native-maps';

import type { Event, HotspotMarker } from '@types';
import { useAppSettings, useTheme } from '@hooks';
import {
  buildJourneyMapData,
  buildMapRegion,
  buildPinDetails,
  findSelectedPinById,
  JourneyMapLegend,
  JourneyMapMarkers,
  JourneyMapPinDetailsCard,
} from '@components/journey/map';

interface JourneyMapProps {
  events: Event[];
  hotspotMarkers?: HotspotMarker[];
  height?: DimensionValue;
  interactive?: boolean;
  showLegend?: boolean;
  showHotspots?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const JourneyMap = (props: JourneyMapProps) => {
  const { events, hotspotMarkers = [], height = 300, interactive = true, showLegend = true, showHotspots = true, style } = props;
  const { theme } = useTheme();
  const { settings } = useAppSettings();
  const styles = createStyles(theme);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const visibleHotspots = useMemo(() => (showHotspots ? hotspotMarkers : []), [hotspotMarkers, showHotspots]);
  const data = useMemo(() => buildJourneyMapData(events, { hotspotMarkers: visibleHotspots }), [events, visibleHotspots]);
  const selectedPin = useMemo(() => findSelectedPinById(data, selectedPinId), [data, selectedPinId]);

  useEffect(() => {
    if (selectedPinId && !selectedPin) {
      setSelectedPinId(null);
    }
  }, [selectedPin, selectedPinId]);

  const selectedPinDetails = useMemo(() => {
    return selectedPin ? buildPinDetails(selectedPin, { showDebugMetadata: settings.mapMarkerDebugMetadataEnabled }) : null;
  }, [selectedPin, settings.mapMarkerDebugMetadataEnabled]);

  const region = useMemo(() => buildMapRegion(data.routeCoordinates), [data.routeCoordinates]);

  const handleSelectPin = useCallback((pinId: string) => {
    setSelectedPinId(pinId);
  }, []);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (!interactive) {
        return;
      }

      if (event.nativeEvent.action === 'marker-press') {
        return;
      }

      setSelectedPinId(null);
    },
    [interactive]
  );

  if (events.length === 0) {
    return (
      <View style={[styles.container, { height }, style]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No route data available</Text>
        </View>
      </View>
    );
  }

  if (data.routeCoordinates.length === 0 || !region) {
    return (
      <View style={[styles.container, { height }, style]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No valid GPS coordinates</Text>
        </View>
      </View>
    );
  }

  const startPoint = data.routePoints[0];
  const endPoint = data.routePoints[data.routePoints.length - 1];

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
        onPress={handleMapPress}
      >
        <JourneyMapMarkers
          routeCoordinates={data.routeCoordinates}
          speedingSegments={data.speedingSegments}
          oscillationSegments={data.oscillationSegments}
          incidentMarkers={data.incidentMarkers}
          hotspotMarkers={data.hotspotMarkers}
          speedingEpisodeMarkers={data.speedingEpisodeMarkers}
          oscillationEpisodeMarkers={data.oscillationEpisodeMarkers}
          startPoint={startPoint}
          endPoint={endPoint}
          interactive={interactive}
          selectedPinId={selectedPinId}
          onSelectPin={handleSelectPin}
        />
      </MapView>

      <JourneyMapPinDetailsCard interactive={interactive} details={selectedPinDetails} selectedPinId={selectedPinId} />
      <JourneyMapLegend showLegend={showLegend} hasLegendContent={data.hasLegendContent} legendFlags={data.legendFlags} />
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
  });
