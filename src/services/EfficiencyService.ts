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
import { createLogger, isDebugEnabled, LogModule } from '@utils/logger';
import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import { convertMsToKmh, type SpeedConfidence, type SpeedSource } from '@utils/gpsValidation';
import {
  getAccelerationForceThreshold,
  getAccelerationSpeedChangeThreshold,
  getBrakingForceThreshold,
  getBrakingSpeedChangeThreshold,
  getCorneringForceThreshold,
  getCorneringHeadingThreshold,
} from '@utils/tracking/dynamicThresholds';
import { resolveSpeedBand } from '@utils/tracking/thresholdBands';
import type { SpeedBand } from '@/types/tracking';

const logger = createLogger(LogModule.EfficiencyService);

// TODO: Map the speed thresholds to actual speed limits using a Maps API
const SPEEDING_THRESHOLD_HIGH_KMH = 120;
const SPEEDING_THRESHOLD_MEDIUM_KMH = 100;

const MIN_SPEED_FOR_EVENTS_KMH = 10;
const MIN_SPEED_FOR_HEADING_KMH = 15;
const HEADING_LOOKBACK_TIME_MS = 2000;
const CORNERING_EVENT_COOLDOWN_MS = 5000;
const SUSTAINED_FORCE_DURATION_MS = 500;
const HARSH_EVENT_COOLDOWN_MS = 4000;

// stop and go detection constants
const STOP_GO_STOP_SPEED_KMH = 4;
const STOP_GO_GO_SPEED_KMH = 10;
const STOP_GO_STOP_DWELL_MS = 4000;
const STOP_GO_GO_DWELL_MS = 4000;
const STOP_GO_WINDOW_MS = 120000;
const STOP_GO_MIN_CYCLES = 3;
const STOP_GO_EVENT_COOLDOWN_MS = 30000;

const MOTION_BUFFER_SIZE = 25; // 500ms at 50Hz polling rate on sensors
const HEADING_HISTORY_SIZE = 5;
const DEBUG_SUMMARY_INTERVAL_MS = 1000;

