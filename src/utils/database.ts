import { and, eq } from 'drizzle-orm';

import { db, resetDatabase as resetDbSchema } from '@db/client';
import { events, journeys } from '@db/schema';
import type { DrivingEventFamily, EventMetadata, EventSeverity } from '@/types/db';
import { EventType } from '@/types/db';
import type { ScoringStats } from '@/types/scoring';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.DB);

const DAY_MS = 86400000;
const SPEEDING_EPISODE_SECONDS = 24;

interface TierCounts {
  light: number;
  moderate: number;
  harsh: number;
}

interface IncidentProfile {
  braking: TierCounts;
  acceleration: TierCounts;
  cornering: TierCounts;
  stopAndGo: number;
  speedingEpisodes: TierCounts;
}

interface MockJourneySeed {
  title: string;
  date: string;
  startTime: number;
  endTime: number;
  distanceKm: number;
  score: number;
  stats: ScoringStats;
  events: MockEventSeed[];
}

interface RoutePoint {
  lat: number;
  lng: number;
  speedKmh: number;
  offsetMs: number;
}

interface MockEventSeed {
  type: EventType;
  lat: number;
  lng: number;
  speed: number;
  offsetMs: number;
  family?: DrivingEventFamily | null;
  severity?: EventSeverity | null;
  metadata?: EventMetadata | null;
}

interface IncidentEventSpec {
  kind: 'driving' | 'stop_and_go';
  ratio: number;
  family?: DrivingEventFamily;
  severity?: EventSeverity;
  speedKmh?: number;
}

interface CreateMockJourneyArgs {
  title: string;
  date: string;
  startTime: number;
  endTime: number;
  distanceKm: number;
  score: number;
  startLat: number;
  startLng: number;
  baseSpeedKmh: number;
  profile: IncidentProfile;
}

const severityScale: Record<EventSeverity, number> = {
  light: 1,
  moderate: 2,
  harsh: 3,
};

