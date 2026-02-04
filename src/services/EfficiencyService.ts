import type * as Location from 'expo-location';

import VehicleMotion from '@modules/vehicle-motion';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';

import {
  EventType,
  type EfficiencyServiceController,
  type EfficiencyServiceDeps,
  type ProcessLocationOptions,
  type ScoringStats,
} from '@types';
import { JourneyService } from '@services/JourneyService';
import { createLogger, LogModule } from '@utils/logger';
import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import { convertMsToKmh, type SpeedConfidence, validateGpsSpeed } from '@utils/gpsValidation';
import { createSpeedSmoother } from '@utils/tracking/speedSmoother';
import { SPEED_BUFFER_SIZE } from '@constants/gpsConfig';

const logger = createLogger(LogModule.EfficiencyService);

// TODO: Map the speed thresholds to actual speed limits using a Maps API
const SPEEDING_THRESHOLD_HIGH = 120; // km/h (these are placeholders for now)
const SPEEDING_THRESHOLD_MEDIUM = 100; // km/h

const getBrakingForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.45;
  if (speedKmh < 50) return 0.4;
  if (speedKmh < 80) return 0.35;
  return 0.3;
};

const getBrakingSpeedChangeThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return -22;
  if (speedKmh < 50) return -18;
  if (speedKmh < 80) return -14;
  return -12;
};

const getAccelerationForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.32;
  if (speedKmh < 50) return 0.28;
  if (speedKmh < 80) return 0.26;
  return 0.24;
};

const getAccelerationSpeedChangeThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 15;
  if (speedKmh < 50) return 12;
  if (speedKmh < 80) return 9;
  return 7;
};

const getCorneringForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.65;
  if (speedKmh < 50) return 0.55;
  if (speedKmh < 80) return 0.5;
  return 0.45;
};

const getCorneringHeadingThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 35;
  if (speedKmh < 50) return 25;
  if (speedKmh < 80) return 20;
  return 15;
};

const MIN_SPEED_FOR_EVENTS = 10; // km/h
const MIN_SPEED_FOR_HEADING = 15; // km/h - minimum speed for reliable GPS heading
const HEADING_LOOKBACK_TIME = 2000; // ms - look back this far for heading changes
const CORNERING_EVENT_COOLDOWN_MS = 5000; // ms - prevent multiple events for the same turn
const SUSTAINED_FORCE_DURATION_MS = 500; // ms - force must be sustained for this long

const MOTION_BUFFER_SIZE = 25; // 500ms at 50Hz polling rate on sensors
const HEADING_HISTORY_SIZE = 5;

