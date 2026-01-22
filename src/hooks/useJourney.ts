import { Journey } from '../types/db';

//test
const journeys: Journey[] = [
  { id: 1, title: 'Drive to work', distanceKm: 12.4, date: '2026-01-05', startTime: 123, endTime: 456, score: 0 },
  { id: 2, title: 'Drive to the gym', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 3, title: 'Drive to the store', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 4, title: 'Drive to the park', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 5, title: 'Drive to the library', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 6, title: 'Drive to the museum', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 7, title: 'Drive to the zoo', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
  { id: 8, title: 'Drive to the beach', distanceKm: 12.4, date: '2026-01-05', startTime: 0, endTime: 0, score: 0 },
];

export const useJourney = (id: number): Journey | undefined => {
  // TODO: implement hook to fetch journey by id from database

  return journeys.find((journey) => journey.id === id);
};

export const useJourneys = (): Journey[] => {
  return journeys;
};