const speedingSeveritySpeedKmh: Record<EventSeverity, number> = {
  light: 94,
  moderate: 108,
  harsh: 126,
};

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
    await ensureEventsSchemaCompatibilityForMocks();

    const baseTime = new Date('2026-01-25T08:00:00.000Z').getTime();

    const mockJourneys: MockJourneySeed[] = [
      createMockJourney({
        title: 'Morning Commute (Tiered Demo)',
        date: '2026-01-30',
        startTime: baseTime + DAY_MS * 5 - 3600000,
        endTime: baseTime + DAY_MS * 5 - 3600000 + 1800000,
        distanceKm: 12.5,
        score: 94,
        startLat: 53.3498,
        startLng: -6.2603,
        baseSpeedKmh: 46,
        profile: {
          braking: { light: 2, moderate: 1, harsh: 0 },
          acceleration: { light: 2, moderate: 1, harsh: 0 },
          cornering: { light: 2, moderate: 1, harsh: 0 },
          stopAndGo: 1,
          speedingEpisodes: { light: 1, moderate: 0, harsh: 0 },
        },
      }),
      createMockJourney({
        title: 'Grocery Run (Tiered Demo)',
        date: '2026-01-29',
        startTime: baseTime + DAY_MS * 4 - 7200000,
        endTime: baseTime + DAY_MS * 4 - 7200000 + 900000,
        distanceKm: 3.2,
        score: 88,
        startLat: 53.34,
        startLng: -6.25,
        baseSpeedKmh: 32,
        profile: {
          braking: { light: 1, moderate: 1, harsh: 1 },
          acceleration: { light: 1, moderate: 1, harsh: 1 },
          cornering: { light: 1, moderate: 1, harsh: 1 },
          stopAndGo: 2,
          speedingEpisodes: { light: 1, moderate: 1, harsh: 0 },
        },
      }),
      createMockJourney({
        title: 'Weekend Roadtrip (Tiered Demo)',
        date: '2026-01-26',
        startTime: baseTime + DAY_MS - 14400000,
        endTime: baseTime + DAY_MS - 14400000 + 7200000,
        distanceKm: 120.5,
        score: 72,
        startLat: 53.27,
        startLng: -9.05,
        baseSpeedKmh: 84,
        profile: {
          braking: { light: 2, moderate: 2, harsh: 2 },
          acceleration: { light: 1, moderate: 2, harsh: 2 },
          cornering: { light: 1, moderate: 1, harsh: 2 },
          stopAndGo: 0,
          speedingEpisodes: { light: 1, moderate: 2, harsh: 2 },
        },
      }),
      createMockJourney({
        title: 'Late Night Drive (Tiered Demo)',
        date: '2026-01-25',
        startTime: baseTime - 28800000,
        endTime: baseTime - 28800000 + 1200000,
        distanceKm: 15.0,
        score: 45,
        startLat: 53.36,
        startLng: -6.24,
        baseSpeedKmh: 68,
        profile: {
          braking: { light: 1, moderate: 2, harsh: 4 },
          acceleration: { light: 1, moderate: 2, harsh: 3 },
          cornering: { light: 1, moderate: 1, harsh: 3 },
          stopAndGo: 1,
          speedingEpisodes: { light: 1, moderate: 1, harsh: 3 },
        },
      }),
    ];

    for (const journeySeed of mockJourneys) {
      const existing = await db
        .select()
        .from(journeys)
        .where(and(eq(journeys.title, journeySeed.title), eq(journeys.date, journeySeed.date)));

      if (existing.length > 0) {
        continue;
      }

      logger.info(`Seeding missing journey: ${journeySeed.title} (${journeySeed.date})`);

      const result = await db
        .insert(journeys)
        .values({
          title: journeySeed.title,
          date: journeySeed.date,
          startTime: journeySeed.startTime,
          endTime: journeySeed.endTime,
          score: journeySeed.score,
          distanceKm: journeySeed.distanceKm,
          stats: journeySeed.stats,
        })
        .returning({ id: journeys.id });

      const journeyId = result[0].id;
      const durationMs = Math.max(0, journeySeed.endTime - journeySeed.startTime);

      const eventsToInsert = journeySeed.events.map((evt) => ({
        journeyId,
        timestamp: journeySeed.startTime + Math.max(0, Math.min(durationMs, evt.offsetMs)),
        type: evt.type,
        latitude: evt.lat,
        longitude: evt.lng,
        speed: evt.speed,
        family: evt.family ?? null,
        severity: evt.severity ?? null,
        metadata: evt.metadata ?? null,
      }));

      await db.insert(events).values(eventsToInsert);
    }
  } catch (error) {
    logger.error('Error seeding mock data:', error);
  }
};

const ensureEventsSchemaCompatibilityForMocks = async (): Promise<void> => {
  const eventsSchemaCheck = await db
    .select({
      id: events.id,
      family: events.family,
      severity: events.severity,
      metadata: events.metadata,
    })
    .from(events)
    .limit(1)
    .catch(() => null);

  if (eventsSchemaCheck === null) {
    logger.warn('Detected legacy events schema while seeding mock data. Resetting local database.');
    await resetDbSchema();
  }
};

const createMockJourney = (args: CreateMockJourneyArgs): MockJourneySeed => {
  const durationMs = Math.max(0, args.endTime - args.startTime);
  return {
    title: args.title,
    date: args.date,
    startTime: args.startTime,
    endTime: args.endTime,
    distanceKm: args.distanceKm,
    score: args.score,
    stats: createMockStats(args.score, durationMs, args.distanceKm, args.profile),
    events: generateJourneyEvents(args.startLat, args.startLng, args.baseSpeedKmh, durationMs, args.profile),
  };
};

