import * as SQL from 'expo-sqlite';

let db: SQL.SQLiteDatabase | null = null;

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
      distanceKm INTEGER
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
	`);
    console.log('[JourneyService] Database initialized successfully.');
  } catch (error) {
    console.error('[JourneyService] Error initializing database:', error);
  }
};

let currentJourneyId: number | null = null;

export const startJourney = async (): Promise<void> => {
  if (!db) { await initDatabase(); }
  if (!db) {
    console.error('[JourneyService] Database not initialized. Cannot start journey.');
    return;
  }

  try {
    const date = new Date();
    const journeyDate = date.toISOString().split('T')[0];
    const startTime = date.getTime();
    const title = `Journey on ${journeyDate} at ${date.toLocaleTimeString()}`;

    const res = await db.runAsync(`
      INSERT INTO journeys (title, date, startTime)
      VALUES (?, ?, ?);
    `, [title, journeyDate, startTime]);

    const currentJourneyId = res.lastInsertRowId;
    console.log(`[JourneyService] Journey started successfully (${currentJourneyId}).`);
  } catch (error) {
    console.error('[JourneyService] Error starting journey:', error);
  }
};

export const endJourney = async (finalScore: number): Promise<void> => {
  if (!db || !currentJourneyId) { return; }
  if (!db) {
    console.error('[JourneyService] Database not initialized. Cannot end journey.');
    return;
  }

  try {
    const date = new Date();
    const endTime = date.getTime();

    await db.runAsync(`
      UPDATE journeys
      SET endTime = ?, 
      score = ?,
      WHERE id = ?;
    `, [endTime, finalScore, currentJourneyId]);

    console.log(`[JourneyService] Journey ended successfully (${currentJourneyId}).`);
    currentJourneyId = null;
  } catch (error) {
    console.error('[JourneyService] Error ending journey:', error);
  }
};
