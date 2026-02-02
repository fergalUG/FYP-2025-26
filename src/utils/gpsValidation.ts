import type * as Location from 'expo-location';

import { createLogger, LogModule } from '@utils/logger';
import { DEFAULT_GPS_CONFIG } from '@constants/gpsConfig';
import { MAX_DISTANCE_DEVIATION_METERS } from '@constants/tracking';

import type { DistanceValidationResult } from '@/types/tracking';

const logger = createLogger(LogModule.EfficiencyService);

export type SpeedConfidence = 'high' | 'medium' | 'low' | 'none';
export type SpeedSource = 'gps' | 'calculated' | 'none';

export interface ValidatedSpeed {
  value: number;
  isValid: boolean;
  confidence: SpeedConfidence;
  source: SpeedSource;
  reason?: string;
}

export interface GpsValidationOptions {
  minValidSpeed?: number;
  maxValidSpeed?: number;
  minAccuracy?: number;
  maxAccuracy?: number;
}

const DEFAULT_VALIDATION_OPTIONS: Required<GpsValidationOptions> = {
  minValidSpeed: DEFAULT_GPS_CONFIG.MIN_VALID_SPEED,
  maxValidSpeed: DEFAULT_GPS_CONFIG.MAX_VALID_SPEED,
  minAccuracy: DEFAULT_GPS_CONFIG.MIN_ACCURACY,
  maxAccuracy: DEFAULT_GPS_CONFIG.MAX_ACCURACY,
};

const toRad = (degrees: number): number => degrees * (Math.PI / 180);

export const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const validateGpsSpeed = (
  speed: number | null | undefined,
  accuracy: number | null | undefined,
  options?: GpsValidationOptions
): ValidatedSpeed => {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };

  if (speed === null || speed === undefined) {
    return {
      value: 0,
      isValid: false,
      confidence: 'none',
      source: 'none',
      reason: 'Speed is null or undefined',
    };
  }

  if (speed < 0) {
    return {
      value: 0,
      isValid: false,
      confidence: 'none',
      source: 'none',
      reason: `GPS reports no speed fix (speed=${speed})`,
    };
  }

  if (speed > opts.maxValidSpeed) {
    return {
      value: speed,
      isValid: false,
      confidence: 'none',
      source: 'gps',
      reason: `Speed exceeds maximum valid threshold (${speed} > ${opts.maxValidSpeed} m/s)`,
    };
  }

  if (accuracy !== null && accuracy !== undefined) {
    if (accuracy > opts.maxAccuracy) {
      return {
        value: speed,
        isValid: false,
        confidence: 'none',
        source: 'gps',
        reason: `Accuracy exceeds maximum threshold (${accuracy}m > ${opts.maxAccuracy}m)`,
      };
    }

    if (accuracy > opts.minAccuracy) {
      return {
        value: speed,
        isValid: true,
        confidence: 'medium',
        source: 'gps',
        reason: `Accuracy is acceptable but not optimal (${accuracy}m)`,
      };
    }
  }

  if (speed < opts.minValidSpeed) {
    return {
      value: speed,
      isValid: true,
      confidence: 'low',
      source: 'gps',
      reason: `Speed below minimum reliable threshold (${speed} < ${opts.minValidSpeed} m/s)`,
    };
  }

  return {
    value: speed,
    isValid: true,
    confidence: 'high',
    source: 'gps',
  };
};

// this is our fallback speed calculation when GPS speed is invalid
export const calculateSpeedFromLocations = (prevLocation: Location.LocationObject, currentLocation: Location.LocationObject): number => {
  const distanceKm = calculateDistanceKm(
    prevLocation.coords.latitude,
    prevLocation.coords.longitude,
    currentLocation.coords.latitude,
    currentLocation.coords.longitude
  );

  const timeDeltaMs = currentLocation.timestamp - prevLocation.timestamp;

  if (timeDeltaMs < 500) {
    logger.debug('Time delta too small for speed calculation', { timeDeltaMs });
    return 0;
  }

  const timeDeltaSeconds = timeDeltaMs / 1000;
  const distanceMeters = distanceKm * 1000;
  const speedMs = distanceMeters / timeDeltaSeconds;

  logger.debug('Calculated speed from locations', {
    distanceMeters: Math.round(distanceMeters),
    timeDeltaSeconds: Math.round(timeDeltaSeconds * 10) / 10,
    speedMs: Math.round(speedMs * 100) / 100,
  });

  return speedMs;
};

export const validateDistanceCalculation = (
  calculatedDistanceKm: number,
  speedMs: number,
  timeDeltaSeconds: number,
  accuracy: number | null | undefined
): DistanceValidationResult => {
  if (timeDeltaSeconds <= 0) {
    return {
      isValid: false,
      reason: 'Non-positive time delta',
      adjustedDistanceKm: 0,
    };
  }

  if (accuracy !== null && accuracy !== undefined && accuracy > DEFAULT_GPS_CONFIG.MAX_ACCURACY) {
    return {
      isValid: false,
      reason: `Accuracy too low for distance (${accuracy}m)`,
      adjustedDistanceKm: 0,
    };
  }

  const expectedDistanceMeters = speedMs * timeDeltaSeconds;
  const calculatedDistanceMeters = calculatedDistanceKm * 1000;
  const deviationMeters = Math.abs(calculatedDistanceMeters - expectedDistanceMeters);

  if (deviationMeters > MAX_DISTANCE_DEVIATION_METERS) {
    return {
      isValid: false,
      reason: `Distance deviation too large (${Math.round(deviationMeters)}m)`,
      adjustedDistanceKm: 0,
    };
  }

  return {
    isValid: true,
    adjustedDistanceKm: calculatedDistanceKm,
  };
};

export const convertMsToKmh = (speedMs: number): number => speedMs * 3.6;

export const convertKmhToMs = (speedKmh: number): number => speedKmh / 3.6;
