import type { DrivingEventFamily, EventSeverity } from '@/types/db';
import type { SpeedBand } from '@/types/tracking';

interface LongitudinalTierThreshold {
  minForceG: number;
  minRateKmhPerSec: number;
}

interface CorneringTierThreshold {
  minForceG: number;
  minHeadingChangeDeg: number;
}

interface OscillationTierThreshold {
  minSpeedStdDevKmh: number;
  minSignFlipCount: number;
  minForceP90G: number;
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

export const CORNERING_MAX_ABS_SPEED_CHANGE_KMH_PER_SEC = 10;

export const OSCILLATION_WINDOW_MS = 15 * 1000;
export const OSCILLATION_EPISODE_END_STABLE_MS = 8 * 1000;
export const OSCILLATION_MIN_SPEED_KMH = 10;
export const OSCILLATION_MIN_SPEED_SAMPLES = 6;
export const OSCILLATION_MIN_FORCE_SAMPLES = 20;
export const OSCILLATION_SIGN_CHANGE_DEADBAND_KMH_PER_SEC = 0.8;

export const STOP_AND_GO_STOP_SPEED_KMH = 4;
export const STOP_AND_GO_GO_SPEED_KMH = 10;
export const STOP_AND_GO_STOP_DWELL_MS = 3 * 1000;
export const STOP_AND_GO_GO_DWELL_MS = 3 * 1000;
export const STOP_AND_GO_WINDOW_MS = 120 * 1000;
export const STOP_AND_GO_MIN_CYCLES = 2;
export const STOP_AND_GO_EVENT_COOLDOWN_MS = 30 * 1000;

export const OSCILLATION_TIER_THRESHOLDS: Record<SpeedBand, Record<EventSeverity, OscillationTierThreshold>> = {
  low: {
    light: { minSpeedStdDevKmh: 3.2, minSignFlipCount: 3, minForceP90G: 0.12 },
    moderate: { minSpeedStdDevKmh: 4.6, minSignFlipCount: 4, minForceP90G: 0.16 },
    harsh: { minSpeedStdDevKmh: 6.2, minSignFlipCount: 5, minForceP90G: 0.22 },
  },
  mid: {
    light: { minSpeedStdDevKmh: 2.8, minSignFlipCount: 3, minForceP90G: 0.11 },
    moderate: { minSpeedStdDevKmh: 4.1, minSignFlipCount: 4, minForceP90G: 0.15 },
    harsh: { minSpeedStdDevKmh: 5.6, minSignFlipCount: 5, minForceP90G: 0.2 },
  },
  high: {
    light: { minSpeedStdDevKmh: 2.4, minSignFlipCount: 2, minForceP90G: 0.1 },
    moderate: { minSpeedStdDevKmh: 3.5, minSignFlipCount: 3, minForceP90G: 0.14 },
    harsh: { minSpeedStdDevKmh: 4.8, minSignFlipCount: 4, minForceP90G: 0.18 },
  },
  very_high: {
    light: { minSpeedStdDevKmh: 2.1, minSignFlipCount: 2, minForceP90G: 0.09 },
    moderate: { minSpeedStdDevKmh: 3.0, minSignFlipCount: 3, minForceP90G: 0.12 },
    harsh: { minSpeedStdDevKmh: 4.2, minSignFlipCount: 4, minForceP90G: 0.16 },
  },
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
  oscillation: {
    light: 0,
    moderate: 0,
    harsh: 0,
  },
};