const createMockStats = (score: number, durationMs: number, distanceKm: number, profile: IncidentProfile): ScoringStats => {
  const avgSpeed = durationMs > 0 ? distanceKm / (durationMs / 3600000) : 0;
  const totalIncidents =
    profile.braking.light +
    profile.braking.moderate +
    profile.braking.harsh +
    profile.acceleration.light +
    profile.acceleration.moderate +
    profile.acceleration.harsh +
    profile.cornering.light +
    profile.cornering.moderate +
    profile.cornering.harsh +
    profile.stopAndGo;

  return {
    durationMs,
    score,
    avgScore: Math.min(100, score + 2),
    blendedAvgScore: Math.min(100, score + 1),
    endScore: Math.min(100, score + (score >= 80 ? 2 : 3)),
    minScore: Math.max(0, score - Math.max(8, Math.round(totalIncidents / 2))),

    harshBrakingCount: profile.braking.harsh,
    moderateBrakingCount: profile.braking.moderate,
    lightBrakingCount: profile.braking.light,
    harshAccelerationCount: profile.acceleration.harsh,
    moderateAccelerationCount: profile.acceleration.moderate,
    lightAccelerationCount: profile.acceleration.light,
    sharpTurnCount: profile.cornering.harsh,
    moderateTurnCount: profile.cornering.moderate,
    lightTurnCount: profile.cornering.light,
    stopAndGoCount: profile.stopAndGo,

    lightSpeedingEpisodeCount: profile.speedingEpisodes.light,
    moderateSpeedingEpisodeCount: profile.speedingEpisodes.moderate,
    harshSpeedingEpisodeCount: profile.speedingEpisodes.harsh,
    lightSpeedingSeconds: profile.speedingEpisodes.light * SPEEDING_EPISODE_SECONDS,
    moderateSpeedingSeconds: profile.speedingEpisodes.moderate * SPEEDING_EPISODE_SECONDS,
    harshSpeedingSeconds: profile.speedingEpisodes.harsh * SPEEDING_EPISODE_SECONDS,

    lightOscillationEpisodeCount: 0,
    moderateOscillationEpisodeCount: 0,
    harshOscillationEpisodeCount: 0,
    lightOscillationSeconds: 0,
    moderateOscillationSeconds: 0,
    harshOscillationSeconds: 0,

    avgSpeed: Number(avgSpeed.toFixed(1)),
    maxSpeed: Number((avgSpeed * 1.45).toFixed(1)),
  };
};

const generateJourneyEvents = (
  startLat: number,
  startLng: number,
  baseSpeedKmh: number,
  durationMs: number,
  profile: IncidentProfile
): MockEventSeed[] => {
  const routePoints = generateRoutePoints(startLat, startLng, baseSpeedKmh, durationMs);
  const routeEvents = buildRouteEvents(startLat, startLng, routePoints, durationMs);
  const incidentEvents = buildIncidentSpecs(profile, durationMs).map((spec) => buildIncidentEvent(spec, routePoints, durationMs));

  return [...routeEvents, ...incidentEvents].sort((a, b) => {
    if (a.offsetMs !== b.offsetMs) return a.offsetMs - b.offsetMs;
    return getEventSortPriority(a.type) - getEventSortPriority(b.type);
  });
};

const generateRoutePoints = (startLat: number, startLng: number, baseSpeedKmh: number, durationMs: number): RoutePoint[] => {
  const pointCount = Math.max(90, Math.round(durationMs / 10000));
  const points: RoutePoint[] = [];

  let currentLat = startLat;
  let currentLng = startLng;

  for (let i = 1; i <= pointCount; i += 1) {
    const progress = i / pointCount;
    const latDrift = 0.00022 + Math.sin(progress * Math.PI * 4) * 0.00012;
    const lngDrift = 0.00018 + Math.cos(progress * Math.PI * 3) * 0.0001;
    currentLat += latDrift;
    currentLng += lngDrift;

    const speedWave = Math.sin(progress * Math.PI * 6) * 10 + Math.cos(progress * Math.PI * 2) * 4;
    const speedKmh = Math.max(8, baseSpeedKmh + speedWave);

    points.push({
      lat: Number(currentLat.toFixed(6)),
      lng: Number(currentLng.toFixed(6)),
      speedKmh: Number(speedKmh.toFixed(1)),
      offsetMs: Math.floor(progress * durationMs),
    });
  }

  return points;
};

