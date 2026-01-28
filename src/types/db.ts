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
}

export enum EventType {
  JourneyStart = 'journey_start',
  JourneyEnd = 'journey_end',
  LocationUpdate = 'location_update',
  HarshAcceleration = 'harsh_acceleration',
  HarshBraking = 'harsh_braking',
  SharpTurn = 'sharp_turn',
  ModerateSpeeding = 'moderate_speeding',
  HarshSpeeding = 'harsh_speeding',
}
