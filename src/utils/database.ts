import { eq, and } from 'drizzle-orm';
import { db, resetDatabase as resetDbSchema } from '../db/client';
import { journeys, events } from '../db/schema';
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
    const baseTime = new Date('2026-01-25T08:00:00.000Z').getTime();
    const day = 86400000;

    const mockJourneys = [
      {
        title: 'Morning Commute',
        date: '2026-01-30',
        startTime: baseTime + day * 5 - 3600000, // Jan 30, 07:00
        endTime: baseTime + day * 5 - 3600000 + 1800000, // 07:00-07:30, 30 mins
        distanceKm: 12.5,
        score: 94,
        stats: createMockStats(94, 1800000, 12.5),
        events: generateRouteEvents(53.3498, -6.2603, 30),
      },
      {
        title: 'Grocery Run',
        date: '2026-01-29',
        startTime: baseTime + day * 4 - 7200000, // Jan 29, 06:00
        endTime: baseTime + day * 4 - 7200000 + 900000, // 06:00-06:15, 15 mins
        distanceKm: 3.2,
        score: 88,
        stats: createMockStats(88, 900000, 3.2),
        events: generateRouteEvents(53.34, -6.25, 15),
      },
      {
        title: 'Weekend Roadtrip',
        date: '2026-01-26',
        startTime: baseTime + day * 1 - 14400000, // Jan 26, 04:00
        endTime: baseTime + day * 1 - 14400000 + 7200000, // 04:00-06:00, 2 hours
        distanceKm: 120.5,
        score: 72,
        stats: createMockStats(72, 7200000, 120.5, { harshBraking: 3, speeding: 2 }),
        events: generateRouteEvents(53.27, -9.05, 120),
      },
      {
        title: 'Late Night Drive',
        date: '2026-01-25',
        startTime: baseTime - 28800000, // Jan 25, 00:00 (midnight)
        endTime: baseTime - 28800000 + 1200000, // 00:00-00:20, 20 mins
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
  incidents: { harshBraking?: number; harshAccel?: number; speeding?: number; stopAndGo?: number } = {}
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
    moderateBrakingCount: 0,
    lightBrakingCount: 0,
    harshAccelerationCount: incidents.harshAccel ?? 0,
    moderateAccelerationCount: 0,
    lightAccelerationCount: 0,
    sharpTurnCount: 0,
    moderateTurnCount: 0,
    lightTurnCount: 0,
    stopAndGoCount: incidents.stopAndGo ?? 0,

    lightSpeedingEpisodeCount: 0,
    moderateSpeedingEpisodeCount: incidents.speeding ?? 0,
    harshSpeedingEpisodeCount: 0,
    lightSpeedingSeconds: 0,
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
