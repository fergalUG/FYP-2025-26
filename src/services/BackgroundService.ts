import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import VehicleMotion from '../../modules/vehicle-motion';
import type { TrackingMode, TrackingStatus } from '../types';
import * as JourneyService from './JourneyService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const BACKGROUND_LOCATION_TASK: string = 'BACKGROUND-LOCATION-TASK';

const ACTIVE_SPEED_THRESHOLD: number = 4.16667; // 15 km/h in m/s
const PASSIVE_SPEED_THRESHOLD: number = 1.38889; // 5 km/h in m/s
const PASSIVE_TIMEOUT_MS: number = 120000; // 2 minutes before switching to passive

let currentTrackingMode: TrackingMode = 'PASSIVE';
let isMonitoring: boolean = false;
let currentJourneyId: number | null = null;
let lowSpeedStartTime: number | null = null;
let totalDistance: number = 0;
let lastLocation: Location.LocationObject | null = null;

export const getTrackingStatus = (): TrackingStatus => ({
  mode: currentTrackingMode,
  isMonitoring,
});

interface LocationTaskData {
  locations: Array<Location.LocationObject>;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
  if (error) {
    console.error('[BackgroundService] Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (!locations || locations.length === 0) {
      return;
    }

    const latestLocation = locations[locations.length - 1];
    const speed: number | null = latestLocation.coords.speed; // speed in m/s
    const speedKmh = convertMsToKmh(speed ?? 0);

    console.log(`[BackgroundService] Location received. Speed: ${speed} m/s (${speedKmh} km/h). Current Mode: ${currentTrackingMode}`);

    if (currentTrackingMode === 'ACTIVE' && currentJourneyId !== null) {
      await processActiveLocation(latestLocation);
    }

    if (speed != null && speed >= ACTIVE_SPEED_THRESHOLD && currentTrackingMode === 'PASSIVE') {
      console.log('[BackgroundService] Speed > 15km/h; Switching to ACTIVE tracking mode.');
      await startActiveTracking();
    } else if ((speed == null || speed < PASSIVE_SPEED_THRESHOLD) && currentTrackingMode === 'ACTIVE') {
      if (lowSpeedStartTime === null) {
        lowSpeedStartTime = Date.now();
        console.log('[BackgroundService] Low speed detected, starting timeout...');
      } else {
        const elapsedTime = Date.now() - lowSpeedStartTime;
        if (elapsedTime >= PASSIVE_TIMEOUT_MS) {
          console.log('[BackgroundService] Speed < 5km/h for 2 minutes; Switching to PASSIVE tracking mode.');
          await endActiveTracking();
          lowSpeedStartTime = null;
        }
      }
    } else if (speed != null && speed >= PASSIVE_SPEED_THRESHOLD && lowSpeedStartTime !== null) {
      lowSpeedStartTime = null;
      console.log('[BackgroundService] Speed increased, timeout cancelled.');
    }
  }
});

export const requestLocationPermissions = async (): Promise<boolean> => {
  const { granted: foregroundGranted } = await Location.requestForegroundPermissionsAsync();
  if (!foregroundGranted) {
    return false;
  }
  const { granted: backgroundGranted } = await Location.requestBackgroundPermissionsAsync();
  return backgroundGranted;
};

export const startLocationMonitoring = async (): Promise<void> => {
  if (isMonitoring) {
    return;
  }
  await startPassiveTracking();
  isMonitoring = true;
};

export const stopLocationMonitoring = async (): Promise<void> => {
  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  isMonitoring = false;
};

export const ManualStartActiveTracking = async (): Promise<void> => {
  console.log('[BackgroundService] Manual start of ACTIVE tracking requested.');
  await startActiveTracking();
};

export const ManualStopActiveTracking = async (): Promise<void> => {
  console.log('[BackgroundService] Manual stop of ACTIVE tracking requested.');
  await endActiveTracking();
};

const startPassiveTracking = async (): Promise<void> => {
  currentTrackingMode = 'PASSIVE';
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    deferredUpdatesInterval: 60000,
    deferredUpdatesDistance: 50,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
  });

  VehicleMotion.stopTracking();
  console.log('[BackgroundService] Passive tracking started.');
};

const startActiveTracking = async (): Promise<void> => {
  if (currentTrackingMode === 'ACTIVE') {
    console.log('[BackgroundService] Already in active tracking mode.');
    return;
  }

  currentTrackingMode = 'ACTIVE';
  totalDistance = 0;
  lastLocation = null;
  lowSpeedStartTime = null;

  // Start journey in database
  await JourneyService.startJourney();
  currentJourneyId = JourneyService.getCurrentJourneyId();

  console.log(`[BackgroundService] Journey started with ID: ${currentJourneyId}`);

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    await JourneyService.logEvent('journey_start', location.coords.latitude, location.coords.longitude, 0, 0);
    lastLocation = location;
  } catch (error) {
    console.error('[BackgroundService] Could not get initial location:', error);
  }

  console.log('[BackgroundService] Active tracking started.');
};

const endActiveTracking = async (): Promise<void> => {
  if (currentTrackingMode !== 'ACTIVE' || currentJourneyId === null) {
    console.log('[BackgroundService] No active journey to end.');
    return;
  }

  if (lastLocation) {
    await JourneyService.logEvent('journey_end', lastLocation.coords.latitude, lastLocation.coords.longitude, 0, 0);
  }

  // TODO: Calculate final score using efficiency service
  const finalScore = 0;

  await JourneyService.endJourney(finalScore, totalDistance);

  console.log(`[BackgroundService] Journey ended (ID: ${currentJourneyId}), distance: ${totalDistance.toFixed(2)}km, score: ${finalScore}`);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Journey Complete',
      body: `Your journey has ended. Distance: ${totalDistance.toFixed(1)}km`,
    },
    trigger: null,
  });

  currentJourneyId = null;
  totalDistance = 0;
  lastLocation = null;

  await startPassiveTracking();
};

const processActiveLocation = async (location: Location.LocationObject): Promise<void> => {
  const { latitude, longitude, speed, accuracy } = location.coords;

  if (accuracy && accuracy > 50) {
    console.log(`[BackgroundService] Poor accuracy (${accuracy}m), skipping location.`);
    return;
  }

  if (lastLocation) {
    const distance = calculateDistance(lastLocation.coords.latitude, lastLocation.coords.longitude, latitude, longitude);
    totalDistance += distance;
  }

  const speedKmh = convertMsToKmh(speed ?? 0);
  await JourneyService.logEvent('location_update', latitude, longitude, speedKmh, 0);

  lastLocation = location;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

const convertMsToKmh = (speedMs: number): number => {
  return speedMs * 3.6;
};