const buildRouteEvents = (startLat: number, startLng: number, routePoints: RoutePoint[], durationMs: number): MockEventSeed[] => {
  const routeEvents: MockEventSeed[] = [
    {
      type: EventType.JourneyStart,
      lat: Number(startLat.toFixed(6)),
      lng: Number(startLng.toFixed(6)),
      speed: 0,
      offsetMs: 0,
    },
  ];

  routeEvents.push(
    ...routePoints.map((point) => ({
      type: EventType.LocationUpdate,
      lat: point.lat,
      lng: point.lng,
      speed: point.speedKmh,
      offsetMs: point.offsetMs,
    }))
  );

  const endPoint = routePoints[routePoints.length - 1] ?? { lat: startLat, lng: startLng };
  routeEvents.push({
    type: EventType.JourneyEnd,
    lat: endPoint.lat,
    lng: endPoint.lng,
    speed: 0,
    offsetMs: durationMs,
  });

  return routeEvents;
};

const buildIncidentSpecs = (profile: IncidentProfile, durationMs: number): IncidentEventSpec[] => {
  const specs: IncidentEventSpec[] = [];

  pushDrivingFamilySpecs(specs, 'braking', profile.braking, 0.08, 0.26);
  pushDrivingFamilySpecs(specs, 'acceleration', profile.acceleration, 0.26, 0.44);
  pushDrivingFamilySpecs(specs, 'cornering', profile.cornering, 0.44, 0.62);
  pushStopAndGoSpecs(specs, profile.stopAndGo, 0.18, 0.9);
  pushSpeedingEpisodeSpecs(specs, profile.speedingEpisodes, durationMs, 0.66, 0.95);

  return specs;
};

const pushDrivingFamilySpecs = (
  specs: IncidentEventSpec[],
  family: DrivingEventFamily,
  counts: TierCounts,
  startRatio: number,
  endRatio: number
): void => {
  const span = Math.max(0.001, endRatio - startRatio);
  const lightRangeEnd = startRatio + span / 3;
  const moderateRangeEnd = startRatio + (span * 2) / 3;

  for (const ratio of createRatios(counts.light, startRatio, lightRangeEnd)) {
    specs.push({ kind: 'driving', ratio, family, severity: 'light' });
  }
  for (const ratio of createRatios(counts.moderate, lightRangeEnd, moderateRangeEnd)) {
    specs.push({ kind: 'driving', ratio, family, severity: 'moderate' });
  }
  for (const ratio of createRatios(counts.harsh, moderateRangeEnd, endRatio)) {
    specs.push({ kind: 'driving', ratio, family, severity: 'harsh' });
  }
};

const pushStopAndGoSpecs = (specs: IncidentEventSpec[], count: number, startRatio: number, endRatio: number): void => {
  for (const ratio of createRatios(count, startRatio, endRatio)) {
    specs.push({ kind: 'stop_and_go', ratio, speedKmh: 0 });
  }
};

const pushSpeedingEpisodeSpecs = (
  specs: IncidentEventSpec[],
  counts: TierCounts,
  durationMs: number,
  startRatio: number,
  endRatio: number
): void => {
  const span = Math.max(0.001, endRatio - startRatio);
  const lightRangeEnd = startRatio + span / 3;
  const moderateRangeEnd = startRatio + (span * 2) / 3;
  const sampleGapRatio = Math.max(0.001, Math.min(0.012, 12000 / Math.max(1, durationMs)));

  const pushEpisodeSamples = (severity: EventSeverity, centerRatios: number[]) => {
    for (const center of centerRatios) {
      specs.push({
        kind: 'driving',
        family: 'speeding',
        severity,
        ratio: clamp(center - sampleGapRatio, 0.02, 0.98),
        speedKmh: speedingSeveritySpeedKmh[severity],
      });
      specs.push({
        kind: 'driving',
        family: 'speeding',
        severity,
        ratio: clamp(center, 0.02, 0.98),
        speedKmh: speedingSeveritySpeedKmh[severity],
      });
      specs.push({
        kind: 'driving',
        family: 'speeding',
        severity,
        ratio: clamp(center + sampleGapRatio, 0.02, 0.98),
        speedKmh: speedingSeveritySpeedKmh[severity],
      });
    }
  };

  pushEpisodeSamples('light', createRatios(counts.light, startRatio, lightRangeEnd));
  pushEpisodeSamples('moderate', createRatios(counts.moderate, lightRangeEnd, moderateRangeEnd));
  pushEpisodeSamples('harsh', createRatios(counts.harsh, moderateRangeEnd, endRatio));
};

