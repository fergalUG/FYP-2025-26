import * as SQL from 'expo-sqlite';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Event, EventType, Journey, JourneyServiceController, JourneyServiceDeps, ScoringStats } from '@types';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.JourneyService);

export const createJourneyServiceController = (deps: JourneyServiceDeps): JourneyServiceController => {
  const fileSystem = deps.FileSystem ?? { File, Directory, Paths };
  const sharing = deps.Sharing ?? Sharing;

  let db: SQL.SQLiteDatabase | null = null;
  let currentJourneyId: number | null = null;

  const getDatabase = (): SQL.SQLiteDatabase | null => db;

  const initDatabase = async (): Promise<void> => {
    try {
      db = await deps.SQL.openDatabaseAsync('journeys.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS journeys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          date TEXT,
          startTime INTEGER,
          endTime INTEGER,
          score INTEGER,
          distanceKm REAL,
		  stats TEXT
        );
        
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          journeyId INTEGER,
          timestamp INTEGER,
          type TEXT,
          latitude REAL,
          longitude REAL,
          speed REAL,
          FOREIGN KEY (journeyId) REFERENCES journeys (id)
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
      deps.logger.info('Database initialized successfully.');
    } catch (error) {
      deps.logger.error('Error initializing database:', error);
    }
  };

  const getCurrentJourneyId = (): number | null => currentJourneyId;

  const startJourney = async (): Promise<void> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot start journey.');
      return;
    }

    try {
      const now = deps.now();
      const date = new Date(now);
      const journeyDate = date.toISOString().split('T')[0];
      const title = `Journey on ${journeyDate} at ${date.toLocaleTimeString()}`;

      const res = await db.runAsync(
        `
        INSERT INTO journeys (title, date, startTime)
        VALUES (?, ?, ?);
      `,
        [title, journeyDate, now]
      );

      currentJourneyId = res.lastInsertRowId;
      deps.logger.info(`Journey started successfully (${currentJourneyId}).`);
    } catch (error) {
      deps.logger.error('Error starting journey:', error);
    }
  };

  const endJourney = async (finalScore: number, distanceKm: number = 0, stats: ScoringStats | null = null): Promise<void> => {
    if (!db || !currentJourneyId) {
      return;
    }

    try {
      const endTime = deps.now();
      const statsJson = stats ? JSON.stringify(stats) : null;

      await db.runAsync(
        `
        UPDATE journeys
        SET endTime = ?, 
        score = ?,
        distanceKm = ?,
		stats = ?
        WHERE id = ?;
      `,
        [endTime, finalScore, distanceKm, statsJson, currentJourneyId]
      );

      deps.logger.info(`Journey ended successfully (${currentJourneyId}).`);
      currentJourneyId = null;
    } catch (error) {
      deps.logger.error('Error ending journey:', error);
    }
  };

  const updateJourneyTitle = async (journeyId: number, title: string): Promise<boolean> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot update journey title.');
      return false;
    }

    try {
      await db.runAsync('UPDATE journeys SET title = ? WHERE id = ?;', [title, journeyId]);
      deps.logger.info(`Journey title updated (${journeyId}).`);
      return true;
    } catch (error) {
      deps.logger.error('Error updating journey title:', error);
      return false;
    }
  };

  const logEvent = async (type: EventType, latitude: number, longitude: number, speed: number): Promise<void> => {
    if (!db || !currentJourneyId) {
      return;
    }

    try {
      const timestamp = deps.now();

      await db.runAsync(
        `
        INSERT INTO events (journeyId, timestamp, type, latitude, longitude, speed)
        VALUES (?, ?, ?, ?, ?, ?);
      `,
        [currentJourneyId, timestamp, type, latitude, longitude, speed]
      );
    } catch (error) {
      deps.logger.error('Error logging event:', error);
    }
  };

  const getJourneyById = async (id: number): Promise<Journey | null> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot fetch journey.');
      return null;
    }

    try {
      const result = await db.getFirstAsync(
        `
         SELECT * FROM journeys WHERE id = ?;
       `,
        [id]
      );

      if (!result) {
        return null;
      }

      const journey = result as Record<string, unknown>;
      const stats = journey.stats ? (JSON.parse(journey.stats as string) as ScoringStats) : null;
      if (stats) {
        deps.logger.info(`Journey stats for ID ${id}: ${JSON.stringify(stats)}`);
      }

      return {
        ...journey,
        stats,
      } as Journey;
    } catch (error) {
      deps.logger.error('Error fetching journey by ID:', error);
      return null;
    }
  };

  const getAllJourneys = async (): Promise<Journey[]> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot fetch journeys.');
      return [];
    }

    try {
      const result = await db.getAllAsync(`
        SELECT * FROM journeys ORDER BY date DESC, startTime DESC;
      `);

      return result.map((journey) => {
        const j = journey as Record<string, unknown>;
        return {
          ...j,
          stats: j.stats ? (JSON.parse(j.stats as string) as ScoringStats) : null,
        } as Journey;
      });
    } catch (error) {
      deps.logger.error('Error fetching all journeys:', error);
      return [];
    }
  };

  const deleteJourney = async (journeyId: number): Promise<boolean> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot delete journey.');
      return false;
    }

    try {
      await db.execAsync('BEGIN TRANSACTION;');
      await db.runAsync('DELETE FROM events WHERE journeyId = ?;', [journeyId]);
      await db.runAsync('DELETE FROM journeys WHERE id = ?;', [journeyId]);
      await db.execAsync('COMMIT;');
      deps.logger.info(`Journey deleted successfully (${journeyId}).`);
      return true;
    } catch (error) {
      deps.logger.error('Error deleting journey:', error);
      try {
        await db.execAsync('ROLLBACK;');
      } catch (rollbackError) {
        deps.logger.error('Error rolling back delete transaction:', rollbackError);
      }
      return false;
    }
  };

  const getEventsByJourneyId = async (journeyId: number): Promise<Event[]> => {
    if (!db) {
      await initDatabase();
    }
    if (!db) {
      deps.logger.error('Database not initialized. Cannot fetch events.');
      return [];
    }

    try {
      const result = await db.getAllAsync(
        `
        SELECT * FROM events WHERE journeyId = ? ORDER BY timestamp ASC;
      `,
        [journeyId]
      );
      return result as Event[];
    } catch (error) {
      deps.logger.error('Error fetching events for journey:', error);
      return [];
    }
  };

  const exportDatabase = async (): Promise<void> => {
    try {
      if (!db) {
        deps.logger.error('Database not initialized. Cannot export.');
        return;
      }

      const dbDirectory = new fileSystem.Directory(fileSystem.Paths.document, 'SQLite');
      const dbFile = new fileSystem.File(dbDirectory, 'journeys.db');

      deps.logger.info(`Exporting database from: ${dbFile.uri}`);

      if (!dbFile.exists) {
        deps.logger.error('Database file not found at:', dbFile.uri);
        return;
      }

      const cacheDir = new fileSystem.Directory(fileSystem.Paths.cache);
      const exportFileName = `VeloMetry_DB_${new Date(deps.now()).toISOString().split('T')[0]}.db`;
      const exportFile = new fileSystem.File(cacheDir, exportFileName);

      if (exportFile.exists) {
        exportFile.delete();
      }

      dbFile.copy(exportFile);

      deps.logger.info(`Database copied to: ${exportFile.uri}`);

      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(exportFile.uri, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Export VeloMetry Database',
        });
        deps.logger.info('Database exported successfully');
      } else {
        deps.logger.error('Sharing is not available on this device');
      }
    } catch (error) {
      deps.logger.error('Error exporting database:', error);
    }
  };

  return {
    getDatabase,
    initDatabase,
    getCurrentJourneyId,
    startJourney,
    endJourney,
    updateJourneyTitle,
    logEvent,
    getJourneyById,
    getAllJourneys,
    deleteJourney,
    getEventsByJourneyId,
    exportDatabase,
  };
};

export const JourneyService = createJourneyServiceController({
  SQL,
  FileSystem: { File, Directory, Paths },
  Sharing,
  now: () => Date.now(),
  logger,
});
