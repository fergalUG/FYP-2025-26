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
import { evaluateActiveStopDecision } from '@services/background/decisions/activeStopDecision';
import { evaluatePassiveStartDecision } from '@services/background/decisions/passiveStartDecision';
import {
  resolveActivityConfidenceScore,
  shouldTriggerPassiveProbeFromLocation,
} from '@services/background/decisions/activityProbeDecision';
import { buildPassiveTrackingOptions } from '@services/background/location/passiveProfileOptions';
import { resolvePassiveEffectiveSpeed } from '@services/background/location/passiveSpeed';
import { createPassiveActivityMonitoringController } from '@services/background/runtime/activityMonitoring';
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
import { handleGpsDropout } from '@utils/tracking/gpsDropoutHandler';
import { checkServiceHealth } from '@utils/tracking/healthMonitor';
import { createSpeedSmoother } from '@utils/tracking/speedSmoother';
import {
  ACTIVE_SPEED_THRESHOLD,
  MAX_ACCURACY,
  MAX_CONSECUTIVE_INVALID_SPEEDS,
  MAX_VALID_SPEED,
  MIN_ACCURACY,
  MIN_VALID_SPEED,
  LOW_SPEED_PROGRESS_RESET_DISTANCE_KM,
  PASSIVE_ACTIVITY_PROBE_COOLDOWN_MS,
  PASSIVE_PROBE_DURATION_MS,
  PASSIVE_PROBE_MIN_DISPLACEMENT_KM,
  PASSIVE_PROBE_TRIGGER_SPEED_THRESHOLD,
  PASSIVE_ACTIVITY_PROBE_MIN_CONFIDENCE_SCORE,
  PASSIVE_SPEED_THRESHOLD,
  PASSIVE_START_CONFIRMATION_COUNT,
  PASSIVE_START_CONFIRMATION_WINDOW_MS,
  PASSIVE_TIMEOUT_MS,
  SPEED_BUFFER_SIZE,
} from '@constants/gpsConfig';
import { MAX_GPS_DROPOUT_DURATION_MS, RETRY_BASE_DELAY_MS, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MS } from '@constants/tracking';

import type { GpsDropoutState, ServiceHealth } from '@/types/tracking';
import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';

const BACKGROUND_LOCATION_TASK: string = 'BACKGROUND-LOCATION-TASK';

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

