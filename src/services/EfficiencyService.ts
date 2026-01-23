import * as Location from 'expo-location';
import VehicleMotion from '../../modules/vehicle-motion';
import type { MotionData } from '../../modules/vehicle-motion/src/VehicleMotion.types';
import * as JourneyService from './JourneyService';
import { EventType, ScoringStats } from '../types';
import { createLogger, LogModule } from '../utils/logger';

const logger = createLogger(LogModule.EfficiencyService);

const SPEEDING_THRESHOLD_HIGH = 120; // km/h (these are placeholders for now)
const SPEEDING_THRESHOLD_MEDIUM = 100; // km/h

const HARD_BRAKE_FORCE_THRESHOLD = 0.4; // g-force threshold for harsh braking
const HARD_BRAKE_SPEED_CHANGE = -18; // km/h/s - rapid deceleration

const HARD_ACCELERATION_FORCE_THRESHOLD = 0.28; // g-force threshold for harsh acceleration
const HARD_ACCELERATION_SPEED_CHANGE = 12; // km/h/s - rapid acceleration

const HARSH_CORNERING_THRESHOLD = 0.4; // g-force threshold for lateral acceleration
const MIN_SPEED_FOR_EVENTS = 10; // km/h
const MIN_HEADING_CHANGE_FOR_CORNER = 15; // degrees - minimum heading change to confirm a turn
const MIN_SPEED_FOR_HEADING = 15; // km/h - minimum speed for reliable GPS heading
const HEADING_LOOKBACK_TIME = 2000; // ms - look back this far for heading changes

let isTracking = false;
let lastLocation: Location.LocationObject | null = null;
let lastSpeedKmh = 0;
let lastSpeedUpdateTime = 0;
let lastHeading: number | null = null;
let headingHistory: Array<{ heading: number; timestamp: number }> = [];
let motionDataBuffer: MotionData[] = [];
const MOTION_BUFFER_SIZE = 10;
const HEADING_HISTORY_SIZE = 5;

export const startTracking = (): void => {
  if (isTracking) {
    return;
  }

  isTracking = true;
  lastLocation = null;
  lastSpeedKmh = 0;
  lastSpeedUpdateTime = 0;
  lastHeading = null;
  headingHistory = [];
  motionDataBuffer = [];

  VehicleMotion.startTracking();
  VehicleMotion.addListener('onMotionUpdate', handleMotionUpdate);

  logger.info('Started tracking.');
};

export const stopTracking = (): void => {
  if (!isTracking) {
    return;
  }

  isTracking = false;
  lastLocation = null;
  lastSpeedKmh = 0;
  lastSpeedUpdateTime = 0;
  lastHeading = null;
  headingHistory = [];
  motionDataBuffer = [];

  VehicleMotion.removeAllListeners('onMotionUpdate');
  VehicleMotion.stopTracking();

  logger.info('Stopped tracking.');
};

export const processLocation = async (location: Location.LocationObject): Promise<void> => {
  if (!isTracking) {
    return;
  }

  const { latitude, longitude, speed, heading } = location.coords;
  const speedKmh = convertMsToKmh(speed ?? 0);
  const currentTime = Date.now();

  await checkSpeeding(latitude, longitude, speedKmh);

  lastSpeedKmh = speedKmh;
  lastSpeedUpdateTime = currentTime;

  if (heading !== null && heading !== -1 && speedKmh >= MIN_SPEED_FOR_HEADING) {
    headingHistory.push({ heading, timestamp: currentTime });

    headingHistory = headingHistory.filter((h) => currentTime - h.timestamp < HEADING_LOOKBACK_TIME);

    if (headingHistory.length > HEADING_HISTORY_SIZE) {
      headingHistory.shift();
    }

    lastHeading = heading;
  }

  lastLocation = location;
};

const handleMotionUpdate = async (data: MotionData): Promise<void> => {
  if (!isTracking || !lastLocation) {
    return;
  }

  motionDataBuffer.push(data);
  if (motionDataBuffer.length > MOTION_BUFFER_SIZE) {
    motionDataBuffer.shift();
  }

  const speedKmh = convertMsToKmh(lastLocation.coords.speed ?? 0);

  if (speedKmh > MIN_SPEED_FOR_EVENTS) {
    await checkBrakingAndAcceleration(data, lastLocation, speedKmh);
    await checkHarshCornering(data, lastLocation, speedKmh);
  }
};

const checkSpeeding = async (latitude: number, longitude: number, speedKmh: number): Promise<void> => {
  let penalty = 0;
  let eventType = '';

  if (speedKmh > SPEEDING_THRESHOLD_HIGH) {
    eventType = EventType.HarshSpeeding;
    penalty = 1;
  } else if (speedKmh > SPEEDING_THRESHOLD_MEDIUM) {
    eventType = EventType.ModerateSpeeding;
    penalty = 1;
  }

  if (penalty > 0) {
    await JourneyService.logEvent(eventType, latitude, longitude, speedKmh, penalty);
    logger.info(`${eventType} detected: ${speedKmh.toFixed(1)} km/h, penalty: ${penalty}`);
  }
};

