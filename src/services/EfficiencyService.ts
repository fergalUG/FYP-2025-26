import type * as Location from 'expo-location';

import VehicleMotion from '@modules/vehicle-motion';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';

import { EventType, type EfficiencyServiceController, type EfficiencyServiceDeps, type ScoringStats } from '@types';
import { JourneyService } from '@services/JourneyService';
import { createLogger, LogModule } from '@utils/logger';
import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';

const logger = createLogger(LogModule.EfficiencyService);

// TODO: Map the speed thresholds to actual speed limits using a Maps API
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

const MOTION_BUFFER_SIZE = 10;
const HEADING_HISTORY_SIZE = 5;

const convertMsToKmh = (speedMs: number): number => speedMs * 3.6;

export const createEfficiencyServiceController = (deps: EfficiencyServiceDeps): EfficiencyServiceController => {
  let isTracking = false;
  let lastLocation: Location.LocationObject | null = null;
  let lastSpeedKmh = 0;
  let lastSpeedUpdateTime = 0;
  let headingHistory: Array<{ heading: number; timestamp: number }> = [];
  let motionDataBuffer: MotionData[] = [];

  const checkSpeeding = async (latitude: number, longitude: number, speedKmh: number): Promise<void> => {
    let eventType: EventType | null = null;

    if (speedKmh > SPEEDING_THRESHOLD_HIGH) {
      eventType = EventType.HarshSpeeding;
    } else if (speedKmh > SPEEDING_THRESHOLD_MEDIUM) {
      eventType = EventType.ModerateSpeeding;
    }

    if (eventType) {
      await deps.JourneyService.logEvent(eventType, latitude, longitude, speedKmh);
      deps.logger.info(`${eventType} detected: ${speedKmh.toFixed(1)} km/h`);
    }
  };

  const calculateMaxHeadingChange = (now: number): number => {
    if (headingHistory.length < 2) {
      return 0;
    }

    headingHistory = headingHistory.filter((h) => now - h.timestamp < HEADING_LOOKBACK_TIME);
    if (headingHistory.length < 2) {
      return 0;
    }

    const oldestHeading = headingHistory[0].heading;
    const newestHeading = headingHistory[headingHistory.length - 1].heading;

    let delta = Math.abs(newestHeading - oldestHeading);
    if (delta > 180) {
      delta = 360 - delta;
    }

    return delta;
  };

  const checkBrakingAndAcceleration = async (data: MotionData, location: Location.LocationObject, speedKmh: number): Promise<void> => {
    const horizontalForce = data.horizontalMagnitude;
    const currentTime = deps.now();
    const timeDeltaSeconds = (currentTime - lastSpeedUpdateTime) / 1000;

    if (timeDeltaSeconds < 0.1) {
      return;
    }

    const speedChange = speedKmh - lastSpeedKmh;
    const speedChangeRate = speedChange / timeDeltaSeconds;

    let eventType: EventType | null = null;

    if (speedChangeRate < HARD_BRAKE_SPEED_CHANGE && horizontalForce >= HARD_BRAKE_FORCE_THRESHOLD) {
      eventType = EventType.HarshBraking;
    } else if (speedChangeRate > HARD_ACCELERATION_SPEED_CHANGE && horizontalForce >= HARD_ACCELERATION_FORCE_THRESHOLD) {
      eventType = EventType.HarshAcceleration;
    }

    if (!eventType) {
      return;
    }

    await deps.JourneyService.logEvent(eventType, location.coords.latitude, location.coords.longitude, speedKmh);
    deps.logger.info(
      `${eventType} detected: ${horizontalForce.toFixed(2)}g horizontal force, speed change: ${speedChangeRate.toFixed(1)} km/h/s`
    );
  };

  const checkHarshCornering = async (data: MotionData, location: Location.LocationObject, speedKmh: number): Promise<void> => {
    const horizontalForce = data.horizontalMagnitude;

    if (horizontalForce < HARSH_CORNERING_THRESHOLD) {
      return;
    }

    const currentTime = deps.now();
    const timeDeltaSeconds = (currentTime - lastSpeedUpdateTime) / 1000;

    if (timeDeltaSeconds >= 0.1) {
      const speedChange = speedKmh - lastSpeedKmh;
      const speedChangeRate = Math.abs(speedChange / timeDeltaSeconds);
      if (speedChangeRate > 10) {
        return;
      }
    }

    if (speedKmh >= MIN_SPEED_FOR_HEADING && headingHistory.length >= 2) {
      const headingChange = calculateMaxHeadingChange(currentTime);
      if (headingChange < MIN_HEADING_CHANGE_FOR_CORNER) {
        deps.logger.info(
          `Filtered harsh_cornering: ${horizontalForce.toFixed(2)}g force but only ${headingChange.toFixed(1)}° heading change`
        );
        return;
      }

      await deps.JourneyService.logEvent(EventType.SharpTurn, location.coords.latitude, location.coords.longitude, speedKmh);
      deps.logger.info(
        `harsh_cornering detected: ${horizontalForce.toFixed(2)}g force, ${headingChange.toFixed(1)}° turn, speed: ${speedKmh.toFixed(1)} km/h`
      );
      return;
    }

    if (horizontalForce > HARSH_CORNERING_THRESHOLD * 1.2) {
      await deps.JourneyService.logEvent(EventType.SharpTurn, location.coords.latitude, location.coords.longitude, speedKmh);
      deps.logger.info(
        `harsh_cornering detected (no GPS validation): ${horizontalForce.toFixed(2)}g force, speed: ${speedKmh.toFixed(1)} km/h`
      );
    }
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
    if (speedKmh <= MIN_SPEED_FOR_EVENTS) {
      return;
    }

    await checkBrakingAndAcceleration(data, lastLocation, speedKmh);
    await checkHarshCornering(data, lastLocation, speedKmh);
  };

  const startTracking = (): void => {
    if (isTracking) {
      return;
    }

    isTracking = true;
    lastLocation = null;
    lastSpeedKmh = 0;
    lastSpeedUpdateTime = 0;
    headingHistory = [];
    motionDataBuffer = [];

    deps.VehicleMotion.startTracking();
    deps.VehicleMotion.addListener('onMotionUpdate', handleMotionUpdate);
    deps.logger.info('Started tracking.');
  };

  const stopTracking = (): void => {
    if (!isTracking) {
      return;
    }

    isTracking = false;
    lastLocation = null;
    lastSpeedKmh = 0;
    lastSpeedUpdateTime = 0;
    headingHistory = [];
    motionDataBuffer = [];

    deps.VehicleMotion.removeAllListeners('onMotionUpdate');
    deps.VehicleMotion.stopTracking();
    deps.logger.info('Stopped tracking.');
  };

  const processLocation = async (location: Location.LocationObject): Promise<void> => {
    if (!isTracking) {
      return;
    }

    const { latitude, longitude, speed, heading } = location.coords;
    const speedKmh = convertMsToKmh(speed ?? 0);
    const currentTime = deps.now();

    await checkSpeeding(latitude, longitude, speedKmh);

    if (lastLocation) {
      lastSpeedKmh = convertMsToKmh(lastLocation.coords.speed ?? 0);
    }
    lastSpeedUpdateTime = currentTime;

    if (heading !== null && heading !== -1 && speedKmh >= MIN_SPEED_FOR_HEADING) {
      headingHistory.push({ heading, timestamp: currentTime });
      headingHistory = headingHistory.filter((h) => currentTime - h.timestamp < HEADING_LOOKBACK_TIME);
      if (headingHistory.length > HEADING_HISTORY_SIZE) {
        headingHistory.shift();
      }
    }

    lastLocation = location;
  };

  const calculateJourneyScore = async (journeyId: number, distanceKm: number = 0): Promise<number> => {
    try {
      const events = await deps.JourneyService.getEventsByJourneyId(journeyId);
      return calculateEfficiencyScore(events, distanceKm).score;
    } catch (error) {
      deps.logger.error('Error calculating journey score:', error);
      return 0;
    }
  };

  const getJourneyEfficiencyStats = async (journeyId: number, distanceKm: number = 0): Promise<ScoringStats | null> => {
    try {
      const events = await deps.JourneyService.getEventsByJourneyId(journeyId);
      return calculateEfficiencyScore(events, distanceKm).stats;
    } catch (error) {
      deps.logger.error('Error getting efficiency stats:', error);
      return null;
    }
  };

  return {
    startTracking,
    stopTracking,
    processLocation,
    calculateJourneyScore,
    getJourneyEfficiencyStats,
  };
};

export const EfficiencyService = createEfficiencyServiceController({
  JourneyService,
  VehicleMotion,
  now: () => Date.now(),
  logger,
});
