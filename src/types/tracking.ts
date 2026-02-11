import type { SpeedConfidence, SpeedSource } from '@utils/gpsValidation';

export type ServiceState = 'stopped' | 'passive' | 'active';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type TrackingMode = 'PASSIVE' | 'ACTIVE';
export type SpeedBand = 'low' | 'mid' | 'high' | 'very_high';

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

export interface SpeedSample {
  speedMs: number;
  confidence: SpeedConfidence;
  source: SpeedSource;
}

export interface SmoothedSpeed {
  speedMs: number;
  confidence: SpeedConfidence;
  source: SpeedSource;
  samples: number;
}

export interface GpsDropoutState {
  isInDropout: boolean;
  dropoutStartTime: number | null;
}

export interface ServiceHealth {
  isHealthy: boolean;
  issues: string[];
  lastLocationTimestamp: number | null;
  consecutiveInvalidSpeeds: number;
  timeSinceLastLocationMs: number | null;
  gpsDropoutDurationMs: number | null;
}