const checkBrakingAndAcceleration = async (data: MotionData, location: Location.LocationObject, speedKmh: number): Promise<void> => {
  const horizontalForce = data.horizontalMagnitude;

  const currentTime = Date.now();
  const timeDeltaSeconds = (currentTime - lastSpeedUpdateTime) / 1000;

  if (timeDeltaSeconds < 0.1) {
    return;
  }

  const speedChange = speedKmh - lastSpeedKmh;
  const speedChangeRate = speedChange / timeDeltaSeconds;

  let eventType = '';
  let penalty = 0;

  if (speedChangeRate < HARD_BRAKE_SPEED_CHANGE && horizontalForce >= HARD_BRAKE_FORCE_THRESHOLD) {
    eventType = EventType.HarshBraking;
    penalty = 1;
  } else if (speedChangeRate > HARD_ACCELERATION_SPEED_CHANGE && horizontalForce >= HARD_ACCELERATION_FORCE_THRESHOLD) {
    eventType = EventType.HarshAcceleration;
    penalty = 1;
  }

  if (penalty > 0) {
    await JourneyService.logEvent(eventType, location.coords.latitude, location.coords.longitude, speedKmh, penalty);
    logger.info(
      `${eventType} detected: ${horizontalForce.toFixed(2)}g horizontal force, speed change: ${speedChangeRate.toFixed(1)} km/h/s, penalty: ${penalty}`
    );
  }
};

const checkHarshCornering = async (data: MotionData, location: Location.LocationObject, speedKmh: number): Promise<void> => {
  const horizontalForce = data.horizontalMagnitude;

  if (horizontalForce < HARSH_CORNERING_THRESHOLD) {
    return;
  }

  const currentTime = Date.now();
  const timeDeltaSeconds = (currentTime - lastSpeedUpdateTime) / 1000;

  if (timeDeltaSeconds >= 0.1) {
    const speedChange = speedKmh - lastSpeedKmh;
    const speedChangeRate = Math.abs(speedChange / timeDeltaSeconds);

    if (speedChangeRate > 10) {
      return;
    }
  }

  if (speedKmh >= MIN_SPEED_FOR_HEADING && headingHistory.length >= 2) {
    const headingChange = calculateMaxHeadingChange();

    if (headingChange < MIN_HEADING_CHANGE_FOR_CORNER) {
      logger.info(`Filtered harsh_cornering: ${horizontalForce.toFixed(2)}g force but only ${headingChange.toFixed(1)}° heading change`);
      return;
    }

    await JourneyService.logEvent(EventType.SharpTurn, location.coords.latitude, location.coords.longitude, speedKmh, 1);
    logger.info(
      `harsh_cornering detected: ${horizontalForce.toFixed(2)}g force, ${headingChange.toFixed(1)}° turn, speed: ${speedKmh.toFixed(1)} km/h, penalty: 1`
    );
  } else {
    if (horizontalForce > HARSH_CORNERING_THRESHOLD * 1.2) {
      await JourneyService.logEvent(EventType.SharpTurn, location.coords.latitude, location.coords.longitude, speedKmh, 1);
      logger.info(
        `harsh_cornering detected (no GPS validation): ${horizontalForce.toFixed(2)}g force, speed: ${speedKmh.toFixed(1)} km/h, penalty: 1`
      );
    }
  }
};

const calculateMaxHeadingChange = (): number => {
  if (headingHistory.length < 2) {
    return 0;
  }

  let maxChange = 0;

  const oldestHeading = headingHistory[0].heading;
  const newestHeading = headingHistory[headingHistory.length - 1].heading;

  let delta = Math.abs(newestHeading - oldestHeading);
  if (delta > 180) {
    delta = 360 - delta;
  }

  maxChange = delta;

  return maxChange;
};

export const calculateJourneyScore = async (journeyId: number): Promise<number> => {
  try {
    const events = await JourneyService.getEventsByJourneyId(journeyId);

    if (events.length === 0) {
      return 100;
    }

    const totalPenalty = events.reduce((sum, event) => sum + (event.penalty || 0), 0);

    const score = Math.max(0, Math.min(100, 100 - totalPenalty));

    return Math.round(score);
  } catch (error) {
    logger.error('Error calculating journey score:', error);
    return 0;
  }
};

export const getJourneyEfficiencyStats = async (journeyId: number) => {
  try {
    const events = await JourneyService.getEventsByJourneyId(journeyId);

    const stats: ScoringStats = {
      totalEvents: events.length,
      totalPenalty: 0,
      hardBrakeCount: 0,
      hardAccelerationCount: 0,
      harshCorneringCount: 0,
      moderateSpeedingCount: 0,
      harshSpeedingCount: 0,
    };

    events.forEach((event) => {
      stats.totalPenalty += event.penalty || 0;

      switch (event.type) {
        case EventType.HarshBraking:
          stats.hardBrakeCount += 1;
          break;
        case EventType.HarshAcceleration:
          stats.hardAccelerationCount += 1;
          break;
        case EventType.SharpTurn:
          stats.harshCorneringCount += 1;
          break;
        case EventType.ModerateSpeeding:
          stats.moderateSpeedingCount += 1;
          break;
        case EventType.HarshSpeeding:
          stats.harshSpeedingCount += 1;
          break;
      }
    });

    return stats;
  } catch (error) {
    logger.error('Error getting efficiency stats:', error);
    return null;
  }
};

const convertMsToKmh = (speedMs: number): number => {
  return speedMs * 3.6;
};
