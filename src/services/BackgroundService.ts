// import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import VehicleMotion from '@modules/vehicle-motion';

import {
  EventType,
  type BackgroundServiceController,
  type BackgroundServiceDeps,
  type LocationTaskData,
  type PassiveTrackingProfile,
  type PermissionState,
  type TrackingState,
  type TrackingStatus,
} from '@types';
import { JourneyService } from '@services/JourneyService';
import { EfficiencyService } from '@services/EfficiencyService';
import { resolveActivityConfidenceScore } from '@services/background/decisions/activityProbeDecision';
import { buildPassiveTrackingOptions } from '@services/background/location/passiveProfileOptions';
import { processActiveStopDecision } from '@services/background/runtime/activeStopProcessing';
import { createPassiveActivityMonitoringController } from '@services/background/runtime/activityMonitoring';
import { resolveLocationSample } from '@services/background/runtime/locationSampleResolution';
import { processPassiveLocation } from '@services/background/runtime/passiveLocationProcessing';
import { ensureBackgroundLocationTaskRegistered } from '@services/background/runtime/taskRegistration';
import { clearLowSpeedCandidate, resetPassiveActivityCandidate, resetPassiveStartCandidate } from '@services/background/state/mutators';
import { createLogger, LogModule } from '@utils/logger';
import {
  calculateDistanceKm,
  calculateSpeedFromLocations,
  convertMsToKmh,
  type GpsValidationOptions,
  type ValidatedSpeed,
  validateDistanceCalculation,
  validateGpsSpeed,
} from '@utils/gpsValidation';
import { withRetry } from '@utils/async/retry';
import { checkSpeedOutlier } from '@utils/tracking/outlierDetection';
import { checkServiceHealth } from '@utils/tracking/healthMonitor';
import { createSpeedSmoother } from '@utils/tracking/speedSmoother';
import {
  MAX_ACCURACY,
  MAX_CONSECUTIVE_INVALID_SPEEDS,
  MAX_VALID_SPEED,
  MIN_ACCURACY,
  MIN_VALID_SPEED,
  PASSIVE_ACTIVITY_PROBE_COOLDOWN_MS,
  PASSIVE_ACTIVITY_PROBE_MIN_CONFIDENCE_SCORE,
  SPEED_BUFFER_SIZE,
} from '@constants/gpsConfig';
import { MAX_GPS_DROPOUT_DURATION_MS, RETRY_BASE_DELAY_MS, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MS } from '@constants/tracking';

import type { GpsDropoutState, ServiceHealth } from '@/types/tracking';
import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';

const BACKGROUND_LOCATION_TASK: string = 'BACKGROUND-LOCATION-TASK';
const ACTIVE_START_BOOTSTRAP_LOCATION_TIMEOUT_MS = 2000;

const DEFAULT_GPS_OPTIONS: GpsValidationOptions = {
  minValidSpeed: MIN_VALID_SPEED,
  maxValidSpeed: MAX_VALID_SPEED,
  minAccuracy: MIN_ACCURACY,
  maxAccuracy: MAX_ACCURACY,
};

const logger = createLogger(LogModule.BackgroundService);

const formatPlaceLabel = (place: Location.LocationGeocodedAddress | null): string => {
  if (!place) {
    return 'Unknown location';
  }
  const label = place.name || place.street || place.city || place.region || place.country;
  return label || 'Unknown location';
};

interface EndActiveTrackingOptions {
  tailPruneFromTimestamp?: number | null;
  finalDistanceKm?: number;
  finalLocation?: Location.LocationObject | null;
}

