import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { theme } from '../theme';
import { Event } from '../types';

interface JourneyMapProps {
  events: Event[];
  height?: number;
}

export const JourneyMap: React.FC<JourneyMapProps> = ({ events, height = 300 }) => {
  if (events.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No route data available</Text>
        </View>
      </View>
    );
  }

  const startPoint = events[0];
  const endPoint = events[events.length - 1];

  const routeCoordinates = events
    .filter((event) => event.latitude && event.longitude)
    .map((event) => ({
      latitude: event.latitude,
      longitude: event.longitude,
    }));

  if (routeCoordinates.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No valid GPS coordinates</Text>
        </View>
      </View>
    );
  }

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
    latitude: midLat || 53.3498,
    longitude: midLng || -6.2603,
    latitudeDelta: Math.max(deltaLat, 0.01),
    longitudeDelta: Math.max(deltaLng, 0.01),
  };

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={styles.map}
        initialRegion={region}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onMapReady={() => console.log('Map is ready')}
        onRegionChange={() => console.log('Region changed')}
      >
        {routeCoordinates.length > 1 && (
          <Polyline coordinates={routeCoordinates} strokeColor={theme.colors.primary} strokeWidth={4} lineCap="round" lineJoin="round" />
        )}

        <Marker
          coordinate={{
            latitude: startPoint.latitude,
            longitude: startPoint.longitude,
          }}
          title="Start"
          description="Journey started here"
          pinColor="green"
        />

        {startPoint.id !== endPoint.id && (
          <Marker
            coordinate={{
              latitude: endPoint.latitude,
              longitude: endPoint.longitude,
            }}
            title="End"
            description="Journey ended here"
            pinColor="red"
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  map: {
    flex: 1,
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
