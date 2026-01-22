export type Journey = {
  id: number;
  title: string;
  date: string;
  startTime: number;
  endTime: number;
  score: number;
  distanceKm: number;
};

export interface Event {
  id: number;
  journeyId: number;
  timestamp: number;
  type: string;
  latitude: number;
  longitude: number;
  speed: number;
  penalty: number;
};

