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

const BACKGROUND_LOCATION_TASK: string = 'BACKGROUND-LOCATION-TASK';

const ACTIVE_SPEED_THRESHOLD: number = 4.16667; // 15 km/h in m/s
const PASSIVE_SPEED_THRESHOLD: number = 2.77778; // 10 km/h in m/s
const PASSIVE_TIMEOUT_MS: number = 120000; // 2 minutes before switching to passive

const logger = createLogger(LogModule.BackgroundService);

const formatPlaceLabel = (place: Location.LocationGeocodedAddress | null): string => {
  if (!place) {
    return 'Unknown location';
  }
  const label = place.name || place.street || place.city || place.region || place.country;
  return label || 'Unknown location';
};

const toRad = (degrees: number): number => degrees * (Math.PI / 180);

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const convertMsToKmh = (speedMs: number): number => speedMs * 3.6;

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
  };

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

    if (accuracy && accuracy > 50) {
      deps.logger.info(`Poor accuracy (${accuracy}m), skipping location.`);
      return;
    }

    if (state.lastLocation) {
      const distance = calculateDistanceKm(state.lastLocation.coords.latitude, state.lastLocation.coords.longitude, latitude, longitude);
      state.totalDistance += distance;
    }

    const speedKmh = convertMsToKmh(speed ?? 0);
    await deps.JourneyService.logEvent(EventType.LocationUpdate, latitude, longitude, speedKmh);

    if (state.currentJourneyId) {
      await deps.EfficiencyService.processLocation(location);
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
    const speed: number | null = latestLocation.coords.speed;
    const speedKmh = convertMsToKmh(speed ?? 0);

    deps.logger.info(`Location received. Speed: ${speed?.toFixed(3)} m/s (${speedKmh.toFixed(3)} km/h). Current Mode: ${state.mode}`);

    if (state.mode === 'ACTIVE' && state.currentJourneyId !== null) {
      await processActiveLocation(latestLocation);
    }

    if (speed != null && speed >= ACTIVE_SPEED_THRESHOLD && state.mode === 'PASSIVE') {
      deps.logger.info('Speed > 15km/h; Switching to ACTIVE tracking mode.');
      await startActiveTracking();
      return;
    }

    if ((speed == null || speed < PASSIVE_SPEED_THRESHOLD) && state.mode === 'ACTIVE') {
      if (state.lowSpeedStartTime === null) {
        state.lowSpeedStartTime = deps.now();
        deps.logger.info('Low speed detected, starting timeout...');
        return;
      }

      const elapsedTime = deps.now() - state.lowSpeedStartTime;
      if (elapsedTime >= PASSIVE_TIMEOUT_MS) {
        deps.logger.info('Speed < 5km/h for 2 minutes; Switching to PASSIVE tracking mode.');
        await endActiveTracking();
      } else {
        const secondsLeft = Math.ceil((PASSIVE_TIMEOUT_MS - elapsedTime) / 1000);
        deps.logger.info(`Low speed ongoing, ${secondsLeft} seconds left before switching to PASSIVE mode.`);
      }
      return;
    }

    if (speed != null && speed >= PASSIVE_SPEED_THRESHOLD && state.lowSpeedStartTime !== null) {
      state.lowSpeedStartTime = null;
      deps.logger.info('Speed increased, timeout cancelled.');
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
