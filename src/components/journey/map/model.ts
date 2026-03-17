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

interface BuildPinDetailsOptions {
  showDebugMetadata?: boolean;
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

const getBooleanMetadataField = (event: Event, key: string): boolean | null => {
  const value = event.metadata?.[key];
  if (typeof value !== 'boolean') {
    return null;
  }
  return value;
};

const formatMetric = (value: number, digits: number, unit: string): string => {
  return `${value.toFixed(digits)} ${unit}`;
};

const formatSourceLabel = (value: string): string => {
  if (value === 'offline_osm') {
    return 'Offline OSM';
  }
  if (value === 'overpass') {
    return 'Overpass';
  }

  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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

const getSpeedingOverLimitKmh = (event: Event): number | null => {
  const metadataOverLimit = getNumericMetadataField(event, 'overLimitKmh');
  if (metadataOverLimit !== null) {
    return metadataOverLimit;
  }

  const speedKmh = getEventSpeedKmh(event);
  const speedLimitKmh = getNumericMetadataField(event, 'speedLimitKmh');
  if (speedKmh === null || speedLimitKmh === null) {
    return null;
  }

  return speedKmh - speedLimitKmh;
};

const pickRepresentativeSpeedingSample = (samples: Event[]): Event | null => {
  if (samples.length === 0) {
    return null;
  }

  let representative = samples[0];
  let representativeOverLimit = getSpeedingOverLimitKmh(representative) ?? Number.NEGATIVE_INFINITY;
  let representativeSpeedKmh = getEventSpeedKmh(representative) ?? Number.NEGATIVE_INFINITY;

  for (let i = 1; i < samples.length; i += 1) {
    const candidate = samples[i];
    const candidateOverLimit = getSpeedingOverLimitKmh(candidate) ?? Number.NEGATIVE_INFINITY;
    const candidateSpeedKmh = getEventSpeedKmh(candidate) ?? Number.NEGATIVE_INFINITY;

    if (
      candidateOverLimit > representativeOverLimit ||
      (candidateOverLimit === representativeOverLimit && candidateSpeedKmh > representativeSpeedKmh)
    ) {
      representative = candidate;
      representativeOverLimit = candidateOverLimit;
      representativeSpeedKmh = candidateSpeedKmh;
    }
  }

  return representative;
};

const summarizeSpeedingEpisodeSamples = (
  samples: Event[]
): Pick<
  SpeedingEpisodeMarker,
  | 'representativeSpeedKmh'
  | 'representativeSpeedLimitKmh'
  | 'peakOverLimitKmh'
  | 'minSpeedLimitKmh'
  | 'maxSpeedLimitKmh'
  | 'speedLimitSourceLabel'
  | 'speedLimitFromCacheLabel'
  | 'speedLimitWayIdLabel'
  | 'speedLimitRawLabel'
  | 'sampleCount'
> => {
  const representativeSample = pickRepresentativeSpeedingSample(samples);
  const representativeSpeedKmh = representativeSample ? getEventSpeedKmh(representativeSample) : null;
  const representativeSpeedLimitKmh = representativeSample ? getNumericMetadataField(representativeSample, 'speedLimitKmh') : null;

  const overLimitValues = samples
    .map((sample) => getSpeedingOverLimitKmh(sample))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const peakOverLimitKmh = overLimitValues.length > 0 ? Math.max(...overLimitValues) : null;

  const speedLimitValues = samples
    .map((sample) => getNumericMetadataField(sample, 'speedLimitKmh'))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const minSpeedLimitKmh = speedLimitValues.length > 0 ? Math.min(...speedLimitValues) : null;
  const maxSpeedLimitKmh = speedLimitValues.length > 0 ? Math.max(...speedLimitValues) : null;

  const speedLimitSources = new Set<string>();
  const fromCacheValues = new Set<boolean>();
  const wayIds = new Set<number>();
  const rawMaxspeeds = new Set<string>();

  for (const sample of samples) {
    const source = getStringMetadataField(sample, 'speedLimitSource');
    if (source) {
      speedLimitSources.add(source);
    }

    const fromCache = getBooleanMetadataField(sample, 'speedLimitFromCache');
    if (fromCache !== null) {
      fromCacheValues.add(fromCache);
    }

    const wayId = getNumericMetadataField(sample, 'speedLimitWayId');
    if (wayId !== null) {
      wayIds.add(wayId);
    }

    const raw = getStringMetadataField(sample, 'speedLimitRaw');
    if (raw) {
      rawMaxspeeds.add(raw);
    }
  }

  let speedLimitSourceLabel: string | null = null;
  if (speedLimitSources.size === 1) {
    speedLimitSourceLabel = formatSourceLabel(Array.from(speedLimitSources)[0]);
  } else if (speedLimitSources.size > 1) {
    speedLimitSourceLabel = 'Mixed';
  }

  let speedLimitFromCacheLabel: SpeedingEpisodeMarker['speedLimitFromCacheLabel'] = null;
  if (fromCacheValues.size === 1) {
    speedLimitFromCacheLabel = Array.from(fromCacheValues)[0] ? 'Yes' : 'No';
  } else if (fromCacheValues.size > 1) {
    speedLimitFromCacheLabel = 'Mixed';
  }

  let speedLimitWayIdLabel: string | null = null;
  if (wayIds.size === 1) {
    speedLimitWayIdLabel = String(Array.from(wayIds)[0]);
  } else if (wayIds.size > 1) {
    speedLimitWayIdLabel = 'Mixed';
  }

  let speedLimitRawLabel: string | null = null;
  if (rawMaxspeeds.size === 1) {
    speedLimitRawLabel = Array.from(rawMaxspeeds)[0];
  } else if (rawMaxspeeds.size > 1) {
    speedLimitRawLabel = 'Mixed';
  }

  return {
    representativeSpeedKmh,
    representativeSpeedLimitKmh,
    peakOverLimitKmh,
    minSpeedLimitKmh,
    maxSpeedLimitKmh,
    speedLimitSourceLabel,
    speedLimitFromCacheLabel,
    speedLimitWayIdLabel,
    speedLimitRawLabel,
    sampleCount: samples.length,
  };
};

const buildIncidentPinDetails = (marker: IncidentMarker, options: BuildPinDetailsOptions): PinDetails => {
  const { event } = marker;
  const { showDebugMetadata = false } = options;
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

  if (event.type === EventType.StopAndGo && showDebugMetadata) {
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

const buildSpeedingEpisodeDetails = (marker: SpeedingEpisodeMarker, options: BuildPinDetailsOptions): PinDetails => {
  const { showDebugMetadata = false } = options;
  const rows: PinDetailRow[] = [
    { label: 'Start', value: formatTimestamp(marker.startTimestamp) },
    { label: 'End', value: formatTimestamp(marker.endTimestamp) },
    { label: 'Duration', value: formatDurationMs(Math.max(0, marker.endTimestamp - marker.startTimestamp)) },
  ];

  if (marker.representativeSpeedKmh !== null) {
    rows.push({ label: 'Peak speed', value: formatMetric(marker.representativeSpeedKmh, 1, 'km/h') });
  }

  if (marker.peakOverLimitKmh !== null) {
    rows.push({ label: 'Over limit (peak)', value: formatMetric(marker.peakOverLimitKmh, 2, 'km/h') });
  }

  if (marker.representativeSpeedLimitKmh !== null) {
    rows.push({ label: 'Limit at peak', value: formatMetric(marker.representativeSpeedLimitKmh, 1, 'km/h') });
  }

  if (marker.minSpeedLimitKmh !== null && marker.maxSpeedLimitKmh !== null && marker.maxSpeedLimitKmh - marker.minSpeedLimitKmh >= 0.1) {
    rows.push({ label: 'Limit range', value: `${marker.minSpeedLimitKmh.toFixed(1)}-${marker.maxSpeedLimitKmh.toFixed(1)} km/h` });
  }

  if (showDebugMetadata) {
    if (marker.speedLimitSourceLabel) {
      rows.push({ label: 'Limit source', value: marker.speedLimitSourceLabel });
    }

    if (marker.speedLimitFromCacheLabel) {
      rows.push({ label: 'From cache', value: marker.speedLimitFromCacheLabel });
    }

    if (marker.speedLimitWayIdLabel) {
      rows.push({ label: 'Way ID', value: marker.speedLimitWayIdLabel });
    }

    if (marker.speedLimitRawLabel) {
      rows.push({ label: 'Raw maxspeed', value: marker.speedLimitRawLabel });
    }
  }

  rows.push({ label: 'Samples', value: String(marker.sampleCount) });

  return {
    title: `${formatSeverityLabel(marker.severity)} speeding`,
    subtitle: 'Speeding episode',
    rows,
  };
};

const buildOscillationEpisodeDetails = (marker: OscillationEpisodeMarker, options: BuildPinDetailsOptions): PinDetails => {
  const { showDebugMetadata = false } = options;
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

  if (showDebugMetadata) {
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

      const episodeSamples = speedingSampleEvents.filter(
        (sample) => sample.timestamp >= episode.startTimestamp && sample.timestamp <= episode.endTimestamp
      );
      const metadataSummary = summarizeSpeedingEpisodeSamples(episodeSamples);

      return {
        id: `speeding-episode-${episode.startTimestamp}-${index}`,
        kind: 'speeding_episode' as const,
        severity: episode.severity,
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        startTimestamp: episode.startTimestamp,
        endTimestamp: episode.endTimestamp,
        ...metadataSummary,
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

export const buildPinDetails = (pin: SelectablePin, options: BuildPinDetailsOptions = {}): PinDetails => {
  if (pin.kind === 'incident') {
    return buildIncidentPinDetails(pin, options);
  }
  if (pin.kind === 'speeding_episode') {
    return buildSpeedingEpisodeDetails(pin, options);
  }
  return buildOscillationEpisodeDetails(pin, options);
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
