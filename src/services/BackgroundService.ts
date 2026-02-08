// import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

import {
  EventType,
  type BackgroundServiceController,
  type BackgroundServiceDeps,
  type LocationTaskData,
  type PermissionState,
  type TrackingState,
  type TrackingStatus,
} from '@types';
import { JourneyService } from '@services/JourneyService';
import { EfficiencyService } from '@services/EfficiencyService';
import { createLogger, LogModule } from '@utils/logger';
import {
  calculateDistanceKm,
  calculateSpeedFromLocations,
  convertMsToKmh,
  type GpsValidationOptions,
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
  PASSIVE_SPEED_THRESHOLD,
  PASSIVE_TIMEOUT_MS,
  SPEED_BUFFER_SIZE,
} from '@constants/gpsConfig';
import { MAX_GPS_DROPOUT_DURATION_MS, RETRY_BASE_DELAY_MS, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MS } from '@constants/tracking';

import type { GpsDropoutState, ServiceHealth } from '@/types/tracking';

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
    totalDistance: 0,
    lastLocation: null,
    startLocationLabel: null,
    lastValidSpeed: 0,
    consecutiveInvalidSpeeds: 0,
    isTransitioning: false,
    lastStateChange: 0,
  };

  const speedSmoother = createSpeedSmoother(SPEED_BUFFER_SIZE);

  let isInited = false;
  let isTaskRegistered = false;
  let gpsDropoutState: GpsDropoutState = {
    isInDropout: false,
    dropoutStartTime: null,
    lastKnownLocation: null,
    lastKnownSpeed: 0,
  };
  let lastHealthIssuesKey: string | null = null;
  let isOutlierSeriesActive = false;

  const listeners = new Set<(state: TrackingState) => void>();

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

  const startPassiveTracking = async (): Promise<boolean> => {
    const previousMode = state.mode;
    state.mode = 'PASSIVE';
    state.lastStateChange = deps.now();

    if (previousMode !== 'PASSIVE') {
      logStateTransition(previousMode, 'PASSIVE', 'Switching to passive tracking');
    }

    deps.EfficiencyService.stopTracking();

    const started = await withRetry(
      async () => {
        await deps.Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: deps.Location.Accuracy.Balanced,
          distanceInterval: 50,
          deferredUpdatesInterval: 60000,
          deferredUpdatesDistance: 50,
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
          deps.logger.warn(`Retrying passive tracking start (attempt ${attempt})`, error);
        },
      }
    );

    if (!started) {
      deps.logger.error('Failed to start passive tracking after retries.');
      state.mode = previousMode;
      emitStateChange();
      return false;
    }

    emitStateChange();
    deps.logger.info('Passive tracking started.');
    return true;
  };

  const startActiveTracking = async (): Promise<void> => {
    if (state.mode === 'ACTIVE' || state.isTransitioning) {
      deps.logger.debug('Already in active tracking mode or transition in progress.');
      return;
    }

    const previousMode = state.mode;
    state.isTransitioning = true;

    try {
      state.mode = 'ACTIVE';
      state.totalDistance = 0;
      state.lastLocation = null;
      state.lowSpeedStartTime = null;
      state.startLocationLabel = null;
      state.lastValidSpeed = 0;
      state.consecutiveInvalidSpeeds = 0;
      state.lastStateChange = deps.now();
      speedSmoother.reset();

      await deps.JourneyService.startJourney();
      state.currentJourneyId = deps.JourneyService.getCurrentJourneyId();

      logStateTransition(previousMode, 'ACTIVE', `Journey ${state.currentJourneyId} started`);

      try {
        const location = await deps.Location.getCurrentPositionAsync({
          accuracy: deps.Location.Accuracy.BestForNavigation,
        });
        await deps.JourneyService.logEvent(EventType.JourneyStart, location.coords.latitude, location.coords.longitude, 0);
        state.lastLocation = location;
        state.startLocationLabel = await getLocationLabel(location.coords.latitude, location.coords.longitude);
      } catch (error) {
        deps.logger.error('Could not get initial location:', error);
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
        deps.logger.error('Failed to start active tracking after retries. Ending journey.');
        state.isTransitioning = false;
        await endActiveTracking();
        return;
      }

      // await deps.Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: 'Driving Detected',
      //     body: 'Active tracking has started. Drive safely!',
      //   },
      //   trigger: null,
      // });

      emitStateChange();
      deps.logger.info('Active tracking started.');
    } finally {
      state.isTransitioning = false;
    }
  };

  const processActiveLocation = async (location: Location.LocationObject): Promise<void> => {
    const { latitude, longitude, speed, accuracy } = location.coords;
    const timeDeltaSeconds = state.lastLocation ? (location.timestamp - state.lastLocation.timestamp) / 1000 : 0;
    let outlierThisUpdate = false;

    const validatedSpeed = validateGpsSpeed(speed, accuracy, DEFAULT_GPS_OPTIONS);

    if (!validatedSpeed.isValid) {
      state.consecutiveInvalidSpeeds++;
      deps.logger.debug(`Invalid GPS speed: ${validatedSpeed.reason}`, {
        speed,
        accuracy,
        consecutiveInvalid: state.consecutiveInvalidSpeeds,
      });

      if (state.consecutiveInvalidSpeeds >= MAX_CONSECUTIVE_INVALID_SPEEDS && state.lastLocation) {
        const calculatedSpeed = calculateSpeedFromLocations(state.lastLocation, location);
        const calculatedValidated = validateGpsSpeed(calculatedSpeed, accuracy, DEFAULT_GPS_OPTIONS);

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

    if (state.currentJourneyId && smoothed.confidence !== 'low') {
      await deps.EfficiencyService.processLocation(location, {
        speedMs: smoothed.speedMs,
        speedConfidence: smoothed.confidence,
        speedSource: smoothed.source,
      });
    } else if (!state.currentJourneyId) {
      deps.logger.debug('Skipping efficiency processing: no current journey id.');
    } else {
      deps.logger.debug('Skipping efficiency processing: low speed confidence', {
        speedMs: smoothed.speedMs,
        confidence: smoothed.confidence,
      });
    }

    if (isOutlierSeriesActive && !outlierThisUpdate) {
      isOutlierSeriesActive = false;
    }

    state.lastLocation = location;
  };

  const endActiveTracking = async (): Promise<void> => {
    if (state.mode !== 'ACTIVE' || state.currentJourneyId === null || state.isTransitioning) {
      deps.logger.debug('No active journey to end or transition in progress.');
      return;
    }

    const previousMode = state.mode;
    state.isTransitioning = true;
    const journeyId = state.currentJourneyId;

    try {
      if (state.lastLocation) {
        await deps.JourneyService.logEvent(
          EventType.JourneyEnd,
          state.lastLocation.coords.latitude,
          state.lastLocation.coords.longitude,
          0
        );
      }

      const finalScore = await deps.EfficiencyService.calculateJourneyScore(journeyId, state.totalDistance);
      const stats = await deps.EfficiencyService.getJourneyEfficiencyStats(journeyId, state.totalDistance);

      if (state.lastLocation) {
        const endLocationLabel = await getLocationLabel(state.lastLocation.coords.latitude, state.lastLocation.coords.longitude);
        const startLabel = state.startLocationLabel || 'Start';
        const endLabel = endLocationLabel || 'End';
        await deps.JourneyService.updateJourneyTitle(journeyId, `From ${startLabel} → ${endLabel}`);
      }

      await deps.JourneyService.endJourney(finalScore, state.totalDistance, stats);

      logStateTransition(previousMode, 'PASSIVE', `Journey ${journeyId} ended, score: ${finalScore}`);

      // await deps.Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: 'Journey Complete',
      //     body: `Score: ${finalScore}/100 • Distance: ${state.totalDistance.toFixed(1)}km`,
      //   },
      //   trigger: null,
      // });

      state.currentJourneyId = null;
      state.totalDistance = 0;
      state.lastLocation = null;
      state.startLocationLabel = null;
      state.lowSpeedStartTime = null;
      state.lastValidSpeed = 0;
      state.consecutiveInvalidSpeeds = 0;
      state.lastStateChange = deps.now();
      speedSmoother.reset();

      emitStateChange();
      await startPassiveTracking();
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

    const latestLocation = data.locations[data.locations.length - 1];
    const dropoutResult = handleGpsDropout(state.lastLocation, latestLocation, gpsDropoutState);
    gpsDropoutState = dropoutResult.updatedState;

    if (dropoutResult.shouldEndJourney && state.mode === 'ACTIVE' && !state.isTransitioning) {
      deps.logger.warn(`GPS dropout exceeded ${Math.round(MAX_GPS_DROPOUT_DURATION_MS / 60000)} minutes. Ending journey as completed.`);
      await endActiveTracking();
      return;
    }

    let locationForProcessing = latestLocation;
    if (dropoutResult.useCalculatedSpeed && state.lastLocation) {
      const calculatedSpeed = calculateSpeedFromLocations(state.lastLocation, latestLocation);
      locationForProcessing = {
        ...latestLocation,
        coords: { ...latestLocation.coords, speed: calculatedSpeed },
      };
      deps.logger.debug('Using calculated speed during GPS dropout', {
        calculatedSpeed,
      });
    }

    const { speed, accuracy } = locationForProcessing.coords;
    const validatedSpeed = validateGpsSpeed(speed, accuracy, DEFAULT_GPS_OPTIONS);
    const speedKmh = convertMsToKmh(validatedSpeed.value);

    deps.logger.debug(
      `Location received. Speed: ${speed?.toFixed(3)} m/s (${speedKmh.toFixed(3)} km/h) [${validatedSpeed.confidence}]. Current Mode: ${state.mode}`
    );

    if (state.mode === 'ACTIVE' && state.currentJourneyId !== null && !state.isTransitioning) {
      await processActiveLocation(locationForProcessing);
    } else if (state.mode === 'ACTIVE' && state.currentJourneyId === null) {
      deps.logger.debug('Skipping active location processing: no current journey id.');
    }

    if (state.mode === 'PASSIVE' && validatedSpeed.isValid && validatedSpeed.value >= ACTIVE_SPEED_THRESHOLD && !state.isTransitioning) {
      deps.logger.info(`Speed > 15km/h (valid: ${speedKmh.toFixed(1)} km/h); Switching to ACTIVE tracking mode.`);
      await startActiveTracking();
      return;
    }

    if (state.mode === 'ACTIVE' && !state.isTransitioning) {
      if (!validatedSpeed.isValid || validatedSpeed.value < PASSIVE_SPEED_THRESHOLD) {
        const now = deps.now();

        if (state.lowSpeedStartTime === null) {
          state.lowSpeedStartTime = now;
          deps.logger.debug(`Low speed or invalid speed detected (${validatedSpeed.reason}), monitoring for timeout...`);
          return;
        }

        const elapsedTime = now - state.lowSpeedStartTime;
        if (elapsedTime >= PASSIVE_TIMEOUT_MS) {
          deps.logger.info('Speed < 10km/h for 2 minutes; Switching to PASSIVE tracking mode.');
          await endActiveTracking();
        } else {
          const secondsLeft = Math.ceil((PASSIVE_TIMEOUT_MS - elapsedTime) / 1000);
          deps.logger.debug(`Low speed ongoing, ${secondsLeft} seconds left before switching to PASSIVE mode.`);
        }
        return;
      }

      if (validatedSpeed.isValid && validatedSpeed.value >= PASSIVE_SPEED_THRESHOLD && state.lowSpeedStartTime !== null) {
        state.lowSpeedStartTime = null;
        deps.logger.info('Speed increased above threshold, low speed monitoring cancelled.');
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
  now: () => Date.now(),
  logger,
});

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
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
  if (singleton) {
    await singleton.handleLocationTask({ data, error });
  }
});