export const createEfficiencyServiceController = (deps: EfficiencyServiceDeps): EfficiencyServiceController => {
  //tracking
  let isTracking = false;

  //gps
  let lastLocation: Location.LocationObject | null = null;
  let lastLocationProcessedAtMs: number | null = null;
  let lastSpeedMs: number | null = null;
  let lastLocationSpeedChangeRateKmhPerSec: number | null = null;

  // cornering
  let lastCornerEventTime = 0;
  let lastBrakingEventTime: number | null = null;
  let lastAccelerationEventTime: number | null = null;
  let highForceStartTime: number | null = null;
  let headingHistory: Array<{ heading: number; timestamp: number }> = [];

  //validation
  let lastSpeedConfidence: SpeedConfidence = 'none';
  let lastSpeedSource: SpeedSource = 'none';
  let currentSpeedBand: SpeedBand | null = null;

  //motion
  let motionDataBuffer: MotionData[] = [];
  let motionDataBufferSum = 0;

  //debug
  let lastDebugSummaryTime = 0;
  let lastDebugEnabled = false;

  //stop and go
  let stopGoPhase: 'moving' | 'stopped' | 'unknown' = 'unknown';
  let stopGoStopCandidateStart: number | null = null;
  let stopGoGoCandidateStart: number | null = null;
  let stopGoCycleTimestamps: number[] = [];
  let lastStopGoEventTime = 0;

  const buildDebugSummary = () => ({
    motionUpdates: 0,
    skipped: {
      notTracking: 0,
      noLocation: 0,
      speedUnavailable: 0,
      speedTooLow: 0,
      noBand: 0,
    },
    braking: {
      samples: 0,
      rejectedRate: 0,
      rejectedForce: 0,
      rejectedCooldown: 0,
      triggered: 0,
    },
    acceleration: {
      samples: 0,
      rejectedRate: 0,
      rejectedForce: 0,
      rejectedCooldown: 0,
      triggered: 0,
    },
    cornering: {
      samples: 0,
      rejectedCooldown: 0,
      rejectedForce: 0,
      rejectedSustain: 0,
      rejectedSpeedChange: 0,
      rejectedHeading: 0,
      triggered: 0,
    },
    stopAndGo: {
      phase: 'unknown' as 'moving' | 'stopped' | 'unknown',
      cycleCount: 0,
      lastEventTime: 0,
      timeSinceLastEvent: 0,
      stopCandidateStart: 0,
      goCandidateStart: 0,
      triggered: 0,
    },
    last: {
      speedKmh: null as number | null,
      speedChangeRate: null as number | null,
      horizontalForce: null as number | null,
      avgHorizontalForce: null as number | null,
      headingChange: null as number | null,
      speedBand: null as SpeedBand | null,
    },
  });

  let debugSummary = buildDebugSummary();

  const resetDebugSummary = () => {
    debugSummary = buildDebugSummary();
  };

  const resetStopGoCandidates = () => {
    stopGoStopCandidateStart = null;
    stopGoGoCandidateStart = null;
  };

  const resetStopGoState = () => {
    stopGoPhase = 'unknown';
    stopGoStopCandidateStart = null;
    stopGoGoCandidateStart = null;
    stopGoCycleTimestamps = [];
    lastStopGoEventTime = 0;
  };

  const emitDebugSummary = (now: number) => {
    if (!isDebugEnabled()) {
      return;
    }
    if (now - lastDebugSummaryTime < DEBUG_SUMMARY_INTERVAL_MS) {
      return;
    }
    lastDebugSummaryTime = now;
    deps.logger.debug('Motion summary (1s)', debugSummary);
    resetDebugSummary();
  };

  const handleStopAndGo = async (speedKmh: number, now: number, latitude: number, longitude: number): Promise<void> => {
    if (isDebugEnabled()) {
      debugSummary.stopAndGo.phase = stopGoPhase;
      debugSummary.stopAndGo.cycleCount = stopGoCycleTimestamps.length;
      debugSummary.stopAndGo.lastEventTime = lastStopGoEventTime;
      debugSummary.stopAndGo.timeSinceLastEvent = lastStopGoEventTime ? now - lastStopGoEventTime : 0;
      debugSummary.stopAndGo.stopCandidateStart = stopGoStopCandidateStart ?? 0;
      debugSummary.stopAndGo.goCandidateStart = stopGoGoCandidateStart ?? 0;
    }

    if (speedKmh <= STOP_GO_STOP_SPEED_KMH) {
      stopGoGoCandidateStart = null;

      if (stopGoPhase !== 'stopped') {
        if (stopGoStopCandidateStart === null) {
          stopGoStopCandidateStart = now;
        } else if (now - stopGoStopCandidateStart >= STOP_GO_STOP_DWELL_MS) {
          stopGoPhase = 'stopped';
          stopGoStopCandidateStart = null;
        }
      }
      return;
    }

    if (speedKmh >= STOP_GO_GO_SPEED_KMH) {
      stopGoStopCandidateStart = null;

      if (stopGoPhase !== 'moving') {
        if (stopGoGoCandidateStart === null) {
          stopGoGoCandidateStart = now;
        } else if (now - stopGoGoCandidateStart >= STOP_GO_GO_DWELL_MS) {
          if (stopGoPhase === 'stopped') {
            stopGoCycleTimestamps.push(now);
            stopGoCycleTimestamps = stopGoCycleTimestamps.filter((ts) => now - ts <= STOP_GO_WINDOW_MS);

            if (stopGoCycleTimestamps.length >= STOP_GO_MIN_CYCLES && now - lastStopGoEventTime >= STOP_GO_EVENT_COOLDOWN_MS) {
              await deps.JourneyService.logEvent(EventType.StopAndGo, latitude, longitude, speedKmh);
              deps.logger.info(`stop_and_go detected: ${stopGoCycleTimestamps.length} cycles in ${STOP_GO_WINDOW_MS / 1000}s`);
              lastStopGoEventTime = now;
              stopGoCycleTimestamps = [];
              if (isDebugEnabled()) {
                debugSummary.stopAndGo.triggered += 1;
              }
            }
          }

          stopGoPhase = 'moving';
          stopGoGoCandidateStart = null;
        }
      }
      return;
    }

    resetStopGoCandidates();
    stopGoPhase = 'unknown';
  };

  const resolveBand = (speedKmh: number): SpeedBand => {
    currentSpeedBand = resolveSpeedBand(speedKmh, currentSpeedBand, 3);
    return currentSpeedBand;
  };

  const checkSpeeding = async (latitude: number, longitude: number, speedKmh: number): Promise<void> => {
    let eventType: EventType | null = null;

    if (speedKmh > SPEEDING_THRESHOLD_HIGH_KMH) {
      eventType = EventType.HarshSpeeding;
    } else if (speedKmh > SPEEDING_THRESHOLD_MEDIUM_KMH) {
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

    headingHistory = headingHistory.filter((h) => now - h.timestamp < HEADING_LOOKBACK_TIME_MS);
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

  const checkBrakingAndAcceleration = async (
    data: MotionData,
    location: Location.LocationObject,
    speedKmh: number,
    band: SpeedBand,
    debugEnabled: boolean
  ): Promise<void> => {
    const horizontalForce = data.horizontalMagnitude;
    const currentTime = deps.now();
    const speedChangeRate = lastLocationSpeedChangeRateKmhPerSec;
    if (speedChangeRate === null || !Number.isFinite(speedChangeRate)) {
      return;
    }

    const brakeForceThreshold = getBrakingForceThreshold(band);
    const brakeSpeedChangeThreshold = getBrakingSpeedChangeThreshold(band);
    const accelForceThreshold = getAccelerationForceThreshold(band);
    const accelSpeedChangeThreshold = getAccelerationSpeedChangeThreshold(band);

    if (debugEnabled) {
      debugSummary.last.speedKmh = speedKmh;
      debugSummary.last.speedChangeRate = speedChangeRate;
      debugSummary.last.horizontalForce = horizontalForce;
      debugSummary.last.speedBand = band;
    }

    let eventType: EventType | null = null;

    if (speedChangeRate < brakeSpeedChangeThreshold && horizontalForce >= brakeForceThreshold) {
      eventType = EventType.HarshBraking;
    } else if (speedChangeRate > accelSpeedChangeThreshold && horizontalForce >= accelForceThreshold) {
      eventType = EventType.HarshAcceleration;
    }

    if (debugEnabled) {
      if (speedChangeRate < 0) {
        debugSummary.braking.samples += 1;
        if (speedChangeRate < brakeSpeedChangeThreshold) {
          if (horizontalForce >= brakeForceThreshold) {
            debugSummary.braking.triggered += 1;
          } else {
            debugSummary.braking.rejectedForce += 1;
          }
        } else {
          debugSummary.braking.rejectedRate += 1;
        }
      } else if (speedChangeRate > 0) {
        debugSummary.acceleration.samples += 1;
        if (speedChangeRate > accelSpeedChangeThreshold) {
          if (horizontalForce >= accelForceThreshold) {
            debugSummary.acceleration.triggered += 1;
          } else {
            debugSummary.acceleration.rejectedForce += 1;
          }
        } else {
          debugSummary.acceleration.rejectedRate += 1;
        }
      }
    }

    if (!eventType) {
      return;
    }

    if (
      eventType === EventType.HarshBraking &&
      lastBrakingEventTime !== null &&
      currentTime - lastBrakingEventTime < HARSH_EVENT_COOLDOWN_MS
    ) {
      if (debugEnabled) {
        debugSummary.braking.rejectedCooldown += 1;
      }
      return;
    }

    if (
      eventType === EventType.HarshAcceleration &&
      lastAccelerationEventTime !== null &&
      currentTime - lastAccelerationEventTime < HARSH_EVENT_COOLDOWN_MS
    ) {
      if (debugEnabled) {
        debugSummary.acceleration.rejectedCooldown += 1;
      }
      return;
    }

    if (eventType === EventType.HarshBraking) {
      lastBrakingEventTime = currentTime;
    } else if (eventType === EventType.HarshAcceleration) {
      lastAccelerationEventTime = currentTime;
    }
    await deps.JourneyService.logEvent(eventType, location.coords.latitude, location.coords.longitude, speedKmh);
    deps.logger.info(
      `${eventType} detected: ${horizontalForce.toFixed(2)}g horizontal force, speed change: ${speedChangeRate.toFixed(1)} km/h/s`
    );
  };

  const checkHarshCornering = async (
    data: MotionData,
    location: Location.LocationObject,
    speedKmh: number,
    band: SpeedBand,
    debugEnabled: boolean
  ): Promise<void> => {
    const currentTime = deps.now();

    if (currentTime - lastCornerEventTime < CORNERING_EVENT_COOLDOWN_MS) {
      if (debugEnabled) {
        debugSummary.cornering.rejectedCooldown += 1;
      }
      return;
    }

    const avgHorizontalForce = motionDataBuffer.length > 0 ? motionDataBufferSum / motionDataBuffer.length : data.horizontalMagnitude;

    const corneringForceThreshold = getCorneringForceThreshold(band);

    if (avgHorizontalForce >= corneringForceThreshold) {
      if (highForceStartTime === null) {
        highForceStartTime = currentTime;
        if (debugEnabled) {
          debugSummary.cornering.rejectedSustain += 1;
        }
        return;
      }

      const duration = currentTime - highForceStartTime;
      if (duration < SUSTAINED_FORCE_DURATION_MS) {
        if (debugEnabled) {
          debugSummary.cornering.rejectedSustain += 1;
        }
        return;
      }
    } else {
      highForceStartTime = null;
      if (debugEnabled) {
        debugSummary.cornering.rejectedForce += 1;
      }
      return;
    }

    const speedChangeRate = lastLocationSpeedChangeRateKmhPerSec !== null ? Math.abs(lastLocationSpeedChangeRateKmhPerSec) : null;
    if (speedChangeRate !== null && speedChangeRate > 10) {
      if (debugEnabled) {
        debugSummary.cornering.rejectedSpeedChange += 1;
      }
      return;
    }

    if (speedKmh >= MIN_SPEED_FOR_HEADING_KMH && headingHistory.length >= 2) {
      const headingChange = calculateMaxHeadingChange(currentTime);
      const headingThreshold = getCorneringHeadingThreshold(band);
      if (debugEnabled) {
        debugSummary.cornering.samples += 1;
        debugSummary.last.avgHorizontalForce = avgHorizontalForce;
        debugSummary.last.headingChange = headingChange;
        debugSummary.last.speedBand = band;
      }
      if (headingChange < headingThreshold) {
        deps.logger.debug(
          `Filtered harsh_cornering: Sustained force (${avgHorizontalForce.toFixed(2)}g) but only ${headingChange.toFixed(
            1
          )}° heading change`
        );
        if (debugEnabled) {
          debugSummary.cornering.rejectedHeading += 1;
        }
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
      if (debugEnabled) {
        debugSummary.cornering.triggered += 1;
      }
      return;
    }
  };

  const handleMotionUpdate = async (data: MotionData): Promise<void> => {
    const debugEnabled = isDebugEnabled();
    if (debugEnabled !== lastDebugEnabled) {
      lastDebugEnabled = debugEnabled;
      resetDebugSummary();
      lastDebugSummaryTime = deps.now();
    }
    if (debugEnabled) {
      debugSummary.motionUpdates += 1;
    }

    if (!isTracking) {
      if (debugEnabled) {
        debugSummary.skipped.notTracking += 1;
        emitDebugSummary(deps.now());
      }
      return;
    }
    if (!lastLocation) {
      deps.logger.warn('Motion update received but no last location available.');
      if (debugEnabled) {
        debugSummary.skipped.noLocation += 1;
        emitDebugSummary(deps.now());
      }
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

    const speedMs = lastSpeedMs;
    if (speedMs === null || lastSpeedSource === 'none' || lastSpeedConfidence === 'low' || lastSpeedConfidence === 'none') {
      if (debugEnabled) {
        debugSummary.skipped.speedUnavailable += 1;
        emitDebugSummary(deps.now());
      }
      return;
    }

    const speedKmh = convertMsToKmh(speedMs);
    if (speedKmh <= MIN_SPEED_FOR_EVENTS_KMH) {
      if (debugEnabled) {
        debugSummary.skipped.speedTooLow += 1;
        emitDebugSummary(deps.now());
      }
      return;
    }

    const band = currentSpeedBand;
    if (!band) {
      if (debugEnabled) {
        debugSummary.skipped.noBand += 1;
        emitDebugSummary(deps.now());
      }
      return;
    }
    await checkBrakingAndAcceleration(data, lastLocation, speedKmh, band, debugEnabled);
    await checkHarshCornering(data, lastLocation, speedKmh, band, debugEnabled);
    if (debugEnabled) {
      emitDebugSummary(deps.now());
    }
  };

  const startTracking = (): void => {
    if (isTracking) {
      return;
    }

    isTracking = true;
    lastLocation = null;
    lastLocationProcessedAtMs = null;
    lastSpeedMs = null;
    lastLocationSpeedChangeRateKmhPerSec = null;
    lastSpeedConfidence = 'none';
    lastSpeedSource = 'none';
    lastCornerEventTime = 0;
    lastBrakingEventTime = null;
    lastAccelerationEventTime = null;
    highForceStartTime = null;
    headingHistory = [];
    motionDataBuffer = [];
    motionDataBufferSum = 0;
    currentSpeedBand = null;
    resetDebugSummary();
    lastDebugSummaryTime = deps.now();
    lastDebugEnabled = isDebugEnabled();
    resetStopGoState();

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
    lastLocationProcessedAtMs = null;
    lastSpeedMs = null;
    lastLocationSpeedChangeRateKmhPerSec = null;
    lastSpeedConfidence = 'none';
    lastSpeedSource = 'none';
    lastCornerEventTime = 0;
    lastBrakingEventTime = null;
    lastAccelerationEventTime = null;
    highForceStartTime = null;
    headingHistory = [];
    motionDataBuffer = [];
    motionDataBufferSum = 0;
    currentSpeedBand = null;
    resetDebugSummary();
    lastDebugSummaryTime = deps.now();
    lastDebugEnabled = isDebugEnabled();
    resetStopGoState();

    deps.VehicleMotion.removeAllListeners('onMotionUpdate');
    deps.VehicleMotion.stopTracking();
    deps.logger.info('Stopped tracking.');
  };

  const processLocation = async (location: Location.LocationObject, options: ProcessLocationOptions): Promise<void> => {
    if (!isTracking) {
      return;
    }

    const { latitude, longitude, heading } = location.coords;
    const speedMs = options.speedMs;
    const speedConfidence = options.speedConfidence;
    const speedSource = options.speedSource;
    const isSpeedValid = Number.isFinite(speedMs) && speedMs >= 0;

    const speedKmh = convertMsToKmh(speedMs);
    const currentTime = deps.now();

    currentSpeedBand = isSpeedValid ? resolveBand(speedKmh) : null;

    const previousSpeedKmh = typeof lastSpeedMs === 'number' && Number.isFinite(lastSpeedMs) ? convertMsToKmh(lastSpeedMs) : null;
    const previousLocationTimestamp = lastLocation?.timestamp ?? null;
    const previousProcessedAtMs = lastLocationProcessedAtMs;
    if (isSpeedValid && previousSpeedKmh !== null && previousLocationTimestamp !== null) {
      let locationDeltaSeconds = (location.timestamp - previousLocationTimestamp) / 1000;
      if (locationDeltaSeconds <= 0.1 && previousProcessedAtMs !== null) {
        const wallClockDeltaSeconds = (currentTime - previousProcessedAtMs) / 1000;
        if (wallClockDeltaSeconds > locationDeltaSeconds) {
          locationDeltaSeconds = wallClockDeltaSeconds;
        }
      }
      if (locationDeltaSeconds > 0.1) {
        lastLocationSpeedChangeRateKmhPerSec = (speedKmh - previousSpeedKmh) / locationDeltaSeconds;
      } else {
        lastLocationSpeedChangeRateKmhPerSec = null;
      }
    } else {
      lastLocationSpeedChangeRateKmhPerSec = null;
    }

    if (isSpeedValid) {
      await handleStopAndGo(speedKmh, currentTime, latitude, longitude);
      if (speedConfidence !== 'low') {
        await checkSpeeding(latitude, longitude, speedKmh);
      } else {
        deps.logger.debug('Skipping speeding check due to low speed confidence', {
          speedKmh: speedKmh.toFixed(1),
          speedConfidence,
        });
      }
    } else {
      resetStopGoCandidates();
    }

    if (isSpeedValid) {
      lastSpeedMs = speedMs;
      lastSpeedConfidence = speedConfidence;
      lastSpeedSource = speedSource;
    }

    if (heading !== null && heading !== -1 && isSpeedValid && speedKmh >= MIN_SPEED_FOR_HEADING_KMH) {
      headingHistory.push({ heading, timestamp: currentTime });
      headingHistory = headingHistory.filter((h) => currentTime - h.timestamp < HEADING_LOOKBACK_TIME_MS);
      if (headingHistory.length > HEADING_HISTORY_SIZE) {
        headingHistory.shift();
      }
    } else if (!isSpeedValid || speedKmh < MIN_SPEED_FOR_HEADING_KMH) {
      headingHistory = [];
    }

    lastLocationProcessedAtMs = currentTime;
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
