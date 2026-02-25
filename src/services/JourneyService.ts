import * as SQL from 'expo-sqlite';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db, resetDatabase } from '@/db/client';
import { journeys, events } from '@/db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';

import { EventType } from '@types';
import type {
  Event,
  Journey,
  JourneyServiceController,
  JourneyServiceDeps,
  JourneyChangeEvent,
  ScoringStats,
  EventLogDetails,
} from '@types';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.JourneyService);

export const createJourneyServiceController = (deps: JourneyServiceDeps): JourneyServiceController => {
  const fileSystem = deps.FileSystem ?? { File, Directory, Paths };
  const sharing = deps.Sharing ?? Sharing;

  let currentJourneyId: number | null = null;
  let lastNoJourneyLogTime = 0;
  const listeners: Array<(event: JourneyChangeEvent) => void> = [];

  const emitChange = (event: JourneyChangeEvent): void => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        deps.logger.error('Error in journey listener:', error);
      }
    });
  };

  const initDatabase = async (): Promise<void> => {
    try {
      const check = await db
        .select()
        .from(journeys)
        .limit(1)
        .catch(() => null);
      if (!check) {
        logger.info('Tables not found, initializing database...');
        await resetDatabase();
      }
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

      deps.logger.debug('Starting journey', { journeyDate, title });

      const result = await db
        .insert(journeys)
        .values({
          title,
          date: journeyDate,
          startTime: now,
        })
        .returning({ id: journeys.id });

      if (result[0]) {
        currentJourneyId = result[0].id;
        deps.logger.info(`Journey started successfully (${result[0].id}).`);
        emitChange({ type: 'journey-started', journeyId: result[0].id });
      }
    } catch (error) {
      deps.logger.error('Error starting journey:', error);
    }
  };

  const endJourney = async (finalScore: number, distanceKm: number = 0, stats: ScoringStats | null = null): Promise<void> => {
    if (!currentJourneyId) {
      return;
    }

    try {
      const journeyId = currentJourneyId;
      const endTime = deps.now();

      deps.logger.debug('Ending journey', { journeyId, finalScore, distanceKm });

      await db
        .update(journeys)
        .set({
          endTime,
          score: finalScore,
          distanceKm,
          stats: stats,
        })
        .where(eq(journeys.id, journeyId));

      deps.logger.info(`Journey ended successfully (${journeyId}).`);
      currentJourneyId = null;
      emitChange({ type: 'journey-ended', journeyId });
    } catch (error) {
      deps.logger.error('Error ending journey:', error);
    }
  };

  const updateJourney = async (
    id: number,
    updates: Partial<typeof journeys.$inferSelect>
  ): Promise<typeof journeys.$inferSelect | undefined> => {
    try {
      const result = await db.update(journeys).set(updates).where(eq(journeys.id, id)).returning();

      if (result[0]) {
        emitChange({ type: 'journey-updated', journeyId: id });
      }

      return result[0];
    } catch (error) {
      logger.error('JourneyService', 'Failed to update journey', error);
      throw error;
    }
  };

  const updateJourneyTitle = async (journeyId: number, title: string): Promise<boolean> => {
    try {
      await db.update(journeys).set({ title }).where(eq(journeys.id, journeyId));
      deps.logger.info(`Journey (${journeyId}) title updated to (${title}).`);
      emitChange({ type: 'journey-updated', journeyId });
      return true;
    } catch (error) {
      deps.logger.error('Error updating journey title:', error);
      return false;
    }
  };

  const logEvent = async (
    eventType: EventType,
    latitude: number,
    longitude: number,
    speed: number,
    details?: EventLogDetails
  ): Promise<void> => {
    if (!currentJourneyId) {
      const now = deps.now();
      if (eventType !== EventType.LocationUpdate || now - lastNoJourneyLogTime >= 5000) {
        deps.logger.debug('Skipping event log: no active journey', { eventType, speed, ...details });
        lastNoJourneyLogTime = now;
      }
      return;
    }

    try {
      const timestamp = deps.now();

      if (eventType !== EventType.LocationUpdate) {
        deps.logger.debug('Logging journey event', { eventType, speed });
      }

      await db.insert(events).values({
        journeyId: currentJourneyId,
        timestamp,
        type: eventType,
        latitude,
        longitude,
        speed,
        family: details?.family ?? null,
        severity: details?.severity ?? null,
        metadata: details?.metadata ?? null,
      });
    } catch (error) {
      deps.logger.error('Error logging event:', error);
    }
  };

  const deleteEventsSince = async (journeyId: number, timestamp: number): Promise<void> => {
    if (!Number.isFinite(timestamp)) {
      deps.logger.warn('Skipping deleteEventsSince: invalid timestamp provided.', { journeyId, timestamp });
      return;
    }

    try {
      await db.delete(events).where(and(eq(events.journeyId, journeyId), gte(events.timestamp, timestamp)));
      deps.logger.info(`Deleted journey events since ${timestamp} for journey (${journeyId}).`);
    } catch (error) {
      deps.logger.error('Error deleting journey events since timestamp:', error);
    }
  };

  const getJourneyById = async (id: number): Promise<Journey | null> => {
    try {
      const result = await db.select().from(journeys).where(eq(journeys.id, id));

      if (!result[0]) return null;

      return result[0];
    } catch (error) {
      deps.logger.error('Error fetching journey by ID:', error);
      return null;
    }
  };

  const getAllJourneys = async (): Promise<Journey[]> => {
    try {
      return await db.select().from(journeys).orderBy(desc(journeys.date), desc(journeys.startTime));
    } catch (error) {
      deps.logger.error('Error fetching all journeys:', error);
      return [];
    }
  };

  const deleteJourney = async (journeyId: number): Promise<boolean> => {
    try {
      await db.delete(journeys).where(eq(journeys.id, journeyId));
      deps.logger.info(`Journey (${journeyId}) deleted successfully.`);
      emitChange({ type: 'journey-deleted', journeyId });
      return true;
    } catch (error) {
      deps.logger.error('Error deleting journey:', error);
      return false;
    }
  };

  const getEventsByJourneyId = async (journeyId: number): Promise<Event[]> => {
    try {
      return await db.select().from(events).where(eq(events.journeyId, journeyId)).orderBy(events.timestamp);
    } catch (error) {
      deps.logger.error('Error fetching events for journey:', error);
      return [];
    }
  };

  const exportDatabase = async (): Promise<void> => {
    try {
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
    initDatabase,
    getCurrentJourneyId,
    startJourney,
    endJourney,
    updateJourney,
    updateJourneyTitle,
    logEvent,
    deleteEventsSince,
    getJourneyById,
    getAllJourneys,
    deleteJourney,
    getEventsByJourneyId,
    exportDatabase,
    addJourneyListener: (listener: (event: JourneyChangeEvent) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
};

export const JourneyService = createJourneyServiceController({
  SQL,
  FileSystem: { File, Directory, Paths },
  Sharing,
  now: () => Date.now(),
  logger,
});
