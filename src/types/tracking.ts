import type * as Location from 'expo-location';

export type ServiceState = 'stopped' | 'passive' | 'active';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type TrackingMode = 'PASSIVE' | 'ACTIVE';

export interface TrackingStatus {
  mode: TrackingMode;
  isMonitoring: boolean;
}

export interface OutlierCheckResult {
  isOutlier: boolean;
  reason?: string;
  fallbackSpeed: number;
}

export interface DistanceValidationResult {
  isValid: boolean;
  reason?: string;
  adjustedDistanceKm: number;
}

export interface GpsDropoutState {
  isInDropout: boolean;
  dropoutStartTime: number | null;
  lastKnownLocation: Location.LocationObject | null;
  lastKnownSpeed: number;
}

export interface ServiceHealth {
  isHealthy: boolean;
  issues: string[];
  lastLocationTimestamp: number | null;
  consecutiveInvalidSpeeds: number;
  timeSinceLastLocationMs: number | null;
  gpsDropoutDurationMs: number | null;
}