//declare this outside the controller so startLocationTracking can use it to not crash
const getLocationPermissions = async () => {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      return foreground.canAskAgain ? 'unknown' : 'denied';
    }

    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) {
      return background.canAskAgain ? 'unknown' : 'denied';
    }

    return 'granted';
  } catch (error) {
    logger.warn('Error checking location permission status:', error);
    return 'unknown';
  }
};

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

  let isInited = false;
  let isTaskRegistered = false;
  let gpsDropoutState: GpsDropoutState = {
    isInDropout: false,
    dropoutStartTime: null,
  };
  let lastHealthIssuesKey: string | null = null;
  let isOutlierSeriesActive = false;
  let isPassiveProfileSwitching = false;
  let latestActivityUpdate: ActivityData | null = null;
  let latestActivityObservedAtMs: number | null = null;

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
      state.totalDistance = 0;
      state.lastLocation = triggerLocation;
      clearLowSpeedCandidate(state);
      state.startLocationLabel = null;
      state.lastValidSpeed = 0;
      state.consecutiveInvalidSpeeds = 0;
      resetPassiveStartCandidate(state);
      resetPassiveActivityCandidate(state);
      state.passiveProbeStartedAt = null;
      passiveActivityMonitoring.start();
      speedSmoother.reset();

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
          await deps.JourneyService.logEvent(
            EventType.JourneyStart,
            bootstrapLocation.coords.latitude,
            bootstrapLocation.coords.longitude,
            0
          );
          state.lastLocation = bootstrapLocation;
          void getLocationLabel(bootstrapLocation.coords.latitude, bootstrapLocation.coords.longitude)
            .then((label) => {
              if (state.currentJourneyId !== journeyId || state.mode !== 'ACTIVE') {
                return;
              }
              state.startLocationLabel = label;
              emitStateChange();
            })
            .catch((error) => {
              deps.logger.warn('Could not resolve start location label:', error);
            });
        } else {
          void (async () => {
            try {
              const location = await deps.Location.getCurrentPositionAsync({
                accuracy: deps.Location.Accuracy.BestForNavigation,
              });
              if (state.currentJourneyId !== journeyId || state.mode !== 'ACTIVE') {
                return;
              }

              await deps.JourneyService.logEvent(EventType.JourneyStart, location.coords.latitude, location.coords.longitude, 0);
              state.lastLocation = location;
              state.startLocationLabel = await getLocationLabel(location.coords.latitude, location.coords.longitude);
              emitStateChange();
            } catch (error) {
              deps.logger.warn('Could not get initial location for journey start:', error);
            }
          })();
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
          deps.logger.error('Failed to start active tracking after retries. Rolling back active journey start.');
          deps.EfficiencyService.stopTracking();
          await deps.JourneyService.endJourney(100, 0, null);
          await deps.JourneyService.deleteJourney(journeyId);
          state.currentJourneyId = null;
          state.totalDistance = 0;
          state.lastLocation = null;
          state.startLocationLabel = null;
          clearLowSpeedCandidate(state);
          state.lastValidSpeed = 0;
          state.consecutiveInvalidSpeeds = 0;
          resetPassiveStartCandidate(state);
          state.passiveProbeStartedAt = null;
          speedSmoother.reset();
          await startPassiveTracking('COARSE');
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
        deps.logger.error('Unexpected error while starting active tracking:', error);
        deps.EfficiencyService.stopTracking();
        await deps.JourneyService.endJourney(100, 0, null);
        await deps.JourneyService.deleteJourney(journeyId);
        state.currentJourneyId = null;
        state.totalDistance = 0;
        state.lastLocation = null;
        state.startLocationLabel = null;
        clearLowSpeedCandidate(state);
        state.lastValidSpeed = 0;
        state.consecutiveInvalidSpeeds = 0;
        resetPassiveStartCandidate(state);
        state.passiveProbeStartedAt = null;
        speedSmoother.reset();
        await startPassiveTracking('COARSE');
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
      state.totalDistance = 0;
      state.lastLocation = null;
      state.startLocationLabel = null;
      clearLowSpeedCandidate(state);
      state.lastValidSpeed = 0;
      state.consecutiveInvalidSpeeds = 0;
      resetPassiveStartCandidate(state);
      state.passiveProbeStartedAt = null;
      state.lastStateChange = deps.now();
      speedSmoother.reset();

      await startPassiveTracking('COARSE');
    } finally {
      state.isTransitioning = false;
    }
  };

  const init = () => {
    if (isInited) return;
    isInited = true;

    // deps.Notifications.setNotificationHandler({
    //   handleNotification: async () => ({
    //     shouldPlaySound: true,
    //     shouldSetBadge: false,
    //     shouldShowBanner: true,
    //     shouldShowList: true,
    //   }),
    // });
  };

  const registerBackgroundTask = () => {
    if (isTaskRegistered) return;

    const isDefined =
      typeof deps.TaskManager.isTaskDefined === 'function' ? deps.TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK) : false;

    if (!isDefined) {
      deps.logger.warn('Background location task is not defined in TaskManager. Registering now.');
      deps.TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
        await controller.handleLocationTask({ data, error });
      });
    }

    isTaskRegistered = true;
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
      let locationForProcessing = location;
      let effectiveSpeed: ValidatedSpeed;
      let speedSource: 'gps' | 'calculated' = 'gps';

      if (state.mode === 'ACTIVE') {
        const dropoutResult = handleGpsDropout(state.lastLocation, location, gpsDropoutState);
        gpsDropoutState = dropoutResult.updatedState;

        if (dropoutResult.shouldEndJourney && !state.isTransitioning) {
          deps.logger.warn(`GPS dropout exceeded ${Math.round(MAX_GPS_DROPOUT_DURATION_MS / 60000)} minutes. Ending journey as completed.`);
          await endActiveTracking();
          return;
        }

        if (dropoutResult.useCalculatedSpeed && state.lastLocation) {
          const calculatedSpeed = calculateSpeedFromLocations(state.lastLocation, location);
          locationForProcessing = {
            ...location,
            coords: { ...location.coords, speed: calculatedSpeed },
          };
          speedSource = 'calculated';
          deps.logger.debug('Using calculated speed during GPS dropout', {
            calculatedSpeed,
          });
        }

        effectiveSpeed = validateGpsSpeed(
          locationForProcessing.coords.speed,
          locationForProcessing.coords.accuracy,
          DEFAULT_GPS_OPTIONS,
          speedSource
        );
      } else {
        gpsDropoutState = {
          isInDropout: false,
          dropoutStartTime: null,
        };
        effectiveSpeed = resolvePassiveEffectiveSpeed(state.lastLocation, location, DEFAULT_GPS_OPTIONS);
      }

      const rawSpeed = location.coords.speed;
      const rawSpeedKmh = rawSpeed === null || rawSpeed === undefined ? null : convertMsToKmh(rawSpeed);
      const rawSpeedLabelMs = rawSpeed === null || rawSpeed === undefined ? 'n/a' : rawSpeed.toFixed(3);
      const rawSpeedLabelKmh = rawSpeedKmh === null ? 'n/a' : rawSpeedKmh.toFixed(3);
      const effectiveSpeedKmh = convertMsToKmh(effectiveSpeed.value);
      deps.logger.debug(
        `Location received. Mode: ${state.mode}. Raw speed: ${rawSpeedLabelMs} m/s (${rawSpeedLabelKmh} km/h). Effective speed: ${effectiveSpeed.value.toFixed(3)} m/s (${effectiveSpeedKmh.toFixed(3)} km/h) [${effectiveSpeed.confidence}, ${effectiveSpeed.source}].`,
        {
          rawSpeedMs: rawSpeed ?? null,
          rawSpeedKmh,
          effectiveSpeedMs: effectiveSpeed.value,
          effectiveSpeedKmh,
          effectiveSpeedSource: effectiveSpeed.source,
          effectiveSpeedReason: effectiveSpeed.reason,
        }
      );

      if (state.mode === 'ACTIVE' && state.currentJourneyId !== null && !state.isTransitioning) {
        await processActiveLocation(locationForProcessing, speedSource);
      } else if (state.mode === 'ACTIVE' && state.currentJourneyId === null) {
        deps.logger.debug('Skipping active location processing: no current journey id.');
      }

      if (state.mode === 'PASSIVE' && !state.isTransitioning) {
        if (
          state.passiveTrackingProfile === 'COARSE' &&
          shouldTriggerPassiveProbeFromLocation(
            state.lastLocation,
            location,
            effectiveSpeed,
            PASSIVE_PROBE_TRIGGER_SPEED_THRESHOLD,
            PASSIVE_PROBE_MIN_DISPLACEMENT_KM
          )
        ) {
          await switchPassiveTrackingProfile('PROBE', 'movement signal detected');
        } else if (
          state.passiveTrackingProfile === 'PROBE' &&
          state.passiveProbeStartedAt !== null &&
          deps.now() - state.passiveProbeStartedAt >= PASSIVE_PROBE_DURATION_MS
        ) {
          await switchPassiveTrackingProfile('COARSE', 'probe timeout reached without active confirmation');
        }

        const passiveStartDecision = evaluatePassiveStartDecision({
          effectiveSpeed,
          locationTimestamp: location.timestamp,
          candidateSince: state.passiveStartCandidateSince,
          candidateCount: state.passiveStartCandidateCount,
          activeSpeedThreshold: ACTIVE_SPEED_THRESHOLD,
          confirmationCount: PASSIVE_START_CONFIRMATION_COUNT,
          confirmationWindowMs: PASSIVE_START_CONFIRMATION_WINDOW_MS,
        });
        state.passiveStartCandidateSince = passiveStartDecision.nextCandidateSince;
        state.passiveStartCandidateCount = passiveStartDecision.nextCandidateCount;

        if (passiveStartDecision.action === 'START_ACTIVE_GPS') {
          const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
          deps.logger.info(`Speed > 15km/h (valid: ${speedLabelKmh} km/h); Switching to ACTIVE tracking mode.`);
          await startActiveTracking(locationForProcessing);
          return;
        }

        if (passiveStartDecision.action === 'UPDATE_CANDIDATE') {
          const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
          deps.logger.debug(
            `Passive start candidate ${state.passiveStartCandidateCount}/${PASSIVE_START_CONFIRMATION_COUNT} from calculated speed (${speedLabelKmh} km/h).`,
            {
              candidateSince: state.passiveStartCandidateSince,
              candidateWindowMs: PASSIVE_START_CONFIRMATION_WINDOW_MS,
            }
          );
        }

        if (passiveStartDecision.action === 'START_ACTIVE_CALCULATED') {
          const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
          deps.logger.info(`Calculated speed confirmed > 15km/h (valid: ${speedLabelKmh} km/h); Switching to ACTIVE tracking mode.`);
          await startActiveTracking(locationForProcessing);
          return;
        }

        if (passiveStartDecision.action === 'RESET_CANDIDATE') {
          deps.logger.debug('Passive start candidate reset: speed dropped below threshold or became invalid.');
        }

        state.lastLocation = location;
      }

      if (state.mode === 'ACTIVE' && !state.isTransitioning) {
        const now = deps.now();
        const automotiveConfirmedForReset = hasConfirmedAutomotiveActivity(now);
        const activeStopDecision = evaluateActiveStopDecision({
          effectiveSpeed,
          now,
          totalDistanceKm: state.totalDistance,
          lowSpeedStartTime: state.lowSpeedStartTime,
          lowSpeedStartDistanceKm: state.lowSpeedStartDistanceKm,
          isAutomotiveConfirmedForReset: automotiveConfirmedForReset,
          passiveSpeedThreshold: PASSIVE_SPEED_THRESHOLD,
          timeoutMs: PASSIVE_TIMEOUT_MS,
          progressResetDistanceKm: LOW_SPEED_PROGRESS_RESET_DISTANCE_KM,
        });

        if (activeStopDecision.action === 'START_CANDIDATE') {
          state.lowSpeedStartTime = now;
          state.lowSpeedStartDistanceKm = state.totalDistance;
          state.lowSpeedStartEventTimestamp = now;
          state.lowSpeedStartLocation = state.lastLocation;
          deps.logger.debug(`Low speed or invalid speed detected (${effectiveSpeed.reason}), monitoring for timeout...`);
          continue;
        }

        if (activeStopDecision.action === 'RESET_CANDIDATE_PROGRESS') {
          state.lowSpeedStartTime = now;
          state.lowSpeedStartDistanceKm = state.totalDistance;
          state.lowSpeedStartEventTimestamp = now;
          state.lowSpeedStartLocation = state.lastLocation;
          deps.logger.info(
            `Low-speed timeout reset: vehicle moved ${((activeStopDecision.distanceSinceCandidateStartKm ?? 0) * 1000).toFixed(0)}m during candidate window.`
          );
          continue;
        }

        if (activeStopDecision.action === 'END_UNCONFIRMED_ACTIVITY') {
          deps.logger.info(
            `Low-speed progress detected (${((activeStopDecision.distanceSinceCandidateStartKm ?? 0) * 1000).toFixed(0)}m) without confirmed automotive activity; ending journey.`
          );
          await endActiveTracking({
            tailPruneFromTimestamp: state.lowSpeedStartEventTimestamp,
            finalDistanceKm: activeStopDecision.finalDistanceKm ?? state.totalDistance,
            finalLocation: state.lowSpeedStartLocation ?? state.lastLocation,
          });
          return;
        }

        if (activeStopDecision.action === 'TIMEOUT') {
          const timeoutMinutes = activeStopDecision.timeoutMinutes ?? Math.round(PASSIVE_TIMEOUT_MS / 60000);
          deps.logger.info(`Speed < 10km/h for ${timeoutMinutes} minutes; Switching to PASSIVE tracking mode.`);
          await endActiveTracking({
            tailPruneFromTimestamp: state.lowSpeedStartEventTimestamp,
            finalDistanceKm: activeStopDecision.finalDistanceKm ?? state.totalDistance,
            finalLocation: state.lowSpeedStartLocation ?? state.lastLocation,
          });
          return;
        }

        if (activeStopDecision.action === 'ONGOING') {
          deps.logger.debug(
            `Low speed ongoing, ${activeStopDecision.secondsLeft ?? Math.ceil(PASSIVE_TIMEOUT_MS / 1000)} seconds left before switching to PASSIVE mode.`
          );
          continue;
        }

        if (activeStopDecision.action === 'CANCEL_CANDIDATE') {
          clearLowSpeedCandidate(state);
          deps.logger.info('Speed increased above threshold, low speed monitoring cancelled.');
        }
      }
    }

    const health = checkServiceHealth(state, gpsDropoutState, deps.now());
    logHealthStatus(health);
  };

  const controller: BackgroundServiceController = {
    init,
    registerBackgroundTask,
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
      registerBackgroundTask();
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
      init();
      registerBackgroundTask();
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
      init();
      registerBackgroundTask();
      deps.logger.info('Manual start of ACTIVE tracking requested.');
      await startActiveTracking();
    },
    manualStopActiveTracking: async () => {
      init();
      registerBackgroundTask();
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
  TaskManager,
  JourneyService,
  EfficiencyService,
  VehicleMotion,
  now: () => Date.now(),
  logger,
});

singleton.registerBackgroundTask();

export const initBackgroundService = (): void => {
  singleton.init();
  singleton.registerBackgroundTask();
};

export const getTrackingStatus = (): TrackingStatus => singleton.getTrackingStatus();

export const requestLocationPermissions = async (): Promise<boolean> => singleton.requestLocationPermissions();

export const getLocationPermissionState = async (): Promise<PermissionState> => singleton.getLocationPermissionState();

export const startLocationMonitoring = async (): Promise<void> => singleton.startLocationMonitoring();

export const stopLocationMonitoring = async (): Promise<void> => singleton.stopLocationMonitoring();

export const ManualStartActiveTracking = async (): Promise<void> => singleton.manualStartActiveTracking();

export const ManualStopActiveTracking = async (): Promise<void> => singleton.manualStopActiveTracking();

export const __internal = {
  BACKGROUND_LOCATION_TASK,
  ACTIVE_SPEED_THRESHOLD,
  PASSIVE_SPEED_THRESHOLD,
  PASSIVE_TIMEOUT_MS,
  PASSIVE_START_CONFIRMATION_COUNT,
  PASSIVE_START_CONFIRMATION_WINDOW_MS,
};
