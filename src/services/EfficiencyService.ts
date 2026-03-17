import type * as Location from 'expo-location';

import VehicleMotion from '@modules/vehicle-motion';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import {
  createAccelerationDetector,
  createBrakingDetector,
  createCorneringDetector,
  createOscillationDetector,
  createStopAndGoDetector,
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
  type StopAndGoPhase,
  type StartTrackingOptions,
} from '@types';
import { JourneyService } from '@services/JourneyService';
import { RoadSpeedLimitService } from '@services/RoadSpeedLimitService';
import { createLogger, isDebugEnabled, LogModule } from '@utils/logger';
import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import { convertMsToKmh, type SpeedConfidence, type SpeedSource } from '@utils/gpsValidation';
import { resolveSpeedBand } from '@utils/tracking/thresholdBands';
import type { SpeedBand } from '@/types/tracking';

const logger = createLogger(LogModule.EfficiencyService);

const MIN_SPEED_FOR_EVENTS_KMH = 10;
const MIN_SPEED_FOR_HEADING_KMH = 15;
const HEADING_LOOKBACK_TIME_MS = 2000;

const HEADING_HISTORY_SIZE = 5;
const DEBUG_SUMMARY_INTERVAL_MS = 1000;
const DEFAULT_START_TRACKING_OPTIONS: StartTrackingOptions = {
  speedLimitDetectionEnabled: true,
  speedLimitPackRef: null,
};

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
  let currentJourneySpeedLimitDetectionEnabled: boolean | null = null;
  let currentJourneySpeedLimitDataStatus: ScoringStats['speedLimitDataStatus'] | null = null;
  let currentJourneySpeedLimitPackRef: StartTrackingOptions['speedLimitPackRef'] = null;

  //debug
  let lastDebugSummaryTime = 0;
  let lastDebugEnabled = false;

  const brakingDetector = createBrakingDetector();
  const accelerationDetector = createAccelerationDetector();
  const corneringDetector = createCorneringDetector();
  const speedingDetector = createSpeedingDetector();
  const oscillationDetector = createOscillationDetector();
  const stopAndGoDetector = createStopAndGoDetector();

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
      phase: 'unknown' as StopAndGoPhase,
      cycleCount: 0,
      lastEventTime: 0,
      timeSinceLastEvent: 0,
      stopCandidateStart: 0,
      goCandidateStart: 0,
      lastReason: 'none',
      triggered: 0,
    },
    oscillation: {
      samples: 0,
      lastReason: 'none',
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

  const syncStopAndGoDebugSummary = (now: number): void => {
    if (!isDebugEnabled()) {
      return;
    }

    const stopAndGoState = stopAndGoDetector.getState();
    debugSummary.stopAndGo.phase = stopAndGoState.phase;
    debugSummary.stopAndGo.cycleCount = stopAndGoState.cycleCount;
    debugSummary.stopAndGo.lastEventTime = stopAndGoState.lastEventTimeMs ?? 0;
    debugSummary.stopAndGo.timeSinceLastEvent = stopAndGoState.lastEventTimeMs ? now - stopAndGoState.lastEventTimeMs : 0;
    debugSummary.stopAndGo.stopCandidateStart = stopAndGoState.stopCandidateStartMs ?? 0;
    debugSummary.stopAndGo.goCandidateStart = stopAndGoState.goCandidateStartMs ?? 0;
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

  const checkSpeeding = async (location: Location.LocationObject, speedKmh: number, nowMs: number): Promise<void> => {
    if (!currentJourneySpeedLimitDetectionEnabled || !currentJourneySpeedLimitPackRef) {
      speedingDetector.reset();
      return;
    }

    const speedLimit = await deps.RoadSpeedLimitService.getSpeedLimit({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    if (!speedLimit) {
      speedingDetector.reset();
      deps.logger.debug('Skipping speeding check: no road speed limit available', {
        latitude: Number(location.coords.latitude.toFixed(6)),
        longitude: Number(location.coords.longitude.toFixed(6)),
      });
      return;
    }

    currentJourneySpeedLimitDataStatus = 'ready';

    const speedingResult = speedingDetector.detect({
      nowMs,
      speedKmh,
      speedLimitKmh: speedLimit.speedLimitKmh,
    });
    if (!speedingResult.detected || !speedingResult.severity) {
      return;
    }

    await logDrivingEvent('speeding', speedingResult.severity, location, speedKmh, {
      speedKmh: Number(speedKmh.toFixed(2)),
      speedLimitKmh: Number(speedLimit.speedLimitKmh.toFixed(1)),
      speedLimitSource: speedLimit.source,
      speedLimitFromCache: speedLimit.fromCache,
      ...(typeof speedLimit.wayId === 'number' ? { speedLimitWayId: speedLimit.wayId } : {}),
      ...(speedLimit.rawMaxspeed ? { speedLimitRaw: speedLimit.rawMaxspeed } : {}),
      ...(speedingResult.metadata ?? {}),
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
    now: number,
    debugEnabled: boolean
  ): Promise<void> => {
    const oscillationResult = oscillationDetector.detect({
      nowMs: now,
      speedKmh,
      speedBand: band,
      speedChangeRateKmhPerSec: lastLocationSpeedChangeRateKmhPerSec,
      speedReliable: speedConfidence === 'high' || speedConfidence === 'medium',
      suppressed: stopAndGoDetector.isSuppressionActive(),
    });

    if (debugEnabled) {
      debugSummary.oscillation.samples += 1;
      debugSummary.oscillation.lastReason = oscillationResult.reason;
    }

    if (!oscillationResult.detected || !oscillationResult.severity) {
      return;
    }

    if (debugEnabled) {
      debugSummary.oscillation.triggered += 1;
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

  const startTracking = (options: StartTrackingOptions = DEFAULT_START_TRACKING_OPTIONS): void => {
    if (isTracking) {
      return;
    }

    isTracking = true;
    currentJourneySpeedLimitDetectionEnabled = options.speedLimitDetectionEnabled;
    currentJourneySpeedLimitPackRef = options.speedLimitPackRef;
    currentJourneySpeedLimitDataStatus = options.speedLimitDetectionEnabled ? 'unavailable' : 'disabled';
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
    speedingDetector.reset();
    oscillationDetector.reset();
    stopAndGoDetector.reset();
    deps.RoadSpeedLimitService.reset();
    deps.RoadSpeedLimitService.setPackSnapshot(options.speedLimitPackRef);
    resetDebugSummary();
    lastDebugSummaryTime = deps.now();
    lastDebugEnabled = isDebugEnabled();

    deps.VehicleMotion.startTracking();
    deps.VehicleMotion.addListener('onMotionUpdate', handleMotionUpdate);
    deps.logger.info('Started tracking.');
  };

  const stopTracking = (): void => {
    if (!isTracking) {
      return;
    }

    isTracking = false;
    currentJourneySpeedLimitDetectionEnabled = null;
    currentJourneySpeedLimitDataStatus = null;
    currentJourneySpeedLimitPackRef = null;
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
    speedingDetector.reset();
    oscillationDetector.reset();
    stopAndGoDetector.reset();
    deps.RoadSpeedLimitService.setPackSnapshot(null);
    deps.RoadSpeedLimitService.reset();
    resetDebugSummary();
    lastDebugSummaryTime = deps.now();
    lastDebugEnabled = isDebugEnabled();

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
    const debugEnabled = isDebugEnabled();

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
      const stopAndGoResult = stopAndGoDetector.detect({
        nowMs: currentTime,
        speedKmh,
      });
      syncStopAndGoDebugSummary(currentTime);
      if (debugEnabled) {
        debugSummary.stopAndGo.lastReason = stopAndGoResult.reason;
      }

      if (stopAndGoResult.detected) {
        await deps.JourneyService.logEvent(EventType.StopAndGo, latitude, longitude, speedKmh, {
          metadata: stopAndGoResult.metadata ?? null,
        });
        deps.logger.info('stop_and_go detected', {
          speedKmh: Number(speedKmh.toFixed(2)),
          ...(stopAndGoResult.metadata ?? {}),
        });
        if (debugEnabled) {
          debugSummary.stopAndGo.triggered += 1;
        }
      }

      if (speedConfidence !== 'low' && speedConfidence !== 'none') {
        await checkSpeeding(location, speedKmh, currentTime);
      } else {
        speedingDetector.reset();
        deps.logger.debug('Skipping speeding check due to low speed confidence', {
          speedKmh: speedKmh.toFixed(1),
          speedConfidence,
        });
      }

      if (currentSpeedBand) {
        const oscillationSpeedKmh = isEventSpeedValid ? eventSpeedKmh : speedKmh;
        await checkOscillation(location, oscillationSpeedKmh, currentSpeedBand, speedConfidence, currentTime, debugEnabled);
      }
    } else {
      stopAndGoDetector.clearCandidates();
      syncStopAndGoDebugSummary(currentTime);
      if (debugEnabled) {
        debugSummary.stopAndGo.lastReason = 'none';
      }
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
      return currentJourneySpeedLimitDetectionEnabled === null
        ? calculateEfficiencyScore(events, distanceKm).stats
        : calculateEfficiencyScore(events, distanceKm, undefined, {
            speedLimitDetectionEnabled: currentJourneySpeedLimitDetectionEnabled,
            speedLimitDataStatus: currentJourneySpeedLimitDataStatus ?? undefined,
          }).stats;
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
  RoadSpeedLimitService,
  VehicleMotion,
  now: () => Date.now(),
  logger,
});
