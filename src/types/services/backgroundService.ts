// import type * as Notifications from 'expo-notifications';
import type * as Location from 'expo-location';

import type { PermissionState, TrackingMode, TrackingStatus } from '@/types/tracking';
import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { JourneyServiceController } from '@/types/services/journeyService';
import type { EfficiencyServiceController } from '@/types/services/efficiencyService';
import type { createLogger } from '@utils/logger';

export type PassiveTrackingProfile = 'COARSE' | 'PROBE';

export interface LocationTaskData {
  locations: Array<Location.LocationObject>;
}

export interface TrackingState {
  mode: TrackingMode;
  isMonitoring: boolean;
  currentJourneyId: number | null;
  lowSpeedStartTime: number | null;
  lowSpeedStartDistanceKm: number | null;
  lowSpeedStartEventTimestamp: number | null;
  lowSpeedStartLocation: Location.LocationObject | null;
  totalDistance: number;
  lastLocation: Location.LocationObject | null;
  startLocationLabel: string | null;
  lastValidSpeed: number;
  consecutiveInvalidSpeeds: number;
  passiveStartCandidateSince: number | null;
  passiveStartCandidateCount: number;
  passiveTrackingProfile: PassiveTrackingProfile;
  passiveProbeStartedAt: number | null;
  passiveActivityCandidateSince: number | null;
  lastActivityProbeTriggerAt: number | null;
  isTransitioning: boolean;
  lastStateChange: number;
}

export interface BackgroundServiceVehicleMotionDeps {
  startActivityUpdates: () => void;
  stopActivityUpdates: () => void;
  addListener: (eventName: 'onActivityUpdate', listener: (data: ActivityData) => void | Promise<void>) => void;
  removeAllListeners: (eventName: 'onActivityUpdate') => void;
}

export interface BackgroundServiceDeps {
  Location: typeof Location;
  // Notifications: typeof Notifications;
  JourneyService: Pick<
    JourneyServiceController,
    'startJourney' | 'getCurrentJourneyId' | 'logEvent' | 'updateJourneyTitle' | 'endJourney' | 'deleteJourney' | 'deleteEventsSince'
  >;
  EfficiencyService: Pick<
    EfficiencyServiceController,
    'startTracking' | 'stopTracking' | 'processLocation' | 'calculateJourneyScore' | 'getJourneyEfficiencyStats'
  >;
  VehicleMotion?: BackgroundServiceVehicleMotionDeps;
  now: () => number;
  logger: ReturnType<typeof createLogger>;
}

export interface BackgroundServiceController {
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
