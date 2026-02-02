// import type * as Notifications from 'expo-notifications';
import type * as TaskManager from 'expo-task-manager';
import type * as Location from 'expo-location';

import type { PermissionState, TrackingMode, TrackingStatus } from '@/types/tracking';
import type { JourneyServiceController } from '@/types/services/journeyService';
import type { EfficiencyServiceController } from '@/types/services/efficiencyService';
import type { createLogger } from '@utils/logger';

export interface LocationTaskData {
  locations: Array<Location.LocationObject>;
}

export interface TrackingState {
  mode: TrackingMode;
  isMonitoring: boolean;
  currentJourneyId: number | null;
  lowSpeedStartTime: number | null;
  totalDistance: number;
  lastLocation: Location.LocationObject | null;
  startLocationLabel: string | null;
  lastValidSpeed: number;
  consecutiveInvalidSpeeds: number;
  speedBuffer: number[];
  isTransitioning: boolean;
  lastStateChange: number;
}

export interface BackgroundServiceDeps {
  Location: typeof Location;
  // Notifications: typeof Notifications;
  TaskManager: typeof TaskManager;
  JourneyService: Pick<JourneyServiceController, 'startJourney' | 'getCurrentJourneyId' | 'logEvent' | 'updateJourneyTitle' | 'endJourney'>;
  EfficiencyService: Pick<
    EfficiencyServiceController,
    'startTracking' | 'stopTracking' | 'processLocation' | 'calculateJourneyScore' | 'getJourneyEfficiencyStats'
  >;
  now: () => number;
  logger: ReturnType<typeof createLogger>;
}

export interface BackgroundServiceController {
  init: () => void;
  registerBackgroundTask: () => void;
  getTrackingStatus: () => TrackingStatus;
  getState: () => TrackingState;
  requestLocationPermissions: () => Promise<boolean>;
  getLocationPermissionState: () => Promise<PermissionState>;
  startLocationMonitoring: () => Promise<void>;
  stopLocationMonitoring: () => Promise<void>;
  addStateListener: (listener: (state: TrackingState) => void) => () => void;
  manualStartActiveTracking: () => Promise<void>;
  manualStopActiveTracking: () => Promise<void>;
  handleLocationTask: (body: { data?: LocationTaskData; error?: unknown }) => Promise<void>;
}