export const createBackgroundServiceController = (deps: BackgroundServiceDeps): BackgroundServiceController => {
  const state: TrackingState = {
    mode: 'PASSIVE',
    isMonitoring: false,
    currentJourneyId: null,
    lowSpeedStartTime: null,
    lowSpeedStartDistanceKm: null,
    lowSpeedStartEventTimestamp: null,
    lowSpeedStartLocation: null,
    totalDistance: 0,
    lastLocation: null,
    startLocationLabel: null,
    lastValidSpeed: 0,
    consecutiveInvalidSpeeds: 0,
    passiveStartCandidateSince: null,
    passiveStartCandidateCount: 0,
    passiveTrackingProfile: 'COARSE',
    passiveProbeStartedAt: null,
    passiveActivityCandidateSince: null,
    lastActivityProbeTriggerAt: null,
    isTransitioning: false,
    lastStateChange: 0,
  };

  const speedSmoother = createSpeedSmoother(SPEED_BUFFER_SIZE);

  let gpsDropoutState: GpsDropoutState = {
    isInDropout: false,
    dropoutStartTime: null,
  };
  let lastHealthIssuesKey: string | null = null;
  let isOutlierSeriesActive = false;
  let isPassiveProfileSwitching = false;
  let latestActivityUpdate: ActivityData | null = null;
  let latestActivityObservedAtMs: number | null = null;
  let isActiveJourneyStartLogged = false;

  const listeners = new Set<(state: TrackingState) => void>();

  const recordActivityUpdate = (activity: ActivityData): void => {
    latestActivityUpdate = activity;
    latestActivityObservedAtMs = deps.now();
  };

  const hasConfirmedAutomotiveActivity = (nowMs: number): boolean => {
    if (!latestActivityUpdate || latestActivityObservedAtMs === null) {
      return false;
    }

    if (nowMs - latestActivityObservedAtMs > PASSIVE_ACTIVITY_PROBE_COOLDOWN_MS) {
      return false;
    }

    const confidenceScore = resolveActivityConfidenceScore(latestActivityUpdate.confidence);
    return latestActivityUpdate.automotive && confidenceScore >= PASSIVE_ACTIVITY_PROBE_MIN_CONFIDENCE_SCORE;
  };

  const emitStateChange = () => {
    const currentState = { ...state };
    listeners.forEach((listener) => listener(currentState));
  };

  const logStateTransition = (from: string, to: string, reason: string) => {
    deps.logger.info(`State transition: ${from} → ${to} (${reason})`, {
      journeyId: state.currentJourneyId,
    });
  };

  const logHealthStatus = (health: ServiceHealth) => {
    const issuesKey = health.issues.join('|');
    if (!health.isHealthy) {
      if (issuesKey !== lastHealthIssuesKey) {
        deps.logger.warn('Tracking health degraded', {
          issues: health.issues,
          timeSinceLastLocationMs: health.timeSinceLastLocationMs,
          consecutiveInvalidSpeeds: health.consecutiveInvalidSpeeds,
          gpsDropoutDurationMs: health.gpsDropoutDurationMs,
        });
        lastHealthIssuesKey = issuesKey;
      }
      return;
    }

    if (lastHealthIssuesKey !== null) {
      deps.logger.info('Tracking health recovered');
      lastHealthIssuesKey = null;
    }
  };

  const getLocationPermissions = async (): Promise<PermissionState> => {
    try {
      const foreground = await deps.Location.getForegroundPermissionsAsync();
      if (!foreground.granted) {
        return foreground.canAskAgain ? 'unknown' : 'denied';
      }

      const background = await deps.Location.getBackgroundPermissionsAsync();
      if (!background.granted) {
        return background.canAskAgain ? 'unknown' : 'denied';
      }

      return 'granted';
    } catch (error) {
      deps.logger.warn('Error checking location permission state:', error);
      return 'unknown';
    }
  };

  const getLocationLabel = async (latitude: number, longitude: number): Promise<string | null> => {
    try {
      const [place] = await deps.Location.reverseGeocodeAsync({ latitude, longitude });
      return formatPlaceLabel(place ?? null);
    } catch (error) {
      deps.logger.warn('Could not reverse geocode location label:', error);
      return null;
    }
  };

  const applyPassiveTrackingProfile = async (profile: PassiveTrackingProfile): Promise<boolean> => {
    const started = await withRetry(
      async () => {
        await deps.Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, buildPassiveTrackingOptions(deps.Location, profile));
        return true;
      },
      {
        maxRetries: RETRY_MAX_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS,
        onRetry: (attempt, error) => {
          deps.logger.warn(`Retrying passive ${profile.toLowerCase()} profile start (attempt ${attempt})`, error);
        },
      }
    );

    if (!started) {
      deps.logger.error(`Failed to start passive ${profile.toLowerCase()} profile after retries.`);
      return false;
    }

    state.passiveTrackingProfile = profile;
    state.passiveProbeStartedAt = profile === 'PROBE' ? deps.now() : null;
    return true;
  };

  const switchPassiveTrackingProfile = async (profile: PassiveTrackingProfile, reason: string): Promise<void> => {
    if (state.mode !== 'PASSIVE' || state.isTransitioning || isPassiveProfileSwitching || state.passiveTrackingProfile === profile) {
      return;
    }

    isPassiveProfileSwitching = true;
    try {
      const switched = await applyPassiveTrackingProfile(profile);
      if (!switched) {
        return;
      }
      resetPassiveActivityCandidate(state);
      deps.logger.info(`Passive profile switched to ${profile} (${reason}).`);
      emitStateChange();
    } finally {
      isPassiveProfileSwitching = false;
    }
  };

  const passiveActivityMonitoring = createPassiveActivityMonitoringController({
    state,
    vehicleMotion: deps.VehicleMotion,
    now: deps.now,
    emitStateChange,
    switchPassiveTrackingProfile,
    onActivityUpdate: recordActivityUpdate,
    logger: deps.logger,
  });

  const resetJourneyTrackingRuntime = (lastLocation: Location.LocationObject | null): void => {
    state.totalDistance = 0;
    state.lastLocation = lastLocation;
    state.startLocationLabel = null;
    clearLowSpeedCandidate(state);
    state.lastValidSpeed = 0;
    state.consecutiveInvalidSpeeds = 0;
    resetPassiveStartCandidate(state);
    state.passiveProbeStartedAt = null;
    speedSmoother.reset();
    isActiveJourneyStartLogged = false;
  };

  const resolveBootstrapLocationWithTimeout = async (): Promise<Location.LocationObject | null> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const location = await Promise.race<Location.LocationObject | null>([
        deps.Location.getCurrentPositionAsync({
          accuracy: deps.Location.Accuracy.BestForNavigation,
        }),
        new Promise<null>((resolve) => {
          timeoutHandle = setTimeout(() => {
            resolve(null);
          }, ACTIVE_START_BOOTSTRAP_LOCATION_TIMEOUT_MS);
        }),
      ]);
      return location;
    } catch (error) {
      deps.logger.warn('Could not get initial location for journey start:', error);
      return null;
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    }
  };

  const logJourneyStartForLocation = async (journeyId: number, location: Location.LocationObject): Promise<void> => {
    if (state.currentJourneyId !== journeyId) {
      return;
    }

    await deps.JourneyService.logEvent(EventType.JourneyStart, location.coords.latitude, location.coords.longitude, 0);
    isActiveJourneyStartLogged = true;
    state.lastLocation = location;

    void getLocationLabel(location.coords.latitude, location.coords.longitude)
      .then((label) => {
        if (state.currentJourneyId !== journeyId) {
          return;
        }
        state.startLocationLabel = label;
        emitStateChange();
      })
      .catch((error) => {
        deps.logger.warn('Could not resolve start location label:', error);
      });
  };

  const ensureActiveJourneyStartLogged = async (location: Location.LocationObject): Promise<void> => {
    if (isActiveJourneyStartLogged || state.currentJourneyId === null) {
      return;
    }

    await logJourneyStartForLocation(state.currentJourneyId, location);
    deps.logger.info('JourneyStart was anchored using first ACTIVE location update.');
  };

  const rollbackFailedActiveStart = async (journeyId: number, message: string, error?: unknown): Promise<void> => {
    if (error) {
      deps.logger.error(message, error);
    } else {
      deps.logger.error(message);
    }

    deps.EfficiencyService.stopTracking();
    await deps.JourneyService.endJourney(100, 0, null);
    await deps.JourneyService.deleteJourney(journeyId);
    state.currentJourneyId = null;
    resetJourneyTrackingRuntime(null);
    await startPassiveTracking('COARSE');
  };

  const startPassiveTracking = async (profile: PassiveTrackingProfile = 'COARSE'): Promise<boolean> => {
    const previousMode = state.mode;
    const previousProfile = state.passiveTrackingProfile;
    state.mode = 'PASSIVE';
    state.lastStateChange = deps.now();
    gpsDropoutState = {
      isInDropout: false,
      dropoutStartTime: null,
    };
    resetPassiveStartCandidate(state);
    resetPassiveActivityCandidate(state);
    clearLowSpeedCandidate(state);

    if (previousMode !== 'PASSIVE') {
      logStateTransition(previousMode, 'PASSIVE', 'Switching to passive tracking');
    }

    deps.EfficiencyService.stopTracking();
    const started = await applyPassiveTrackingProfile(profile);

    if (!started) {
      state.mode = previousMode;
      state.passiveTrackingProfile = previousProfile;
      emitStateChange();
      return false;
    }

    passiveActivityMonitoring.start();
    emitStateChange();
    deps.logger.info(`Passive tracking started (${profile}).`);
    return true;
  };

  const startActiveTracking = async (triggerLocation: Location.LocationObject | null = null): Promise<void> => {
    if (state.mode === 'ACTIVE' || state.isTransitioning) {
      deps.logger.debug('Already in active tracking mode or transition in progress.');
      return;
    }

    const previousMode = state.mode;
    state.isTransitioning = true;

    try {
      resetJourneyTrackingRuntime(triggerLocation);
      resetPassiveActivityCandidate(state);
      passiveActivityMonitoring.start();

      await deps.JourneyService.startJourney();
      state.currentJourneyId = deps.JourneyService.getCurrentJourneyId();
      if (state.currentJourneyId === null) {
        deps.logger.error('Failed to enter active tracking: journey start did not return an id.');
        return;
      }
      const journeyId = state.currentJourneyId;

      try {
        const bootstrapLocation = triggerLocation ?? state.lastLocation;
        if (bootstrapLocation) {
          await logJourneyStartForLocation(journeyId, bootstrapLocation);
        } else {
          const resolvedBootstrapLocation = await resolveBootstrapLocationWithTimeout();
          if (resolvedBootstrapLocation) {
            await logJourneyStartForLocation(journeyId, resolvedBootstrapLocation);
          } else {
            deps.logger.warn(
              'Could not resolve bootstrap location before ACTIVE processing; JourneyStart will be anchored on first ACTIVE location update.'
            );
          }
        }

        deps.EfficiencyService.startTracking();

        const started = await withRetry(
          async () => {
            await deps.Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: deps.Location.Accuracy.BestForNavigation,
              distanceInterval: 0,
              showsBackgroundLocationIndicator: true,
              activityType: deps.Location.ActivityType.AutomotiveNavigation,
              pausesUpdatesAutomatically: false,
            });
            return true;
          },
          {
            maxRetries: RETRY_MAX_ATTEMPTS,
            baseDelayMs: RETRY_BASE_DELAY_MS,
            maxDelayMs: RETRY_MAX_DELAY_MS,
            onRetry: (attempt, error) => {
              deps.logger.warn(`Retrying active tracking start (attempt ${attempt})`, error);
            },
          }
        );

        if (!started) {
          await rollbackFailedActiveStart(journeyId, 'Failed to start active tracking after retries. Rolling back active journey start.');
          return;
        }

        state.mode = 'ACTIVE';
        state.lastStateChange = deps.now();
        logStateTransition(previousMode, 'ACTIVE', `Journey ${journeyId} started`);

        // await deps.Notifications.scheduleNotificationAsync({
        //   content: {
        //     title: 'Driving Detected',
        //     body: 'Active tracking has started. Drive safely!',
        //   },
        //   trigger: null,
        // });

        emitStateChange();
        deps.logger.info('Active tracking started.');
      } catch (error) {
        await rollbackFailedActiveStart(journeyId, 'Unexpected error while starting active tracking.', error);
      }
    } finally {
      state.isTransitioning = false;
    }
  };

  const processActiveLocation = async (location: Location.LocationObject, speedSource: 'gps' | 'calculated' = 'gps'): Promise<void> => {
    const { latitude, longitude, speed, accuracy } = location.coords;
    const timeDeltaSeconds = state.lastLocation ? (location.timestamp - state.lastLocation.timestamp) / 1000 : 0;
    let outlierThisUpdate = false;

    const validatedSpeed = validateGpsSpeed(speed, accuracy, DEFAULT_GPS_OPTIONS, speedSource);

    if (!validatedSpeed.isValid) {
      state.consecutiveInvalidSpeeds++;
      deps.logger.debug(`Invalid GPS speed: ${validatedSpeed.reason}`, {
        speed,
        accuracy,
        consecutiveInvalid: state.consecutiveInvalidSpeeds,
      });

      if (state.consecutiveInvalidSpeeds >= MAX_CONSECUTIVE_INVALID_SPEEDS && state.lastLocation) {
        const calculatedSpeed = calculateSpeedFromLocations(state.lastLocation, location);
        const calculatedValidated = validateGpsSpeed(calculatedSpeed, accuracy, DEFAULT_GPS_OPTIONS, 'calculated');

        if (calculatedValidated.isValid) {
          const smoothed = speedSmoother.addSample(calculatedValidated.value, calculatedValidated.confidence, 'calculated');
          state.lastValidSpeed = smoothed.speedMs;
          deps.logger.debug(`Using calculated speed fallback`, {
            calculatedSpeed: calculatedValidated.value,
          });
        }
      }

      state.lastLocation = location;
      return;
    }

    state.consecutiveInvalidSpeeds = 0;

    if (state.lastLocation && state.lastValidSpeed > 0 && timeDeltaSeconds > 0) {
      const outlier = checkSpeedOutlier(validatedSpeed.value, state.lastValidSpeed, timeDeltaSeconds);
      if (outlier.isOutlier) {
        if (!isOutlierSeriesActive) {
          deps.logger.warn(`Speed outlier detected: ${outlier.reason}`);
          isOutlierSeriesActive = true;
        }
        outlierThisUpdate = true;
        state.lastLocation = location;
        return;
      }
    }

    const smoothed = speedSmoother.addSample(validatedSpeed.value, validatedSpeed.confidence, validatedSpeed.source);
    state.lastValidSpeed = smoothed.speedMs;

    if (state.lastLocation && smoothed.confidence !== 'low' && timeDeltaSeconds > 0) {
      const distance = calculateDistanceKm(state.lastLocation.coords.latitude, state.lastLocation.coords.longitude, latitude, longitude);
      const distanceCheck = validateDistanceCalculation(distance, smoothed.speedMs, timeDeltaSeconds, accuracy);

      if (!distanceCheck.isValid) {
        if (!isOutlierSeriesActive) {
          deps.logger.warn(`Distance outlier detected: ${distanceCheck.reason}`);
          isOutlierSeriesActive = true;
        }
        outlierThisUpdate = true;
      } else {
        state.totalDistance += distanceCheck.adjustedDistanceKm;
      }
    }

    const speedKmh = convertMsToKmh(smoothed.speedMs);
    await deps.JourneyService.logEvent(EventType.LocationUpdate, latitude, longitude, speedKmh);

    if (state.currentJourneyId) {
      await deps.EfficiencyService.processLocation(location, {
        speedMs: smoothed.speedMs,
        eventSpeedMs: validatedSpeed.value,
        speedConfidence: smoothed.confidence,
        speedSource: smoothed.source,
      });
      if (smoothed.confidence === 'low') {
        deps.logger.debug('Processed location with low speed confidence', {
          speedMs: smoothed.speedMs,
          confidence: smoothed.confidence,
        });
      }
    } else if (!state.currentJourneyId) {
      deps.logger.debug('Skipping efficiency processing: no current journey id.');
    }

    if (isOutlierSeriesActive && !outlierThisUpdate) {
      isOutlierSeriesActive = false;
    }

    state.lastLocation = location;
  };

  const endActiveTracking = async (options: EndActiveTrackingOptions = {}): Promise<void> => {
    if (state.mode !== 'ACTIVE' || state.currentJourneyId === null || state.isTransitioning) {
      deps.logger.debug('No active journey to end or transition in progress.');
      return;
    }

    const previousMode = state.mode;
    state.isTransitioning = true;
    const journeyId = state.currentJourneyId;

    try {
      if (options.tailPruneFromTimestamp !== null && options.tailPruneFromTimestamp !== undefined) {
        await deps.JourneyService.deleteEventsSince(journeyId, options.tailPruneFromTimestamp);
      }

      const finalDistanceKm = options.finalDistanceKm ?? state.totalDistance;
      const finalLocation = options.finalLocation ?? state.lastLocation;

      if (finalLocation) {
        await deps.JourneyService.logEvent(EventType.JourneyEnd, finalLocation.coords.latitude, finalLocation.coords.longitude, 0);
      }

      const finalScore = await deps.EfficiencyService.calculateJourneyScore(journeyId, finalDistanceKm);
      const stats = await deps.EfficiencyService.getJourneyEfficiencyStats(journeyId, finalDistanceKm);

      if (finalLocation) {
        const endLocationLabel = await getLocationLabel(finalLocation.coords.latitude, finalLocation.coords.longitude);
        const startLabel = state.startLocationLabel || 'Start';
        const endLabel = endLocationLabel || 'End';
        await deps.JourneyService.updateJourneyTitle(journeyId, `From ${startLabel} → ${endLabel}`);
      }

      await deps.JourneyService.endJourney(finalScore, finalDistanceKm, stats);

      logStateTransition(previousMode, 'PASSIVE', `Journey ${journeyId} ended, score: ${finalScore}`);

      // await deps.Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: 'Journey Complete',
      //     body: `Score: ${finalScore}/100 • Distance: ${state.totalDistance.toFixed(1)}km`,
      //   },
      //   trigger: null,
      // });

      state.mode = 'PASSIVE';
      state.currentJourneyId = null;
      resetJourneyTrackingRuntime(null);
      state.lastStateChange = deps.now();

      await startPassiveTracking('COARSE');
    } finally {
      state.isTransitioning = false;
    }
  };

  const logLocationSpeedSample = (
    location: Location.LocationObject,
    effectiveSpeedMs: number,
    speedConfidence: ValidatedSpeed['confidence'],
    speedSource: ValidatedSpeed['source'],
    reason?: ValidatedSpeed['reason']
  ) => {
    const rawSpeed = location.coords.speed;
    const rawSpeedKmh = rawSpeed === null || rawSpeed === undefined ? null : convertMsToKmh(rawSpeed);
    const rawSpeedLabelMs = rawSpeed === null || rawSpeed === undefined ? 'n/a' : rawSpeed.toFixed(3);
    const rawSpeedLabelKmh = rawSpeedKmh === null ? 'n/a' : rawSpeedKmh.toFixed(3);
    const effectiveSpeedKmh = convertMsToKmh(effectiveSpeedMs);

    deps.logger.debug(
      `Location received. Mode: ${state.mode}. Raw speed: ${rawSpeedLabelMs} m/s (${rawSpeedLabelKmh} km/h). Effective speed: ${effectiveSpeedMs.toFixed(3)} m/s (${effectiveSpeedKmh.toFixed(3)} km/h) [${speedConfidence}, ${speedSource}].`,
      {
        rawSpeedMs: rawSpeed ?? null,
        rawSpeedKmh,
        effectiveSpeedMs,
        effectiveSpeedKmh,
        effectiveSpeedSource: speedSource,
        effectiveSpeedReason: reason,
      }
    );
  };

  const handleLocationTask = async ({ data, error }: { data?: LocationTaskData; error?: unknown }): Promise<void> => {
    if (error) {
      deps.logger.error('Background location task error:', error);
      return;
    }

    if (!data?.locations?.length) {
      deps.logger.debug('Background location task received with no locations.');
      return;
    }

    const orderedLocations = [...data.locations].sort((a, b) => a.timestamp - b.timestamp);

    for (const location of orderedLocations) {
      const resolvedLocation = resolveLocationSample({
        mode: state.mode,
        lastLocation: state.lastLocation,
        location,
        gpsDropoutState,
        gpsValidationOptions: DEFAULT_GPS_OPTIONS,
        logger: deps.logger,
      });
      gpsDropoutState = resolvedLocation.nextGpsDropoutState;

      if (resolvedLocation.shouldEndJourneyForDropout && !state.isTransitioning) {
        deps.logger.warn(`GPS dropout exceeded ${Math.round(MAX_GPS_DROPOUT_DURATION_MS / 60000)} minutes. Ending journey as completed.`);
        await endActiveTracking();
        return;
      }

      logLocationSpeedSample(
        location,
        resolvedLocation.effectiveSpeed.value,
        resolvedLocation.effectiveSpeed.confidence,
        resolvedLocation.effectiveSpeed.source,
        resolvedLocation.effectiveSpeed.reason
      );

      if (state.mode === 'ACTIVE' && state.currentJourneyId !== null && !state.isTransitioning) {
        await ensureActiveJourneyStartLogged(resolvedLocation.locationForProcessing);
        await processActiveLocation(resolvedLocation.locationForProcessing, resolvedLocation.speedSource);
      } else if (state.mode === 'ACTIVE' && state.currentJourneyId === null) {
        deps.logger.debug('Skipping active location processing: no current journey id.');
      }

      if (state.mode === 'PASSIVE' && !state.isTransitioning) {
        const passiveResult = await processPassiveLocation({
          state,
          location,
          locationForProcessing: resolvedLocation.locationForProcessing,
          effectiveSpeed: resolvedLocation.effectiveSpeed,
          nowMs: deps.now(),
          switchPassiveTrackingProfile,
          startActiveTracking,
          logger: deps.logger,
        });
        if (passiveResult === 'STARTED_ACTIVE') {
          return;
        }
      }

      if (state.mode === 'ACTIVE' && !state.isTransitioning) {
        const nowMs = deps.now();
        const activeStopResult = await processActiveStopDecision({
          state,
          effectiveSpeed: resolvedLocation.effectiveSpeed,
          nowMs,
          isAutomotiveConfirmedForReset: hasConfirmedAutomotiveActivity(nowMs),
          endActiveTracking,
          logger: deps.logger,
        });

        if (activeStopResult === 'ENDED_ACTIVE') {
          return;
        }
        if (activeStopResult === 'NEXT_LOCATION') {
          continue;
        }
      }
    }

    const health = checkServiceHealth(state, gpsDropoutState, deps.now());
    logHealthStatus(health);
  };

  const controller: BackgroundServiceController = {
    getTrackingStatus: () => ({ mode: state.mode, isMonitoring: state.isMonitoring }),
    getState: () => ({ ...state }),
    requestLocationPermissions: async () => {
      try {
        const { granted: foregroundGranted } = await deps.Location.requestForegroundPermissionsAsync();
        if (!foregroundGranted) {
          return false;
        }
        const { granted: backgroundGranted } = await deps.Location.requestBackgroundPermissionsAsync();
        return backgroundGranted;
      } catch (error) {
        deps.logger.warn('Error requesting location permissions:', error);
        return false;
      }
    },
    getLocationPermissionState: getLocationPermissions,
    startLocationMonitoring: async () => {
      const permState = await getLocationPermissions();
      if (permState !== 'granted') {
        deps.logger.warn('Cannot start location monitoring: permissions not granted.');
        return;
      }
      if (state.isMonitoring) return;
      const started = await startPassiveTracking();
      if (!started) {
        state.isMonitoring = false;
        emitStateChange();
        return;
      }
      state.isMonitoring = true;
      emitStateChange();
    },
    stopLocationMonitoring: async () => {
      await deps.Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      passiveActivityMonitoring.stop();
      latestActivityUpdate = null;
      latestActivityObservedAtMs = null;
      state.isMonitoring = false;
      emitStateChange();
    },
    addStateListener: (listener: (state: TrackingState) => void): (() => void) => {
      listeners.add(listener);
      listener({ ...state });

      // cleanup function to remove listener
      return () => {
        listeners.delete(listener);
      };
    },
    manualStartActiveTracking: async () => {
      deps.logger.info('Manual start of ACTIVE tracking requested.');
      await startActiveTracking();
    },
    manualStopActiveTracking: async () => {
      deps.logger.info('Manual stop of ACTIVE tracking requested.');
      await endActiveTracking();
    },
    handleLocationTask,
  };

  return controller;
};

export const singleton = createBackgroundServiceController({
  Location,
  // Notifications,
  JourneyService,
  EfficiencyService,
  VehicleMotion,
  now: () => Date.now(),
  logger,
});

ensureBackgroundLocationTaskRegistered({
  taskManager: TaskManager,
  taskName: BACKGROUND_LOCATION_TASK,
  logger,
  handleLocationTask: singleton.handleLocationTask,
});

export const getTrackingStatus = (): TrackingStatus => singleton.getTrackingStatus();

export const requestLocationPermissions = async (): Promise<boolean> => singleton.requestLocationPermissions();

export const getLocationPermissionState = async (): Promise<PermissionState> => singleton.getLocationPermissionState();

export const startLocationMonitoring = async (): Promise<void> => singleton.startLocationMonitoring();

export const stopLocationMonitoring = async (): Promise<void> => singleton.stopLocationMonitoring();

export const ManualStartActiveTracking = async (): Promise<void> => singleton.manualStartActiveTracking();

export const ManualStopActiveTracking = async (): Promise<void> => singleton.manualStopActiveTracking();
