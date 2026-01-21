import * as SQL from 'expo-sqlite';

let db: SQL.SQLiteDatabase | null = null;

export const initDatabase = async (): Promise<void> => {
  try {
    db = await SQL.openDatabaseAsync('journeys.db');
    await db.execAsync(`
		CREATE TABLE IF NOT EXISTS journeys (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
      title STRING,
      date STRING,
			startTime INTEGER,
			endTime INTEGER,
			score INTEGER,
      distanceKm INTEGER
		);
	`);
    console.log('[JourneyService] Database initialized successfully.');
  } catch (error) {
    console.error('[JourneyService] Error initializing database:', error);
  }
};

export const startJourney = async (): Promise<void> => {
  // TODO: implement start journey logic
};

export const endJourney = async (): Promise<void> => {
  // TODO: implement end journey logic
};
