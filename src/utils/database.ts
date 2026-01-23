import * as JourneyService from '../services/JourneyService';
import { Journey } from '../types';
import { createLogger, LogModule } from './logger';

const logger = createLogger(LogModule.DB);

// TESTING FUNCTIONS

export const initDatabaseWithMockData = async (): Promise<void> => {
  try {
    logger.info('Resetting and initializing database...');
    await resetDatabase();

    logger.info('Seeding mock data...');
    await seedMockData();

    logger.info('Database setup complete!');
  } catch (error) {
    logger.error('Failed to initialize database with mock data:', error);
  }
};

export const resetDatabase = async (): Promise<void> => {
  try {
    let db = JourneyService.getDatabase();
    if (!db) {
      await JourneyService.initDatabase();
    }
    db = JourneyService.getDatabase();
    if (!db) {
      logger.error('Database not initialized. Cannot reset database.');
      return;
    }

    logger.info('Dropping existing tables...');
    await db.execAsync(`
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS journeys;
    `);

    logger.info('Recreating tables...');
    await db.execAsync(`
      CREATE TABLE journeys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT,
        startTime INTEGER,
        endTime INTEGER,
        score INTEGER,
        distanceKm REAL
      );
      
      CREATE TABLE events (
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

    logger.info('Database reset successfully.');
  } catch (error) {
    logger.error('Error resetting database:', error);
  }
};

export const seedMockData = async (): Promise<void> => {
  let db = JourneyService.getDatabase();
  if (!db) {
    await JourneyService.initDatabase();
  }
  db = JourneyService.getDatabase();
  if (!db) {
    logger.error('Database not initialized. Cannot seed data.');
    return;
  }

  try {
    const existingData = (await db.getFirstAsync('SELECT COUNT(*) as count FROM journeys')) as Journey[];
    if (existingData && existingData.length > 0) {
      logger.info('Database already contains data. Skipping seed.');
      return;
    }

    logger.info('Seeding database with mock data...');

    const mockJourneys = [
      {
        title: 'Drive to work',
        distanceKm: 12.4,
        date: '2026-01-20',
        startTime: Date.now() - 86400000 * 2,
        endTime: Date.now() - 86400000 * 2 + 1800000,
        score: 85,
      },
      {
        title: 'Drive to the gym',
        distanceKm: 8.7,
        date: '2026-01-19',
        startTime: Date.now() - 86400000 * 3,
        endTime: Date.now() - 86400000 * 3 + 1200000,
        score: 92,
      },
      {
        title: 'Drive to the store',
        distanceKm: 5.2,
        date: '2026-01-18',
        startTime: Date.now() - 86400000 * 4,
        endTime: Date.now() - 86400000 * 4 + 900000,
        score: 78,
      },
      {
        title: 'Drive to the park',
        distanceKm: 15.8,
        date: '2026-01-17',
        startTime: Date.now() - 86400000 * 5,
        endTime: Date.now() - 86400000 * 5 + 2100000,
        score: 88,
      },
      {
        title: 'Drive to the library',
        distanceKm: 6.3,
        date: '2026-01-16',
        startTime: Date.now() - 86400000 * 6,
        endTime: Date.now() - 86400000 * 6 + 1100000,
        score: 95,
      },
      {
        title: 'Drive to the museum',
        distanceKm: 22.1,
        date: '2026-01-15',
        startTime: Date.now() - 86400000 * 7,
        endTime: Date.now() - 86400000 * 7 + 2700000,
        score: 82,
      },
      {
        title: 'Drive to the zoo',
        distanceKm: 18.5,
        date: '2026-01-14',
        startTime: Date.now() - 86400000 * 8,
        endTime: Date.now() - 86400000 * 8 + 2400000,
        score: 90,
      },
      {
        title: 'Drive to the beach',
        distanceKm: 35.2,
        date: '2026-01-13',
        startTime: Date.now() - 86400000 * 9,
        endTime: Date.now() - 86400000 * 9 + 3600000,
        score: 75,
      },
    ];

    const journeyIds: number[] = [];
    for (const journey of mockJourneys) {
      const result = await db.runAsync(
        `INSERT INTO journeys (title, date, startTime, endTime, score, distanceKm) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [journey.title, journey.date, journey.startTime, journey.endTime, journey.score, journey.distanceKm]
      );
      journeyIds.push(result.lastInsertRowId);
    }

    const mockEvents = [
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.3505, lng: -6.259, speed: 15, type: 'location_update', penalty: 0 },
        { lat: 53.3512, lng: -6.2575, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.352, lng: -6.256, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3525, lng: -6.2545, speed: 35, type: 'speed_change', penalty: 0 },
        { lat: 53.353, lng: -6.253, speed: 20, type: 'hard_brake', penalty: 5 },
        { lat: 53.3535, lng: -6.2515, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.354, lng: -6.25, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3545, lng: -6.2485, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.349, lng: -6.261, speed: 20, type: 'location_update', penalty: 0 },
        { lat: 53.3482, lng: -6.2618, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3474, lng: -6.2625, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3466, lng: -6.2632, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3458, lng: -6.264, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.3505, lng: -6.2615, speed: 18, type: 'location_update', penalty: 0 },
        { lat: 53.3512, lng: -6.2628, speed: 22, type: 'location_update', penalty: 0 },
        { lat: 53.352, lng: -6.264, speed: 28, type: 'location_update', penalty: 0 },
        { lat: 53.3525, lng: -6.265, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.351, lng: -6.258, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3525, lng: -6.255, speed: 35, type: 'location_update', penalty: 0 },
        { lat: 53.354, lng: -6.252, speed: 40, type: 'location_update', penalty: 0 },
        { lat: 53.3555, lng: -6.249, speed: 45, type: 'location_update', penalty: 0 },
        { lat: 53.357, lng: -6.246, speed: 35, type: 'speed_change', penalty: 0 },
        { lat: 53.3585, lng: -6.243, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.36, lng: -6.24, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3615, lng: -6.237, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.3485, lng: -6.259, speed: 20, type: 'location_update', penalty: 0 },
        { lat: 53.3472, lng: -6.2578, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.346, lng: -6.2565, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3448, lng: -6.2553, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.352, lng: -6.257, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3542, lng: -6.2538, speed: 45, type: 'location_update', penalty: 0 },
        { lat: 53.3564, lng: -6.2505, speed: 55, type: 'speeding', penalty: 10 },
        { lat: 53.3586, lng: -6.2472, speed: 40, type: 'speed_change', penalty: 0 },
        { lat: 53.3608, lng: -6.244, speed: 15, type: 'hard_brake', penalty: 5 },
        { lat: 53.363, lng: -6.2408, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3652, lng: -6.2375, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3674, lng: -6.2342, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.3515, lng: -6.262, speed: 25, type: 'location_update', penalty: 0 },
        { lat: 53.3532, lng: -6.2638, speed: 35, type: 'location_update', penalty: 0 },
        { lat: 53.3549, lng: -6.2655, speed: 40, type: 'location_update', penalty: 0 },
        { lat: 53.3566, lng: -6.2672, speed: 38, type: 'location_update', penalty: 0 },
        { lat: 53.3583, lng: -6.269, speed: 32, type: 'location_update', penalty: 0 },
        { lat: 53.36, lng: -6.2708, speed: 0, type: 'journey_end', penalty: 0 },
      ],
      [
        { lat: 53.3498, lng: -6.2603, speed: 0, type: 'journey_start', penalty: 0 },
        { lat: 53.352, lng: -6.258, speed: 30, type: 'location_update', penalty: 0 },
        { lat: 53.3545, lng: -6.2555, speed: 45, type: 'location_update', penalty: 0 },
        { lat: 53.357, lng: -6.253, speed: 50, type: 'location_update', penalty: 0 },
        { lat: 53.3595, lng: -6.2505, speed: 60, type: 'location_update', penalty: 0 },
        { lat: 53.362, lng: -6.248, speed: 65, type: 'speeding', penalty: 8 },
        { lat: 53.3645, lng: -6.2455, speed: 55, type: 'speed_change', penalty: 0 },
        { lat: 53.367, lng: -6.243, speed: 45, type: 'location_update', penalty: 0 },
        { lat: 53.3695, lng: -6.2405, speed: 25, type: 'hard_brake', penalty: 7 },
        { lat: 53.372, lng: -6.238, speed: 35, type: 'location_update', penalty: 0 },
        { lat: 53.3745, lng: -6.2355, speed: 40, type: 'location_update', penalty: 0 },
        { lat: 53.377, lng: -6.233, speed: 0, type: 'journey_end', penalty: 0 },
      ],
    ];

    for (let i = 0; i < journeyIds.length; i++) {
      const journeyId = journeyIds[i];
      const events = mockEvents[i] || [];
      const journey = mockJourneys[i];

      for (let j = 0; j < events.length; j++) {
        const event = events[j];
        const progress = j / (events.length - 1);
        const timestamp = journey.startTime + (journey.endTime - journey.startTime) * progress;

        await db.runAsync(
          `INSERT INTO events (journeyId, timestamp, type, latitude, longitude, speed, penalty) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [journeyId, timestamp, event.type, event.lat, event.lng, event.speed, event.penalty]
        );
      }
    }

    logger.info(
      `[JourneyService] Successfully seeded ${mockJourneys.length} mock journeys with ${mockEvents.reduce((sum, events) => sum + events.length, 0)} events.`
    );
  } catch (error) {
    logger.error('Error seeding mock data:', error);
  }
};
