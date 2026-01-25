import type * as SQL from 'expo-sqlite';

import * as JourneyService from '@services/JourneyService';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.SettingsService);

const DRIVER_NAME_KEY = 'driverName';
const DEFAULT_DRIVER_NAME = 'Driver';

const ensureDb = async (): Promise<SQL.SQLiteDatabase | null> => {
  let db = JourneyService.getDatabase();
  if (!db) {
    await JourneyService.initDatabase();
  }
  db = JourneyService.getDatabase();
  return db;
};

export const getDriverName = async (): Promise<string> => {
  const db = await ensureDb();
  if (!db) {
    return DEFAULT_DRIVER_NAME;
  }

  try {
    const result = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?;', [DRIVER_NAME_KEY]);
    const value = (result as { value?: unknown } | null)?.value;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return DEFAULT_DRIVER_NAME;
  } catch (error) {
    logger.warn('Failed to load driver name:', error);
    return DEFAULT_DRIVER_NAME;
  }
};

export const setDriverName = async (name: string): Promise<boolean> => {
  const db = await ensureDb();
  if (!db) {
    return false;
  }

  const next = name.trim().length > 0 ? name.trim() : DEFAULT_DRIVER_NAME;

  try {
    logger.debug('Saving driver name:', next);
    await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;', [
      DRIVER_NAME_KEY,
      next,
    ]);
    return true;
  } catch (error) {
    logger.warn('Failed to save driver name:', error);
    return false;
  }
};
