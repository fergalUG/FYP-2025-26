import type * as SQL from 'expo-sqlite';
import type { Directory, File, Paths } from 'expo-file-system';
import type * as Sharing from 'expo-sharing';

import type { Event, EventType, Journey } from '@/types/db';
import type { ScoringStats } from '@/types/scoring';
import type { createLogger } from '@utils/logger';

export interface JourneyServiceDeps {
  SQL: {
    openDatabaseAsync: (databaseName: string) => Promise<SQL.SQLiteDatabase>;
  };
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  FileSystem?: {
    File: typeof File;
    Directory: typeof Directory;
    Paths: typeof Paths;
  };
  Sharing?: {
    isAvailableAsync: typeof Sharing.isAvailableAsync;
    shareAsync: typeof Sharing.shareAsync;
  };
}

export interface JourneyServiceController {
  initDatabase: () => Promise<void>;
  getCurrentJourneyId: () => number | null;
  startJourney: () => Promise<void>;
  endJourney: (finalScore: number, distanceKm?: number, stats?: ScoringStats | null) => Promise<void>;
  updateJourney: (id: number, updates: Partial<Journey>) => Promise<Journey | undefined>;
  updateJourneyTitle: (journeyId: number, title: string) => Promise<boolean>;
  logEvent: (type: EventType, latitude: number, longitude: number, speed: number) => Promise<void>;
  getJourneyById: (id: number) => Promise<Journey | null>;
  getAllJourneys: () => Promise<Journey[]>;
  deleteJourney: (journeyId: number) => Promise<boolean>;
  getEventsByJourneyId: (journeyId: number) => Promise<Event[]>;
  exportDatabase: () => Promise<void>;
}