export const createEfficiencyServiceController = (deps: EfficiencyServiceDeps): EfficiencyServiceController => {
  let isTracking = false;
  let lastLocation: Location.LocationObject | null = null;
  let lastSpeedKmh = 0;
  let lastSpeedUpdateTime = 0;
  let lastCornerEventTime = 0;
  let highForceStartTime: number | null = null;
  let headingHistory: Array<{ heading: number; timestamp: number }> = [];
  let motionDataBuffer: MotionData[] = [];
  let motionDataBufferSum = 0;
  const speedSmoother = createSpeedSmoother(SPEED_BUFFER_SIZE);

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

    const brakeForceThreshold = getBrakingForceThreshold(speedKmh);
    const brakeSpeedChangeThreshold = getBrakingSpeedChangeThreshold(speedKmh);
    const accelForceThreshold = getAccelerationForceThreshold(speedKmh);
    const accelSpeedChangeThreshold = getAccelerationSpeedChangeThreshold(speedKmh);

    let eventType: EventType | null = null;

    if (speedChangeRate < brakeSpeedChangeThreshold && horizontalForce >= brakeForceThreshold) {
      eventType = EventType.HarshBraking;
    } else if (speedChangeRate > accelSpeedChangeThreshold && horizontalForce >= accelForceThreshold) {
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
    const currentTime = deps.now();

    if (currentTime - lastCornerEventTime < CORNERING_EVENT_COOLDOWN_MS) {
      return;
    }

    const avgHorizontalForce = motionDataBuffer.length > 0 ? motionDataBufferSum / motionDataBuffer.length : data.horizontalMagnitude;

    const corneringForceThreshold = getCorneringForceThreshold(speedKmh);

    if (avgHorizontalForce >= corneringForceThreshold) {
      if (highForceStartTime === null) {
        highForceStartTime = currentTime;
        return;
      }

      const duration = currentTime - highForceStartTime;
      if (duration < SUSTAINED_FORCE_DURATION_MS) {
        return;
      }
    } else {
      highForceStartTime = null;
      return;
    }

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
      const headingThreshold = getCorneringHeadingThreshold(speedKmh);
      if (headingChange < headingThreshold) {
        deps.logger.info(
          `Filtered harsh_cornering: Sustained force (${avgHorizontalForce.toFixed(2)}g) but only ${headingChange.toFixed(
            1
          )}° heading change`
        );
        return;
      }

      lastCornerEventTime = currentTime;
      highForceStartTime = null;
      await deps.JourneyService.logEvent(EventType.SharpTurn, location.coords.latitude, location.coords.longitude, speedKmh);
      deps.logger.info(
        `harsh_cornering detected: ${avgHorizontalForce.toFixed(2)}g sustained force, ${headingChange.toFixed(
          1
        )}° turn, speed: ${speedKmh.toFixed(1)} km/h`
      );
      return;
    }
  };

  const handleMotionUpdate = async (data: MotionData): Promise<void> => {
    if (!isTracking || !lastLocation) {
      return;
    }

    motionDataBuffer.push(data);
    motionDataBufferSum += data.horizontalMagnitude;

    if (motionDataBuffer.length > MOTION_BUFFER_SIZE) {
      const removed = motionDataBuffer.shift();
      if (removed) {
        motionDataBufferSum -= removed.horizontalMagnitude;
      }
    }

    const validatedSpeed = validateGpsSpeed(lastLocation.coords.speed, lastLocation.coords.accuracy);
    const speedKmh = convertMsToKmh(validatedSpeed.value);

    if (!validatedSpeed.isValid || speedKmh <= MIN_SPEED_FOR_EVENTS) {
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
    lastCornerEventTime = 0;
    highForceStartTime = null;
    headingHistory = [];
    motionDataBuffer = [];
    motionDataBufferSum = 0;
    speedSmoother.reset();

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
    lastCornerEventTime = 0;
    highForceStartTime = null;
    headingHistory = [];
    motionDataBuffer = [];
    motionDataBufferSum = 0;
    speedSmoother.reset();

    deps.VehicleMotion.removeAllListeners('onMotionUpdate');
    deps.VehicleMotion.stopTracking();
    deps.logger.info('Stopped tracking.');
  };

  const processLocation = async (location: Location.LocationObject, options?: ProcessLocationOptions): Promise<void> => {
    if (!isTracking) {
      return;
    }

    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const hasSpeedOverride = typeof options?.speedMs === 'number';
    let speedMs = hasSpeedOverride ? (options?.speedMs ?? 0) : (speed ?? 0);
    let speedConfidence: SpeedConfidence = hasSpeedOverride ? (options?.speedConfidence ?? 'medium') : 'none';
    let isSpeedValid = hasSpeedOverride ? Number.isFinite(speedMs) && speedMs >= 0 : false;

    if (!hasSpeedOverride) {
      const validatedSpeed = validateGpsSpeed(speed, accuracy);
      speedMs = validatedSpeed.value;
      speedConfidence = validatedSpeed.confidence;
      isSpeedValid = validatedSpeed.isValid;

      if (validatedSpeed.isValid) {
        const smoothed = speedSmoother.addSample(validatedSpeed.value, validatedSpeed.confidence, validatedSpeed.source);
        speedMs = smoothed.speedMs;
        speedConfidence = smoothed.confidence;
      }
    }

    const speedKmh = convertMsToKmh(speedMs);
    const currentTime = deps.now();

    if (isSpeedValid && speedConfidence !== 'low') {
      await checkSpeeding(latitude, longitude, speedKmh);
    }

    if (lastLocation && isSpeedValid) {
      const lastSpeedMs = lastLocation.coords.speed;
      if (typeof lastSpeedMs === 'number' && Number.isFinite(lastSpeedMs)) {
        lastSpeedKmh = convertMsToKmh(lastSpeedMs);
      }
    }
    lastSpeedUpdateTime = currentTime;

    if (heading !== null && heading !== -1 && isSpeedValid && speedKmh >= MIN_SPEED_FOR_HEADING) {
      headingHistory.push({ heading, timestamp: currentTime });
      headingHistory = headingHistory.filter((h) => currentTime - h.timestamp < HEADING_LOOKBACK_TIME);
      if (headingHistory.length > HEADING_HISTORY_SIZE) {
        headingHistory.shift();
      }
    } else if (!isSpeedValid || speedKmh < MIN_SPEED_FOR_HEADING) {
      headingHistory = [];
    }

    lastLocation = { ...location, coords: { ...location.coords, speed: speedMs } };
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
