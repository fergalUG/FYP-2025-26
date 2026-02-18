import type * as Location from 'expo-location';

import VehicleMotion from '@modules/vehicle-motion';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import {
  createAccelerationDetector,
  createBrakingDetector,
  createCorneringDetector,
  createOscillationDetector,
  createSpeedingDetector,
} from '@services/detectors';

import {
  EventType,
  type EfficiencyServiceController,
  type EfficiencyServiceDeps,
  type ProcessLocationOptions,
  type ScoringStats,
  type DrivingEventFamily,
  type EventSeverity,
} from '@types';
import { JourneyService } from '@services/JourneyService';
import { createLogger, isDebugEnabled, LogModule } from '@utils/logger';
import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import { convertMsToKmh, type SpeedConfidence, type SpeedSource } from '@utils/gpsValidation';
import { resolveSpeedBand } from '@utils/tracking/thresholdBands';
import type { SpeedBand } from '@/types/tracking';

const logger = createLogger(LogModule.EfficiencyService);

const MIN_SPEED_FOR_EVENTS_KMH = 10;
const MIN_SPEED_FOR_HEADING_KMH = 15;
const HEADING_LOOKBACK_TIME_MS = 2000;

// stop and go detection constants
const STOP_GO_STOP_SPEED_KMH = 4;
const STOP_GO_GO_SPEED_KMH = 10;
const STOP_GO_STOP_DWELL_MS = 4000;
const STOP_GO_GO_DWELL_MS = 4000;
const STOP_GO_WINDOW_MS = 120000;
const STOP_GO_MIN_CYCLES = 3;
const STOP_GO_EVENT_COOLDOWN_MS = 30000;

const HEADING_HISTORY_SIZE = 5;
const DEBUG_SUMMARY_INTERVAL_MS = 1000;

