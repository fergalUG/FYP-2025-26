import type * as SQL from 'expo-sqlite';
import type { Directory, File, Paths } from 'expo-file-system';
import type * as Sharing from 'expo-sharing';

import type { Event, EventType, Journey } from '@/types/db';

export interface JourneyServiceDeps {
  SQL: {
    openDatabaseAsync: (databaseName: string) => Promise<SQL.SQLiteDatabase>;
  };
  now: () => number;
  logger: {
    info: (message: string, ...data: unknown[]) => void;
    warn: (message: string, ...data: unknown[]) => void;
    error: (message: string, ...data: unknown[]) => void;
  };
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
  getDatabase: () => SQL.SQLiteDatabase | null;
  initDatabase: () => Promise<void>;
  getCurrentJourneyId: () => number | null;
  startJourney: () => Promise<void>;
  endJourney: (finalScore: number, distanceKm?: number) => Promise<void>;
  updateJourneyTitle: (journeyId: number, title: string) => Promise<boolean>;
  logEvent: (type: EventType, latitude: number, longitude: number, speed: number) => Promise<void>;
  getJourneyById: (id: number) => Promise<Journey | null>;
  getAllJourneys: () => Promise<Journey[]>;
  deleteJourney: (journeyId: number) => Promise<boolean>;
  getEventsByJourneyId: (journeyId: number) => Promise<Event[]>;
  exportDatabase: () => Promise<void>;
}
