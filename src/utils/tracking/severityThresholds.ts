import type { DrivingEventFamily, EventSeverity } from '@/types/db';
import type { SpeedBand } from '@/types/tracking';

export interface LongitudinalTierThreshold {
  minForceG: number;
  minRateKmhPerSec: number;
}

export interface CorneringTierThreshold {
  minForceG: number;
  minHeadingChangeDeg: number;
}

export const SEVERITY_ORDER_DESC: EventSeverity[] = ['harsh', 'moderate', 'light'];

export const BRAKING_TIER_THRESHOLDS: Record<SpeedBand, Record<EventSeverity, LongitudinalTierThreshold>> = {
  low: {
    light: { minForceG: 0.16, minRateKmhPerSec: 7 },
    moderate: { minForceG: 0.24, minRateKmhPerSec: 10 },
    harsh: { minForceG: 0.34, minRateKmhPerSec: 14 },
  },
  mid: {
    light: { minForceG: 0.14, minRateKmhPerSec: 6 },
    moderate: { minForceG: 0.22, minRateKmhPerSec: 9 },
    harsh: { minForceG: 0.32, minRateKmhPerSec: 12 },
  },
  high: {
    light: { minForceG: 0.12, minRateKmhPerSec: 5 },
    moderate: { minForceG: 0.2, minRateKmhPerSec: 8 },
    harsh: { minForceG: 0.3, minRateKmhPerSec: 10 },
  },
  very_high: {
    light: { minForceG: 0.1, minRateKmhPerSec: 4 },
    moderate: { minForceG: 0.18, minRateKmhPerSec: 7 },
    harsh: { minForceG: 0.28, minRateKmhPerSec: 8 },
  },
};

export const ACCELERATION_TIER_THRESHOLDS: Record<SpeedBand, Record<EventSeverity, LongitudinalTierThreshold>> = {
  low: {
    light: { minForceG: 0.14, minRateKmhPerSec: 7 },
    moderate: { minForceG: 0.22, minRateKmhPerSec: 10 },
    harsh: { minForceG: 0.32, minRateKmhPerSec: 15 },
  },
  mid: {
    light: { minForceG: 0.12, minRateKmhPerSec: 6 },
    moderate: { minForceG: 0.2, minRateKmhPerSec: 9 },
    harsh: { minForceG: 0.28, minRateKmhPerSec: 12 },
  },
  high: {
    light: { minForceG: 0.1, minRateKmhPerSec: 5 },
    moderate: { minForceG: 0.18, minRateKmhPerSec: 7 },
    harsh: { minForceG: 0.26, minRateKmhPerSec: 9 },
  },
  very_high: {
    light: { minForceG: 0.09, minRateKmhPerSec: 4 },
    moderate: { minForceG: 0.16, minRateKmhPerSec: 6 },
    harsh: { minForceG: 0.24, minRateKmhPerSec: 7 },
  },
};

export const CORNERING_TIER_THRESHOLDS: Record<SpeedBand, Record<EventSeverity, CorneringTierThreshold>> = {
  low: {
    light: { minForceG: 0.2, minHeadingChangeDeg: 12 },
    moderate: { minForceG: 0.32, minHeadingChangeDeg: 18 },
    harsh: { minForceG: 0.65, minHeadingChangeDeg: 35 },
  },
  mid: {
    light: { minForceG: 0.18, minHeadingChangeDeg: 10 },
    moderate: { minForceG: 0.28, minHeadingChangeDeg: 15 },
    harsh: { minForceG: 0.55, minHeadingChangeDeg: 25 },
  },
  high: {
    light: { minForceG: 0.15, minHeadingChangeDeg: 8 },
    moderate: { minForceG: 0.24, minHeadingChangeDeg: 12 },
    harsh: { minForceG: 0.5, minHeadingChangeDeg: 20 },
  },
  very_high: {
    light: { minForceG: 0.12, minHeadingChangeDeg: 6 },
    moderate: { minForceG: 0.2, minHeadingChangeDeg: 10 },
    harsh: { minForceG: 0.45, minHeadingChangeDeg: 15 },
  },
};

export const SPEEDING_THRESHOLD_KMH: Record<EventSeverity, number> = {
  light: 90,
  moderate: 100,
  harsh: 120,
};

export const DETECTION_COOLDOWN_MS: Record<DrivingEventFamily, Record<EventSeverity, number>> = {
  braking: {
    light: 4000,
    moderate: 4000,
    harsh: 4000,
  },
  acceleration: {
    light: 4000,
    moderate: 4000,
    harsh: 4000,
  },
  cornering: {
    light: 5000,
    moderate: 5000,
    harsh: 5000,
  },
  speeding: {
    light: 0,
    moderate: 0,
    harsh: 0,
  },
};

export const CORNERING_MAX_ABS_SPEED_CHANGE_KMH_PER_SEC = 10;
