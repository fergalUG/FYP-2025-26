import type { Event, EventSeverity } from '@types';
import { EventType } from '@types';
import { DEFAULT_EFFICIENCY_SCORING_CONFIG } from '@utils/scoring/efficiencyScoringConfig';
import { normalizeJourneyEvents } from '@utils/scoring/normalizeEvents';

import type {
  IncidentMarker,
  JourneyMapDerivedData,
  JourneyMapLegendFlags,
  OscillationEpisodeMarker,
  OscillationSegment,
  PinDetailRow,
  PinDetails,
  RoutePoint,
  SelectablePin,
  SpeedingEpisodeMarker,
  SpeedingSegment,
} from '@components/journey/map/types';

interface JourneyMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const isValidCoordinate = (latitude: number, longitude: number): boolean => {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
};

const isValidTimestamp = (timestamp: number): boolean => {
  return Number.isFinite(timestamp) && timestamp > 0;
};

const isRouteEventType = (type: EventType): boolean => {
  return type === EventType.LocationUpdate || type === EventType.JourneyStart || type === EventType.JourneyEnd;
};

const isTieredSeverity = (value: unknown): value is 'light' | 'moderate' | 'harsh' => {
  return value === 'light' || value === 'moderate' || value === 'harsh';
};

export const formatSeverityLabel = (severity: EventSeverity): string => {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
};

const resolveEventFamily = (event: Event): 'braking' | 'acceleration' | 'cornering' | 'speeding' | null => {
  if (event.type === EventType.DrivingEvent) {
    if (event.family === 'braking' || event.family === 'acceleration' || event.family === 'cornering' || event.family === 'speeding') {
      return event.family;
    }
  }
  return null;
};

const isIncidentType = (event: Event): boolean => {
  if (event.type === EventType.StopAndGo) {
    return true;
  }
  const family = resolveEventFamily(event);
  return family === 'braking' || family === 'acceleration' || family === 'cornering';
};

export const getIncidentLabel = (event: Event): string => {
  if (event.type === EventType.StopAndGo) return 'Stop & Go';

  const family = resolveEventFamily(event);
  const severityPrefix =
    event.severity === 'light' ? 'Light ' : event.severity === 'moderate' ? 'Moderate ' : event.severity === 'harsh' ? 'Harsh ' : '';

  if (family === 'braking') return `${severityPrefix}Braking`;
  if (family === 'acceleration') return `${severityPrefix}Acceleration`;
  if (family === 'cornering') return `${severityPrefix}Cornering`;
  return 'Driving Event';
};

export const getIncidentMarkerSize = (eventType: EventType, severity: EventSeverity | null): number => {
  if (eventType === EventType.StopAndGo) {
    return 12;
  }
  if (severity === 'harsh') {
    return 18;
  }
  if (severity === 'moderate') {
    return 14;
  }
  if (severity === 'light') {
    return 10;
  }
  return 12;
};

