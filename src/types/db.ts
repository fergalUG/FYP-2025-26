import type { ScoringStats } from '@/types/scoring';

export interface Journey {
  id: number;
  title: string;
  date: string;
  startTime: number;
  endTime?: number | null;
  score?: number | null;
  distanceKm?: number | null;
  stats?: ScoringStats | null;
}

export interface Event {
  id: number;
  journeyId: number;
  timestamp: number;
  type: EventType;
  latitude: number;
  longitude: number;
  speed: number;
  family?: DrivingEventFamily | null;
  severity?: EventSeverity | null;
  metadata?: EventMetadata | null;
}

export type EventSeverity = 'light' | 'moderate' | 'harsh';
export type DrivingEventFamily = 'braking' | 'acceleration' | 'cornering' | 'speeding';
export type EventMetadataValue = string | number | boolean;
export type EventMetadata = Record<string, EventMetadataValue>;

export enum EventType {
  JourneyStart = 'journey_start',
  JourneyEnd = 'journey_end',
  LocationUpdate = 'location_update',
  DrivingEvent = 'driving_event',
  StopAndGo = 'stop_and_go',
}
