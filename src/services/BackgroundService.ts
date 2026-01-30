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
  validateGpsSpeed,
} from '@utils/gpsValidation';
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
    speedBuffer: [],
  };

  let lowSpeedTimeout: ReturnType<typeof setTimeout> | null = null;
  let isInited = false;
  let isTaskRegistered = false;

  const listeners = new Set<(state: TrackingState) => void>();

  const emitStateChange = () => {
    const currentState = { ...state };
    listeners.forEach((listener) => listener(currentState));
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

  const startPassiveTracking = async (): Promise<void> => {
    state.mode = 'PASSIVE';

    await deps.Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: deps.Location.Accuracy.Balanced,
      distanceInterval: 50,
      deferredUpdatesInterval: 60000,
      deferredUpdatesDistance: 50,
      showsBackgroundLocationIndicator: true,
      activityType: deps.Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
    });

    deps.EfficiencyService.stopTracking();
    emitStateChange();
    deps.logger.info('Passive tracking started.');
  };

  const startActiveTracking = async (): Promise<void> => {
    if (state.mode === 'ACTIVE') {
      deps.logger.info('Already in active tracking mode.');
      return;
    }

    state.mode = 'ACTIVE';
    state.totalDistance = 0;
    state.lastLocation = null;
    state.lowSpeedStartTime = null;
    state.startLocationLabel = null;
    state.lastValidSpeed = 0;
    state.consecutiveInvalidSpeeds = 0;
    state.speedBuffer = [];

    await deps.JourneyService.startJourney();
    state.currentJourneyId = deps.JourneyService.getCurrentJourneyId();

    deps.logger.info(`Journey started with ID: ${state.currentJourneyId}`);

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

    await deps.Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: deps.Location.Accuracy.BestForNavigation,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      activityType: deps.Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
    });

    // await deps.Notifications.scheduleNotificationAsync({
    //   content: {
    //     title: 'Driving Detected',
    //     body: 'Active tracking has started. Drive safely!',
    //   },
    //   trigger: null,
    // });

    emitStateChange();
    deps.logger.info('Active tracking started.');
  };

  const processActiveLocation = async (location: Location.LocationObject): Promise<void> => {
    const { latitude, longitude, speed, accuracy } = location.coords;

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
          state.speedBuffer.push(calculatedValidated.value);
          if (state.speedBuffer.length > SPEED_BUFFER_SIZE) {
            state.speedBuffer.shift();
          }
          state.lastValidSpeed = calculatedValidated.value;
          deps.logger.debug(`Using calculated speed fallback`, {
            calculatedSpeed: calculatedValidated.value,
          });
        }
      }

      state.lastLocation = location;
      return;
    }

    state.consecutiveInvalidSpeeds = 0;

    state.speedBuffer.push(validatedSpeed.value);
    if (state.speedBuffer.length > SPEED_BUFFER_SIZE) {
      state.speedBuffer.shift();
    }

    const sortedSpeeds = [...state.speedBuffer].sort((a, b) => a - b);
    const medianSpeed = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)];
    state.lastValidSpeed = medianSpeed;

    if (state.lastLocation && validatedSpeed.confidence !== 'low') {
      const distance = calculateDistanceKm(state.lastLocation.coords.latitude, state.lastLocation.coords.longitude, latitude, longitude);
      state.totalDistance += distance;
    }

    const speedKmh = convertMsToKmh(medianSpeed);
    await deps.JourneyService.logEvent(EventType.LocationUpdate, latitude, longitude, speedKmh);

    if (state.currentJourneyId && validatedSpeed.confidence !== 'low') {
      await deps.EfficiencyService.processLocation({
        ...location,
        coords: { ...location.coords, speed: medianSpeed },
      });
    }

    state.lastLocation = location;
  };

  const endActiveTracking = async (): Promise<void> => {
    if (state.mode !== 'ACTIVE' || state.currentJourneyId === null) {
      deps.logger.info('No active journey to end.');
      return;
    }

    if (state.lastLocation) {
      await deps.JourneyService.logEvent(EventType.JourneyEnd, state.lastLocation.coords.latitude, state.lastLocation.coords.longitude, 0);
    }

    const finalScore = await deps.EfficiencyService.calculateJourneyScore(state.currentJourneyId, state.totalDistance);
    const stats = await deps.EfficiencyService.getJourneyEfficiencyStats(state.currentJourneyId, state.totalDistance);

    if (state.currentJourneyId && state.lastLocation) {
      const endLocationLabel = await getLocationLabel(state.lastLocation.coords.latitude, state.lastLocation.coords.longitude);
      const startLabel = state.startLocationLabel || 'Start';
      const endLabel = endLocationLabel || 'End';
      await deps.JourneyService.updateJourneyTitle(state.currentJourneyId, `From ${startLabel} → ${endLabel}`);
    }

    await deps.JourneyService.endJourney(finalScore, state.totalDistance, stats);

    deps.logger.info(`Journey ended (ID: ${state.currentJourneyId}), distance: ${state.totalDistance.toFixed(2)}km, score: ${finalScore}`);

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
    state.speedBuffer = [];

    if (lowSpeedTimeout) {
      clearTimeout(lowSpeedTimeout);
      lowSpeedTimeout = null;
    }

    emitStateChange();
    await startPassiveTracking();
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
      return;
    }

    const latestLocation = data.locations[data.locations.length - 1];
    const { speed, accuracy } = latestLocation.coords;

    const validatedSpeed = validateGpsSpeed(speed, accuracy, DEFAULT_GPS_OPTIONS);
    const speedKmh = convertMsToKmh(validatedSpeed.value);

    deps.logger.info(
      `Location received. Speed: ${speed?.toFixed(3)} m/s (${speedKmh.toFixed(3)} km/h) [${validatedSpeed.confidence}]. Current Mode: ${state.mode}`
    );

    if (state.mode === 'ACTIVE' && state.currentJourneyId !== null) {
      await processActiveLocation(latestLocation);
    }

    if (state.mode === 'PASSIVE' && validatedSpeed.isValid && validatedSpeed.value >= ACTIVE_SPEED_THRESHOLD) {
      deps.logger.info(`Speed > 15km/h (valid: ${speedKmh.toFixed(1)} km/h); Switching to ACTIVE tracking mode.`);
      await startActiveTracking();
      return;
    }

    if (state.mode === 'ACTIVE') {
      if (!validatedSpeed.isValid || validatedSpeed.value < PASSIVE_SPEED_THRESHOLD) {
        if (state.lowSpeedStartTime === null) {
          state.lowSpeedStartTime = deps.now();
          deps.logger.info(`Low speed or invalid speed detected (${validatedSpeed.reason}), starting timeout...`);

          if (lowSpeedTimeout) clearTimeout(lowSpeedTimeout);
          lowSpeedTimeout = setTimeout(async () => {
            deps.logger.info('Low speed timeout triggered via timer.');
            if (state.mode === 'ACTIVE' && state.lowSpeedStartTime !== null) {
              const currentElapsedTime = deps.now() - state.lowSpeedStartTime;
              if (currentElapsedTime >= PASSIVE_TIMEOUT_MS) {
                await endActiveTracking();
              }
            }
          }, PASSIVE_TIMEOUT_MS);

          return;
        }

        const elapsedTime = deps.now() - state.lowSpeedStartTime;
        if (elapsedTime >= PASSIVE_TIMEOUT_MS) {
          deps.logger.info('Speed < 10km/h for 2 minutes; Switching to PASSIVE tracking mode.');
          await endActiveTracking();
        } else {
          const secondsLeft = Math.ceil((PASSIVE_TIMEOUT_MS - elapsedTime) / 1000);
          deps.logger.info(`Low speed ongoing, ${secondsLeft} seconds left before switching to PASSIVE mode.`);
        }
        return;
      }

      if (validatedSpeed.isValid && validatedSpeed.value >= PASSIVE_SPEED_THRESHOLD && state.lowSpeedStartTime !== null) {
        state.lowSpeedStartTime = null;
        if (lowSpeedTimeout) {
          clearTimeout(lowSpeedTimeout);
          lowSpeedTimeout = null;
        }
        deps.logger.info('Speed increased, timeout cancelled.');
      }
    }
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
      await startPassiveTracking();
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
