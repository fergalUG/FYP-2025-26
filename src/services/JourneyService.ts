import * as SQL from 'expo-sqlite';
import { Journey, Event } from '../types';
import { createLogger, LogModule } from '../utils/logger';

const logger = createLogger(LogModule.JourneyService);

let db: SQL.SQLiteDatabase | null = null;

export const getDatabase = (): SQL.SQLiteDatabase | null => {
  return db;
};

export const initDatabase = async (): Promise<void> => {
  try {
    db = await SQL.openDatabaseAsync('journeys.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS journeys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT,
        startTime INTEGER,
        endTime INTEGER,
        score INTEGER,
        distanceKm REAL
      );
      
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journeyId INTEGER,
        timestamp INTEGER,
        type TEXT,
        latitude REAL,
        longitude REAL,
        speed REAL,
        penalty INTEGER,
        FOREIGN KEY (journeyId) REFERENCES journeys (id)
      );
    `);
    logger.info('Database initialized successfully.');
  } catch (error) {
    logger.error('Error initializing database:', error);
  }
};

let currentJourneyId: number | null = null;

export const getCurrentJourneyId = (): number | null => currentJourneyId;

export const startJourney = async (): Promise<void> => {
  if (!db) {
    await initDatabase();
  }
  if (!db) {
    logger.error('Database not initialized. Cannot start journey.');
    return;
  }

  try {
    const date = new Date();
    const journeyDate = date.toISOString().split('T')[0];
    const startTime = date.getTime();
    const title = `Journey on ${journeyDate} at ${date.toLocaleTimeString()}`;

    const res = await db.runAsync(
      `
      INSERT INTO journeys (title, date, startTime)
      VALUES (?, ?, ?);
    `,
      [title, journeyDate, startTime]
    );

    currentJourneyId = res.lastInsertRowId;
    logger.info(`Journey started successfully (${currentJourneyId}).`);
  } catch (error) {
    logger.error('Error starting journey:', error);
  }
};

export const endJourney = async (finalScore: number, distanceKm: number = 0): Promise<void> => {
  if (!db || !currentJourneyId) {
    return;
  }
  if (!db) {
    logger.error('Database not initialized. Cannot end journey.');
    return;
  }

  try {
    const date = new Date();
    const endTime = date.getTime();

    await db.runAsync(
      `
      UPDATE journeys
      SET endTime = ?, 
      score = ?,
      distanceKm = ?
      WHERE id = ?;
    `,
      [endTime, finalScore, distanceKm, currentJourneyId]
    );

    logger.info(`Journey ended successfully (${currentJourneyId}).`);
    currentJourneyId = null;
  } catch (error) {
    logger.error('Error ending journey:', error);
  }
};

export const logEvent = async (type: string, latitude: number, longitude: number, speed: number, penalty: number): Promise<void> => {
  if (!db || !currentJourneyId) {
    return;
  }
  if (!db) {
    logger.error('Database not initialized. Cannot log event.');
    return;
  }

  try {
    const timestamp = new Date().getTime();

    await db.runAsync(
      `
      INSERT INTO events (journeyId, timestamp, type, latitude, longitude, speed, penalty)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
      [currentJourneyId, timestamp, type, latitude, longitude, speed, penalty]
    );
  } catch (error) {
    logger.error('Error logging event:', error);
  }
};

export const getJourneyById = async (id: number): Promise<Journey | null> => {
  if (!db) {
    return null;
  }
  if (!db) {
    logger.error('Database not initialized. Cannot fetch journey.');
    return null;
  }

  try {
    const result = await db.getFirstAsync(
      `
      SELECT * FROM journeys WHERE id = ?;
    `,
      [id]
    );

    return result as Journey | null;
  } catch (error) {
    logger.error('Error fetching journey by ID:', error);
    return null;
  }
};

export const getAllJourneys = async (): Promise<Journey[]> => {
  if (!db) {
    return [];
  }
  if (!db) {
    logger.error('Database not initialized. Cannot fetch journeys.');
    return [];
  }

  try {
    const result = await db.getAllAsync(`
      SELECT * FROM journeys ORDER BY date DESC, startTime DESC;
    `);
    return result as Journey[];
  } catch (error) {
    logger.error('Error fetching all journeys:', error);
    return [];
  }
};

export const getEventsByJourneyId = async (journeyId: number): Promise<Event[]> => {
  if (!db) {
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
    logger.error('Error fetching events for journey:', error);
    return [];
  }
};
