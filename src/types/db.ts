export interface Journey {
  id: number;
  title: string;
  date: string;
  startTime: number;
  endTime: number;
  score: number;
  distanceKm: number;
}

export interface Event {
  id: number;
  journeyId: number;
  timestamp: number;
  type: EventType;
  latitude: number;
  longitude: number;
  speed: number;
  penalty: number;
}

export type EventType = 'journey_start' | 'journey_end' | 'location_update' | 'harsh_acceleration' | 'harsh_braking' | 'sharp_turn';
