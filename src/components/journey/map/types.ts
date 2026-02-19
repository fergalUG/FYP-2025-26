import type { Event, EventSeverity } from '@types';

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface SpeedingSegment {
  id: string;
  severity: EventSeverity;
  coordinates: Array<{ latitude: number; longitude: number }>;
  startTimestamp: number;
  endTimestamp: number;
}

export interface OscillationSegment {
  id: string;
  severity: EventSeverity;
  coordinates: Array<{ latitude: number; longitude: number }>;
  startTimestamp: number;
  endTimestamp: number;
}

export interface IncidentMarker {
  id: string;
  kind: 'incident';
  event: Event;
  family: 'braking' | 'acceleration' | 'cornering' | 'speeding' | null;
  severity: EventSeverity | null;
  latitude: number;
  longitude: number;
}

export interface SpeedingEpisodeMarker {
  id: string;
  kind: 'speeding_episode';
  severity: EventSeverity;
  latitude: number;
  longitude: number;
  startTimestamp: number;
  endTimestamp: number;
  representativeSpeedKmh: number | null;
}

export interface OscillationEpisodeMarker {
  id: string;
  kind: 'oscillation_episode';
  event: Event;
  severity: EventSeverity;
  latitude: number;
  longitude: number;
  startTimestamp: number;
  endTimestamp: number;
}

export type SelectablePin = IncidentMarker | SpeedingEpisodeMarker | OscillationEpisodeMarker;

export interface PinDetailRow {
  label: string;
  value: string;
}

export interface PinDetails {
  title: string;
  subtitle: string;
  rows: PinDetailRow[];
}

export interface JourneyMapLegendFlags {
  hasLightSpeeding: boolean;
  hasModerateSpeeding: boolean;
  hasHarshSpeeding: boolean;
  hasLightOscillation: boolean;
  hasModerateOscillation: boolean;
  hasHarshOscillation: boolean;
  hasBraking: boolean;
  hasAcceleration: boolean;
  hasCornering: boolean;
  hasStopAndGo: boolean;
  hasTieredIncidents: boolean;
}

export interface JourneyMapDerivedData {
  routePoints: RoutePoint[];
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  incidentMarkers: IncidentMarker[];
  speedingEpisodeMarkers: SpeedingEpisodeMarker[];
  speedingSegments: SpeedingSegment[];
  oscillationEpisodeMarkers: OscillationEpisodeMarker[];
  oscillationSegments: OscillationSegment[];
  legendFlags: JourneyMapLegendFlags;
  hasLegendContent: boolean;
}