const getNumericMetadataField = (event: Event, key: string): number | null => {
  const value = event.metadata?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const getStringMetadataField = (event: Event, key: string): string | null => {
  const value = event.metadata?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
};

const formatMetric = (value: number, digits: number, unit: string): string => {
  return `${value.toFixed(digits)} ${unit}`;
};

const formatTimestamp = (timestamp: number): string => {
  if (!isValidTimestamp(timestamp)) {
    return 'N/A';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDurationMs = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

const getEpisodeRange = (event: Event): { startTimestamp: number; endTimestamp: number } => {
  const eventTimestamp = Number.isFinite(event.timestamp) ? event.timestamp : 0;
  const startTimestamp = getNumericMetadataField(event, 'episodeStartTs') ?? eventTimestamp;
  const endTimestamp = getNumericMetadataField(event, 'episodeEndTs') ?? eventTimestamp;

  if (startTimestamp <= endTimestamp) {
    return { startTimestamp, endTimestamp };
  }

  return {
    startTimestamp: endTimestamp,
    endTimestamp: startTimestamp,
  };
};

const getEpisodeMidpointTimestamp = (startTimestamp: number, endTimestamp: number): number => {
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return 0;
  }
  return startTimestamp + Math.max(0, endTimestamp - startTimestamp) / 2;
};

const findClosestIndex = (points: RoutePoint[], timestamp: number): number => {
  if (points.length === 0) {
    return 0;
  }

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

const buildRouteSegment = (points: RoutePoint[], startTimestamp: number, endTimestamp: number): RoutePoint[] => {
  if (points.length < 2) {
    return [];
  }

  const startIndex = findClosestIndex(points, startTimestamp);
  const endIndex = findClosestIndex(points, endTimestamp);
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);

  return points.slice(from, to + 1);
};

const getRoutePointByTimestamp = (points: RoutePoint[], timestamp: number): RoutePoint | null => {
  if (points.length === 0) {
    return null;
  }

  const index = findClosestIndex(points, timestamp);
  return points[index] ?? null;
};

const getEventSpeedKmh = (event: Event): number | null => {
  const metadataSpeed = getNumericMetadataField(event, 'speedKmh');
  if (metadataSpeed !== null) {
    return metadataSpeed;
  }

  if (Number.isFinite(event.speed) && event.speed >= 0) {
    return event.speed;
  }

  return null;
};

const buildIncidentPinDetails = (marker: IncidentMarker): PinDetails => {
  const { event } = marker;
  const rows: PinDetailRow[] = [];

  rows.push({ label: 'Time', value: formatTimestamp(event.timestamp) });

  const eventSpeedKmh = getEventSpeedKmh(event);
  if (eventSpeedKmh !== null) {
    rows.push({ label: 'Speed', value: formatMetric(eventSpeedKmh, 1, 'km/h') });
  }

  const speedBand = getStringMetadataField(event, 'speedBand');
  if (speedBand) {
    rows.push({ label: 'Speed band', value: speedBand.replace('_', ' ') });
  }

  const horizontalForceG = getNumericMetadataField(event, 'horizontalForceG');
  if (horizontalForceG !== null) {
    rows.push({ label: 'Force', value: formatMetric(horizontalForceG, 3, 'g') });
  }

  const speedChangeRateKmhPerSec = getNumericMetadataField(event, 'speedChangeRateKmhPerSec');
  if (speedChangeRateKmhPerSec !== null) {
    rows.push({ label: 'Rate', value: formatMetric(speedChangeRateKmhPerSec, 3, 'km/h/s') });
  }

  const headingChangeDeg = getNumericMetadataField(event, 'headingChangeDeg');
  if (headingChangeDeg !== null) {
    rows.push({ label: 'Heading change', value: formatMetric(headingChangeDeg, 2, 'deg') });
  }

  if (event.type === EventType.StopAndGo) {
    const cycleCount = getNumericMetadataField(event, 'cycleCount');
    if (cycleCount !== null) {
      rows.push({ label: 'Cycle count', value: String(Math.round(cycleCount)) });
    }

    const detectionWindowMs = getNumericMetadataField(event, 'detectionWindowMs');
    if (detectionWindowMs !== null) {
      rows.push({ label: 'Window', value: formatDurationMs(detectionWindowMs) });
    }

    const stopSpeedThresholdKmh = getNumericMetadataField(event, 'stopSpeedThresholdKmh');
    if (stopSpeedThresholdKmh !== null) {
      rows.push({ label: 'Stop threshold', value: formatMetric(stopSpeedThresholdKmh, 1, 'km/h') });
    }

    const goSpeedThresholdKmh = getNumericMetadataField(event, 'goSpeedThresholdKmh');
    if (goSpeedThresholdKmh !== null) {
      rows.push({ label: 'Go threshold', value: formatMetric(goSpeedThresholdKmh, 1, 'km/h') });
    }
  }

  const title = getIncidentLabel(event);
  const subtitle =
    event.severity && event.type === EventType.DrivingEvent ? `${formatSeverityLabel(event.severity)} incident` : 'Incident event';

  return {
    title,
    subtitle,
    rows,
  };
};

const buildSpeedingEpisodeDetails = (marker: SpeedingEpisodeMarker): PinDetails => {
  const rows: PinDetailRow[] = [
    { label: 'Start', value: formatTimestamp(marker.startTimestamp) },
    { label: 'End', value: formatTimestamp(marker.endTimestamp) },
    { label: 'Duration', value: formatDurationMs(Math.max(0, marker.endTimestamp - marker.startTimestamp)) },
  ];

  if (marker.representativeSpeedKmh !== null) {
    rows.push({ label: 'Peak speed', value: formatMetric(marker.representativeSpeedKmh, 1, 'km/h') });
  }

  return {
    title: `${formatSeverityLabel(marker.severity)} speeding`,
    subtitle: 'Speeding episode',
    rows,
  };
};

const buildOscillationEpisodeDetails = (marker: OscillationEpisodeMarker): PinDetails => {
  const episodeDurationMs =
    getNumericMetadataField(marker.event, 'episodeDurationMs') ?? Math.max(0, marker.endTimestamp - marker.startTimestamp);
  const rows: PinDetailRow[] = [
    { label: 'Start', value: formatTimestamp(marker.startTimestamp) },
    { label: 'End', value: formatTimestamp(marker.endTimestamp) },
    { label: 'Duration', value: formatDurationMs(episodeDurationMs) },
  ];

  const speedStdDevKmh = getNumericMetadataField(marker.event, 'speedStdDevKmh');
  if (speedStdDevKmh !== null) {
    rows.push({ label: 'Speed std dev', value: formatMetric(speedStdDevKmh, 3, 'km/h') });
  }

  const signFlipCount = getNumericMetadataField(marker.event, 'signFlipCount');
  if (signFlipCount !== null) {
    rows.push({ label: 'Sign flips', value: String(Math.round(signFlipCount)) });
  }

  const forceP90G = getNumericMetadataField(marker.event, 'forceP90G');
  if (forceP90G !== null) {
    rows.push({ label: 'Force p90', value: formatMetric(forceP90G, 3, 'g') });
  }

  const forceMeanG = getNumericMetadataField(marker.event, 'forceMeanG');
  if (forceMeanG !== null) {
    rows.push({ label: 'Force mean', value: formatMetric(forceMeanG, 3, 'g') });
  }

  return {
    title: `${formatSeverityLabel(marker.severity)} oscillation`,
    subtitle: 'Oscillation episode',
    rows,
  };
};

const buildLegendFlags = (args: {
  incidentMarkers: IncidentMarker[];
  speedingEpisodeMarkers: SpeedingEpisodeMarker[];
  oscillationEpisodeMarkers: OscillationEpisodeMarker[];
}): JourneyMapLegendFlags => {
  const { incidentMarkers, speedingEpisodeMarkers, oscillationEpisodeMarkers } = args;

  return {
    hasLightSpeeding: speedingEpisodeMarkers.some((segment) => segment.severity === 'light'),
    hasModerateSpeeding: speedingEpisodeMarkers.some((segment) => segment.severity === 'moderate'),
    hasHarshSpeeding: speedingEpisodeMarkers.some((segment) => segment.severity === 'harsh'),
    hasLightOscillation: oscillationEpisodeMarkers.some((segment) => segment.severity === 'light'),
    hasModerateOscillation: oscillationEpisodeMarkers.some((segment) => segment.severity === 'moderate'),
    hasHarshOscillation: oscillationEpisodeMarkers.some((segment) => segment.severity === 'harsh'),
    hasBraking: incidentMarkers.some((marker) => marker.family === 'braking'),
    hasAcceleration: incidentMarkers.some((marker) => marker.family === 'acceleration'),
    hasCornering: incidentMarkers.some((marker) => marker.family === 'cornering'),
    hasStopAndGo: incidentMarkers.some((marker) => marker.event.type === EventType.StopAndGo),
    hasTieredIncidents: incidentMarkers.some(
      (marker) => marker.severity === 'light' || marker.severity === 'moderate' || marker.severity === 'harsh'
    ),
  };
};

export const buildJourneyMapData = (events: Event[]): JourneyMapDerivedData => {
  const routePoints = events
    .filter((event) => isRouteEventType(event.type))
    .filter((event) => isValidCoordinate(event.latitude, event.longitude))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => ({
      latitude: event.latitude,
      longitude: event.longitude,
      timestamp: event.timestamp,
    }));

  const routeCoordinates = routePoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

  const incidentMarkers = events
    .filter((event) => isIncidentType(event))
    .filter((event) => isValidCoordinate(event.latitude, event.longitude))
    .map((event) => ({
      id: `incident-${event.id}`,
      kind: 'incident' as const,
      event,
      family: resolveEventFamily(event),
      severity: event.severity ?? null,
      latitude: event.latitude,
      longitude: event.longitude,
    }));

  const normalizedEvents = normalizeJourneyEvents(events, DEFAULT_EFFICIENCY_SCORING_CONFIG);
  const speedingSampleEvents = events.filter(
    (event) => event.type === EventType.DrivingEvent && event.family === 'speeding' && isTieredSeverity(event.severity)
  );

  const speedingEpisodeMarkers: SpeedingEpisodeMarker[] = normalizedEvents.speedingEpisodes
    .map((episode, index) => {
      const midpointTimestamp = getEpisodeMidpointTimestamp(episode.startTimestamp, episode.endTimestamp);
      const midpoint = getRoutePointByTimestamp(routePoints, midpointTimestamp);
      if (!midpoint) {
        return null;
      }

      const representativeSpeedKmh = speedingSampleEvents
        .filter((sample) => sample.timestamp >= episode.startTimestamp && sample.timestamp <= episode.endTimestamp)
        .reduce<number | null>((maxSpeed, sample) => {
          const sampleSpeedKmh = getEventSpeedKmh(sample);
          if (sampleSpeedKmh === null) {
            return maxSpeed;
          }
          if (maxSpeed === null || sampleSpeedKmh > maxSpeed) {
            return sampleSpeedKmh;
          }
          return maxSpeed;
        }, null);

      return {
        id: `speeding-episode-${episode.startTimestamp}-${index}`,
        kind: 'speeding_episode' as const,
        severity: episode.severity,
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        startTimestamp: episode.startTimestamp,
        endTimestamp: episode.endTimestamp,
        representativeSpeedKmh,
      };
    })
    .filter((marker): marker is SpeedingEpisodeMarker => Boolean(marker));

  const speedingSegments: SpeedingSegment[] = speedingEpisodeMarkers
    .map((marker) => {
      const segmentPoints = buildRouteSegment(routePoints, marker.startTimestamp, marker.endTimestamp);
      if (segmentPoints.length < 2) {
        return null;
      }

      return {
        id: marker.id,
        severity: marker.severity,
        coordinates: segmentPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
        startTimestamp: marker.startTimestamp,
        endTimestamp: marker.endTimestamp,
      };
    })
    .filter((segment): segment is SpeedingSegment => Boolean(segment));

  const oscillationEpisodeMarkers: OscillationEpisodeMarker[] = events
    .filter((event) => event.type === EventType.DrivingEvent && event.family === 'oscillation' && isTieredSeverity(event.severity))
    .map((event, index) => {
      const { startTimestamp, endTimestamp } = getEpisodeRange(event);
      const midpointTimestamp = getEpisodeMidpointTimestamp(startTimestamp, endTimestamp);
      const midpoint = getRoutePointByTimestamp(routePoints, midpointTimestamp);
      if (!midpoint) {
        return null;
      }

      return {
        id: `oscillation-episode-${event.id}-${index}`,
        kind: 'oscillation_episode' as const,
        event,
        severity: event.severity,
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        startTimestamp,
        endTimestamp,
      };
    })
    .filter((marker): marker is OscillationEpisodeMarker => Boolean(marker));

  const oscillationSegments: OscillationSegment[] = oscillationEpisodeMarkers
    .map((marker) => {
      const segmentPoints = buildRouteSegment(routePoints, marker.startTimestamp, marker.endTimestamp);
      if (segmentPoints.length < 2) {
        return null;
      }

      return {
        id: marker.id,
        severity: marker.severity,
        coordinates: segmentPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
        startTimestamp: marker.startTimestamp,
        endTimestamp: marker.endTimestamp,
      };
    })
    .filter((segment): segment is OscillationSegment => Boolean(segment));

  const legendFlags = buildLegendFlags({ incidentMarkers, speedingEpisodeMarkers, oscillationEpisodeMarkers });
  const hasLegendContent =
    incidentMarkers.length > 0 ||
    speedingSegments.length > 0 ||
    oscillationSegments.length > 0 ||
    speedingEpisodeMarkers.length > 0 ||
    oscillationEpisodeMarkers.length > 0;

  return {
    routePoints,
    routeCoordinates,
    incidentMarkers,
    speedingEpisodeMarkers,
    speedingSegments,
    oscillationEpisodeMarkers,
    oscillationSegments,
    legendFlags,
    hasLegendContent,
  };
};

export const findSelectedPinById = (data: JourneyMapDerivedData, selectedPinId: string | null): SelectablePin | null => {
  if (!selectedPinId) {
    return null;
  }

  return (
    data.incidentMarkers.find((marker) => marker.id === selectedPinId) ??
    data.speedingEpisodeMarkers.find((marker) => marker.id === selectedPinId) ??
    data.oscillationEpisodeMarkers.find((marker) => marker.id === selectedPinId) ??
    null
  );
};

export const buildPinDetails = (pin: SelectablePin): PinDetails => {
  if (pin.kind === 'incident') {
    return buildIncidentPinDetails(pin);
  }
  if (pin.kind === 'speeding_episode') {
    return buildSpeedingEpisodeDetails(pin);
  }
  return buildOscillationEpisodeDetails(pin);
};

export const buildMapRegion = (routeCoordinates: Array<{ latitude: number; longitude: number }>): JourneyMapRegion | null => {
  if (routeCoordinates.length === 0) {
    return null;
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

  return {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: Math.max(deltaLat, 0.01),
    longitudeDelta: Math.max(deltaLng, 0.01),
  };
};
