import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

const expoDb = SQLite.openDatabaseSync('journeys.db');
export const db = drizzle(expoDb);

export const resetDatabase = async () => {
  await expoDb.execAsync(`
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS journeys;
    DROP TABLE IF EXISTS settings;
  `);

  await expoDb.execAsync(`
    CREATE TABLE journeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      startTime INTEGER NOT NULL,
      endTime INTEGER,
      score INTEGER,
      distanceKm REAL,
      stats TEXT
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journeyId INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      speed REAL NOT NULL,
      family TEXT,
      severity TEXT,
      metadata TEXT,
      FOREIGN KEY (journeyId) REFERENCES journeys(id) ON DELETE CASCADE
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
};