const createRatios = (count: number, startRatio: number, endRatio: number): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [clamp((startRatio + endRatio) / 2, 0.01, 0.99)];

  const step = (endRatio - startRatio) / (count + 1);
  return Array.from({ length: count }, (_, index) => clamp(startRatio + step * (index + 1), 0.01, 0.99));
};

const buildIncidentEvent = (spec: IncidentEventSpec, routePoints: RoutePoint[], durationMs: number): MockEventSeed => {
  const anchor = getRoutePointByRatio(routePoints, spec.ratio);
  const offsetMs = Math.max(1, Math.min(durationMs - 1, Math.floor(spec.ratio * durationMs)));
  const speedKmh = Number((spec.speedKmh ?? anchor.speedKmh).toFixed(1));

  if (spec.kind === 'stop_and_go') {
    return {
      type: EventType.StopAndGo,
      lat: anchor.lat,
      lng: anchor.lng,
      speed: spec.speedKmh ?? 0,
      offsetMs,
      family: null,
      severity: null,
      metadata: null,
    };
  }

  const family = spec.family;
  const severity = spec.severity;
  if (!family || !severity) {
    throw new Error('Invalid mock driving event spec: family and severity are required.');
  }

  return {
    type: EventType.DrivingEvent,
    lat: anchor.lat,
    lng: anchor.lng,
    speed: speedKmh,
    offsetMs,
    family,
    severity,
    metadata: buildDrivingMetadata(family, severity, speedKmh),
  };
};

const getRoutePointByRatio = (routePoints: RoutePoint[], ratio: number): RoutePoint => {
  const clampedRatio = clamp(ratio, 0, 1);
  const index = Math.min(routePoints.length - 1, Math.max(0, Math.round((routePoints.length - 1) * clampedRatio)));
  return routePoints[index];
};

const buildDrivingMetadata = (family: DrivingEventFamily, severity: EventSeverity, speedKmh: number): EventMetadata => {
  const scale = severityScale[severity];
  const speedBand = getSpeedBandLabel(speedKmh);

  if (family === 'speeding') {
    return {
      speedKmh: Number(speedKmh.toFixed(1)),
      speedBand,
    };
  }

  if (family === 'cornering') {
    const baseForce = 0.12 + scale * 0.12;
    const baseHeading = 6 + scale * 6;
    return {
      speedBand,
      horizontalForceG: Number(baseForce.toFixed(3)),
      headingChangeDeg: Number(baseHeading.toFixed(3)),
      speedChangeRateKmhPerSec: Number((1.5 * scale).toFixed(3)),
    };
  }

  const baseForce = 0.08 + scale * 0.08;
  const baseRate = 4 + scale * 2.5;
  const signedRate = family === 'braking' ? -baseRate : baseRate;

  return {
    speedBand,
    horizontalForceG: Number(baseForce.toFixed(3)),
    speedChangeRateKmhPerSec: Number(signedRate.toFixed(3)),
  };
};

const getSpeedBandLabel = (speedKmh: number): 'low' | 'mid' | 'high' | 'very_high' => {
  if (speedKmh < 20) return 'low';
  if (speedKmh < 50) return 'mid';
  if (speedKmh < 80) return 'high';
  return 'very_high';
};

const getEventSortPriority = (type: EventType): number => {
  if (type === EventType.JourneyStart) return 0;
  if (type === EventType.LocationUpdate) return 1;
  if (type === EventType.DrivingEvent || type === EventType.StopAndGo) return 2;
  return 3;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
