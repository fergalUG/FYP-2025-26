import { eq, and } from 'drizzle-orm';
import { db, resetDatabase as resetDbSchema } from '../db/client';
import { journeys, events, settings } from '../db/schema';
import { EventType } from '@/types/db';
import type { ScoringStats } from '@/types/scoring';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.DB);

export const initDatabaseWithMockData = async (): Promise<void> => {
  try {
    logger.info('Ensuring database has mock data...');
    await seedMockData();
    logger.info('Database check complete!');
  } catch (error) {
    logger.error('Failed to initialize database with mock data:', error);
  }
};

// TESTING ONLY: Resets the database schema
export const resetDatabase = async (): Promise<void> => {
  try {
    logger.info('Resetting database schema...');
    await resetDbSchema();
    logger.info('Database reset successfully.');
  } catch (error) {
    logger.error('Error resetting database:', error);
  }
};

export const seedMockData = async (): Promise<void> => {
  try {
    const driverNameCheck = await db.select().from(settings).where(eq(settings.key, 'driverName'));

    if (driverNameCheck.length === 0) {
      logger.info('Seeding missing setting: driverName');
      await db.insert(settings).values({
        key: 'driverName',
        value: 'Test Driver',
      });
    }

    const now = Date.now();
    const day = 86400000;

    const mockJourneys = [
      {
        title: 'Morning Commute',
        date: new Date(now - day * 1).toISOString().split('T')[0],
        startTime: now - day * 1 - 3600000, // Yesterday 1 hour ago
        endTime: now - day * 1 - 3600000 + 1800000, // 30 mins duration
        distanceKm: 12.5,
        score: 94,
        stats: createMockStats(94, 1800000, 12.5),
        events: generateRouteEvents(53.3498, -6.2603, 30),
      },
      {
        title: 'Grocery Run',
        date: new Date(now - day * 2).toISOString().split('T')[0],
        startTime: now - day * 2 - 7200000,
        endTime: now - day * 2 - 7200000 + 900000, // 15 mins
        distanceKm: 3.2,
        score: 88,
        stats: createMockStats(88, 900000, 3.2),
        events: generateRouteEvents(53.34, -6.25, 15),
      },
      {
        title: 'Weekend Roadtrip',
        date: new Date(now - day * 5).toISOString().split('T')[0],
        startTime: now - day * 5 - 14400000,
        endTime: now - day * 5 - 14400000 + 7200000, // 2 hours
        distanceKm: 120.5,
        score: 72,
        stats: createMockStats(72, 7200000, 120.5, { harshBraking: 3, speeding: 2 }),
        events: generateRouteEvents(53.27, -9.05, 120),
      },
      {
        title: 'Late Night Drive',
        date: new Date(now - day * 6).toISOString().split('T')[0],
        startTime: now - day * 6 - 80000000,
        endTime: now - day * 6 - 80000000 + 1200000, // 20 mins
        distanceKm: 15.0,
        score: 45, // Bad score
        stats: createMockStats(45, 1200000, 15.0, { harshBraking: 5, harshAccel: 4, speeding: 5 }),
        events: generateRouteEvents(53.36, -6.24, 20),
      },
    ];

    for (const j of mockJourneys) {
      const existing = await db
        .select()
        .from(journeys)
        .where(and(eq(journeys.title, j.title), eq(journeys.date, j.date)));

      if (existing.length > 0) {
        continue;
      }

      logger.info(`Seeding missing journey: ${j.title} (${j.date})`);

      const result = await db
        .insert(journeys)
        .values({
          title: j.title,
          date: j.date,
          startTime: j.startTime,
          endTime: j.endTime,
          score: j.score,
          distanceKm: j.distanceKm,
          stats: j.stats,
        })
        .returning({ id: journeys.id });

      const journeyId = result[0].id;

      const duration = j.endTime - j.startTime;
      const eventCount = j.events.length;

      const eventsToInsert = j.events.map((evt, index) => {
        const progress = index / (eventCount - 1);
        return {
          journeyId: journeyId,
          timestamp: Math.floor(j.startTime + duration * progress),
          type: evt.type,
          latitude: evt.lat,
          longitude: evt.lng,
          speed: evt.speed,
        };
      });

      await db.insert(events).values(eventsToInsert);
    }
  } catch (error) {
    logger.error('Error seeding mock data:', error);
  }
};

// --- Helper Functions ---

const createMockStats = (
  score: number,
  durationMs: number,
  distanceKm: number,
  incidents: { harshBraking?: number; harshAccel?: number; speeding?: number } = {}
): ScoringStats => {
  const avgSpeed = distanceKm / (durationMs / 3600000);

  return {
    durationMs,
    score,
    avgScore: score + 2,
    blendedAvgScore: score,
    endScore: score,
    minScore: Math.max(0, score - 10),

    harshBrakingCount: incidents.harshBraking ?? 0,
    harshAccelerationCount: incidents.harshAccel ?? 0,
    sharpTurnCount: 0,

    moderateSpeedingEpisodeCount: incidents.speeding ?? 0,
    harshSpeedingEpisodeCount: 0,
    moderateSpeedingSeconds: (incidents.speeding ?? 0) * 15,
    harshSpeedingSeconds: 0,

    avgSpeed: parseFloat(avgSpeed.toFixed(1)),
    maxSpeed: parseFloat((avgSpeed * 1.5).toFixed(1)),
  };
};

const generateRouteEvents = (startLat: number, startLng: number, count: number) => {
  const evts = [];
  let currentLat = startLat;
  let currentLng = startLng;

  evts.push({ type: EventType.JourneyStart, lat: currentLat, lng: currentLng, speed: 0 });

  for (let i = 0; i < count; i++) {
    currentLat += (Math.random() - 0.5) * 0.002;
    currentLng += (Math.random() - 0.5) * 0.002;
    const speed = 30 + Math.random() * 40;

    evts.push({
      type: EventType.LocationUpdate,
      lat: currentLat,
      lng: currentLng,
      speed: Math.floor(speed),
    });
  }

  evts.push({ type: EventType.JourneyEnd, lat: currentLat, lng: currentLng, speed: 0 });
  return evts;
};