export const createEfficiencyServiceController = (deps: EfficiencyServiceDeps): EfficiencyServiceController => {
  //tracking
  let isTracking = false;

  //gps
  let lastLocation: Location.LocationObject | null = null;
  let lastLocationProcessedAtMs: number | null = null;
  let lastSpeedMs: number | null = null;
  let lastEventSpeedMs: number | null = null;
  let lastLocationSpeedChangeRateKmhPerSec: number | null = null;

  // cornering
  let headingHistory: Array<{ heading: number; timestamp: number }> = [];

  //validation
  let lastSpeedConfidence: SpeedConfidence = 'none';
  let lastSpeedSource: SpeedSource = 'none';
  let currentSpeedBand: SpeedBand | null = null;

  //debug
  let lastDebugSummaryTime = 0;
  let lastDebugEnabled = false;

  //stop and go
  let stopGoPhase: 'moving' | 'stopped' | 'unknown' = 'unknown';
  let stopGoStopCandidateStart: number | null = null;
  let stopGoGoCandidateStart: number | null = null;
  let stopGoCycleTimestamps: number[] = [];
  let lastStopGoEventTime = 0;

  const brakingDetector = createBrakingDetector();
  const accelerationDetector = createAccelerationDetector();
  const corneringDetector = createCorneringDetector();
  const speedingDetector = createSpeedingDetector();
  const oscillationDetector = createOscillationDetector();

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

  const isStopGoSuppressionActive = (): boolean => {
    return stopGoPhase === 'stopped' || stopGoStopCandidateStart !== null || stopGoGoCandidateStart !== null;
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

  const logDrivingEvent = async (
    family: DrivingEventFamily,
    severity: EventSeverity,
    location: Location.LocationObject,
    speedKmh: number,
    metadata?: Record<string, string | number | boolean>
  ): Promise<void> => {
    await deps.JourneyService.logEvent(EventType.DrivingEvent, location.coords.latitude, location.coords.longitude, speedKmh, {
      family,
      severity,
      metadata: metadata ?? null,
    });
    deps.logger.info(`${family} detected (${severity})`, {
      speedKmh: Number(speedKmh.toFixed(2)),
      ...(metadata ?? {}),
    });
  };

  const checkSpeeding = async (location: Location.LocationObject, speedKmh: number): Promise<void> => {
    const severity = speedingDetector.detect(speedKmh);
    if (!severity) {
      return;
    }

    await logDrivingEvent('speeding', severity, location, speedKmh, {
      speedKmh: Number(speedKmh.toFixed(2)),
    });
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

    if (debugEnabled) {
      debugSummary.last.speedKmh = speedKmh;
      debugSummary.last.speedChangeRate = speedChangeRate;
      debugSummary.last.horizontalForce = horizontalForce;
      debugSummary.last.speedBand = band;
    }

    const context = {
      nowMs: currentTime,
      speedKmh,
      speedBand: band,
      speedChangeRateKmhPerSec: speedChangeRate,
      horizontalForceG: horizontalForce,
    };

    if (speedChangeRate < 0) {
      if (debugEnabled) {
        debugSummary.braking.samples += 1;
      }
      const brakingResult = brakingDetector.detect(context);
      if (!brakingResult.detected || !brakingResult.severity) {
        if (debugEnabled) {
          if (brakingResult.reason === 'rate') {
            debugSummary.braking.rejectedRate += 1;
          } else if (brakingResult.reason === 'force') {
            debugSummary.braking.rejectedForce += 1;
          } else if (brakingResult.reason === 'cooldown') {
            debugSummary.braking.rejectedCooldown += 1;
          }
        }
        return;
      }

      if (debugEnabled) {
        debugSummary.braking.triggered += 1;
      }
      await logDrivingEvent('braking', brakingResult.severity, location, speedKmh, {
        speedBand: band,
        ...(brakingResult.metadata ?? {}),
      });
      return;
    }

    if (speedChangeRate > 0) {
      if (debugEnabled) {
        debugSummary.acceleration.samples += 1;
      }
      const accelerationResult = accelerationDetector.detect(context);
      if (!accelerationResult.detected || !accelerationResult.severity) {
        if (debugEnabled) {
          if (accelerationResult.reason === 'rate') {
            debugSummary.acceleration.rejectedRate += 1;
          } else if (accelerationResult.reason === 'force') {
            debugSummary.acceleration.rejectedForce += 1;
          } else if (accelerationResult.reason === 'cooldown') {
            debugSummary.acceleration.rejectedCooldown += 1;
          }
        }
        return;
      }

      if (debugEnabled) {
        debugSummary.acceleration.triggered += 1;
      }
      await logDrivingEvent('acceleration', accelerationResult.severity, location, speedKmh, {
        speedBand: band,
        ...(accelerationResult.metadata ?? {}),
      });
    }
  };

  const checkCornering = async (
    data: MotionData,
    location: Location.LocationObject,
    speedKmh: number,
    band: SpeedBand,
    debugEnabled: boolean
  ): Promise<void> => {
    const currentTime = deps.now();
    const speedChangeRate = lastLocationSpeedChangeRateKmhPerSec;
    if (speedChangeRate === null || !Number.isFinite(speedChangeRate)) {
      return;
    }

    const headingChange =
      speedKmh >= MIN_SPEED_FOR_HEADING_KMH && headingHistory.length >= 2 ? calculateMaxHeadingChange(currentTime) : null;
    const corneringResult = corneringDetector.detect({
      nowMs: currentTime,
      speedKmh,
      speedBand: band,
      speedChangeRateKmhPerSec: speedChangeRate,
      horizontalForceG: data.horizontalMagnitude,
      headingChangeDeg: headingChange,
    });

    if (debugEnabled) {
      debugSummary.cornering.samples += 1;
      debugSummary.last.avgHorizontalForce = data.horizontalMagnitude;
      debugSummary.last.headingChange = headingChange;
      debugSummary.last.speedBand = band;
    }

    if (!corneringResult.detected || !corneringResult.severity) {
      if (debugEnabled) {
        if (corneringResult.reason === 'force') {
          debugSummary.cornering.rejectedForce += 1;
        } else if (corneringResult.reason === 'heading' || corneringResult.reason === 'missing_heading') {
          debugSummary.cornering.rejectedHeading += 1;
        } else if (corneringResult.reason === 'speed_change') {
          debugSummary.cornering.rejectedSpeedChange += 1;
        } else if (corneringResult.reason === 'cooldown') {
          debugSummary.cornering.rejectedCooldown += 1;
        }
      }
      return;
    }

    if (debugEnabled) {
      debugSummary.cornering.triggered += 1;
    }

    await logDrivingEvent('cornering', corneringResult.severity, location, speedKmh, {
      speedBand: band,
      ...(corneringResult.metadata ?? {}),
    });
  };

  const checkOscillation = async (
    location: Location.LocationObject,
    speedKmh: number,
    band: SpeedBand,
    speedConfidence: SpeedConfidence,
    now: number
  ): Promise<void> => {
    const oscillationResult = oscillationDetector.detect({
      nowMs: now,
      speedKmh,
      speedBand: band,
      speedChangeRateKmhPerSec: lastLocationSpeedChangeRateKmhPerSec,
      speedReliable: speedConfidence === 'high' || speedConfidence === 'medium',
      suppressed: isStopGoSuppressionActive(),
    });

    if (!oscillationResult.detected || !oscillationResult.severity) {
      return;
    }

    await logDrivingEvent('oscillation', oscillationResult.severity, location, speedKmh, {
      speedBand: band,
      ...(oscillationResult.metadata ?? {}),
    });
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

    const now = deps.now();
    if (isTracking && Number.isFinite(data.horizontalMagnitude) && data.horizontalMagnitude >= 0) {
      oscillationDetector.addForceSample(now, data.horizontalMagnitude);
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
    await checkCornering(data, lastLocation, speedKmh, band, debugEnabled);
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
    lastEventSpeedMs = null;
    lastLocationSpeedChangeRateKmhPerSec = null;
    lastSpeedConfidence = 'none';
    lastSpeedSource = 'none';
    headingHistory = [];
    currentSpeedBand = null;
    brakingDetector.reset();
    accelerationDetector.reset();
    corneringDetector.reset();
    oscillationDetector.reset();
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
    lastEventSpeedMs = null;
    lastLocationSpeedChangeRateKmhPerSec = null;
    lastSpeedConfidence = 'none';
    lastSpeedSource = 'none';
    headingHistory = [];
    currentSpeedBand = null;
    brakingDetector.reset();
    accelerationDetector.reset();
    corneringDetector.reset();
    oscillationDetector.reset();
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
    const eventSpeedMs = options.eventSpeedMs ?? speedMs;
    const speedConfidence = options.speedConfidence;
    const speedSource = options.speedSource;
    const isSpeedValid = Number.isFinite(speedMs) && speedMs >= 0;
    const isEventSpeedValid = Number.isFinite(eventSpeedMs) && eventSpeedMs >= 0;

    const speedKmh = convertMsToKmh(speedMs);
    const eventSpeedKmh = convertMsToKmh(eventSpeedMs);
    const currentTime = deps.now();

    currentSpeedBand = isSpeedValid ? resolveBand(speedKmh) : null;

    const previousSpeedKmh =
      typeof lastEventSpeedMs === 'number' && Number.isFinite(lastEventSpeedMs) ? convertMsToKmh(lastEventSpeedMs) : null;
    const previousLocationTimestamp = lastLocation?.timestamp ?? null;
    const previousProcessedAtMs = lastLocationProcessedAtMs;
    if (isEventSpeedValid && previousSpeedKmh !== null && previousLocationTimestamp !== null) {
      let locationDeltaSeconds = (location.timestamp - previousLocationTimestamp) / 1000;
      if (locationDeltaSeconds <= 0.1 && previousProcessedAtMs !== null) {
        const wallClockDeltaSeconds = (currentTime - previousProcessedAtMs) / 1000;
        if (wallClockDeltaSeconds > locationDeltaSeconds) {
          locationDeltaSeconds = wallClockDeltaSeconds;
        }
      }
      if (locationDeltaSeconds > 0.1) {
        lastLocationSpeedChangeRateKmhPerSec = (eventSpeedKmh - previousSpeedKmh) / locationDeltaSeconds;
      } else {
        lastLocationSpeedChangeRateKmhPerSec = null;
      }
    } else {
      lastLocationSpeedChangeRateKmhPerSec = null;
    }

    if (isSpeedValid) {
      await handleStopAndGo(speedKmh, currentTime, latitude, longitude);
      if (speedConfidence !== 'low') {
        await checkSpeeding(location, speedKmh);
      } else {
        deps.logger.debug('Skipping speeding check due to low speed confidence', {
          speedKmh: speedKmh.toFixed(1),
          speedConfidence,
        });
      }

      if (currentSpeedBand) {
        const oscillationSpeedKmh = isEventSpeedValid ? eventSpeedKmh : speedKmh;
        await checkOscillation(location, oscillationSpeedKmh, currentSpeedBand, speedConfidence, currentTime);
      }
    } else {
      resetStopGoCandidates();
    }

    if (isSpeedValid) {
      lastSpeedMs = speedMs;
      lastSpeedConfidence = speedConfidence;
      lastSpeedSource = speedSource;
    }
    if (isEventSpeedValid) {
      lastEventSpeedMs = eventSpeedMs;
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
