import {
  SEVERITY_ORDER_DESC,
  SPEEDING_HYSTERESIS_MARGIN_KMH,
  SPEEDING_OVER_LIMIT_THRESHOLD_KMH,
  SPEEDING_PERSISTENCE_MS,
} from '@utils/tracking/severityThresholds';

import type { DetectorResult, SpeedingDetectorContext } from '@types';

type SpeedingBand = 'none' | 'light' | 'moderate' | 'harsh';

interface SpeedingDetector {
  detect: (context: SpeedingDetectorContext) => DetectorResult;
  reset: () => void;
}

export const createSpeedingDetector = (): SpeedingDetector => {
  let currentBand: SpeedingBand = 'none';
  let speedingStartedAtMs: number | null = null;

  const resolveBand = (overLimitKmh: number, previous: SpeedingBand): SpeedingBand => {
    const light = SPEEDING_OVER_LIMIT_THRESHOLD_KMH.light;
    const moderate = SPEEDING_OVER_LIMIT_THRESHOLD_KMH.moderate;
    const harsh = SPEEDING_OVER_LIMIT_THRESHOLD_KMH.harsh;
    const margin = SPEEDING_HYSTERESIS_MARGIN_KMH;

    if (overLimitKmh > harsh + margin) {
      return 'harsh';
    }
    if (overLimitKmh > moderate + margin) {
      return 'moderate';
    }
    if (overLimitKmh > light + margin) {
      return 'light';
    }

    if (previous === 'harsh' && overLimitKmh > harsh - margin) {
      return 'harsh';
    }
    if ((previous === 'harsh' || previous === 'moderate') && overLimitKmh > moderate - margin) {
      return 'moderate';
    }
    if (previous !== 'none' && overLimitKmh > light - margin) {
      return 'light';
    }

    return 'none';
  };

  const detect = (context: SpeedingDetectorContext): DetectorResult => {
    const { nowMs, speedKmh, speedLimitKmh } = context;
    if (!Number.isFinite(nowMs) || !Number.isFinite(speedKmh) || !Number.isFinite(speedLimitKmh) || speedLimitKmh <= 0) {
      return { detected: false, reason: 'none' };
    }

    const overLimitKmh = speedKmh - speedLimitKmh;
    const nextBand = resolveBand(overLimitKmh, currentBand);

    if (currentBand === 'none' && nextBand !== 'none') {
      speedingStartedAtMs = nowMs;
    } else if (nextBand === 'none') {
      speedingStartedAtMs = null;
    }

    if (nextBand !== currentBand) {
      currentBand = nextBand;
    }

    if (currentBand === 'none') {
      return { detected: false, reason: 'none' };
    }

    if (speedingStartedAtMs === null || nowMs - speedingStartedAtMs < SPEEDING_PERSISTENCE_MS) {
      return { detected: false, reason: 'persistence' };
    }

    const severity = SEVERITY_ORDER_DESC.find((candidate) => candidate === currentBand);
    if (!severity) {
      return { detected: false, reason: 'none' };
    }

    return {
      detected: true,
      severity,
      reason: 'none',
      metadata: {
        speedLimitKmh: Number(speedLimitKmh.toFixed(1)),
        overLimitKmh: Number(overLimitKmh.toFixed(2)),
      },
    };
  };

  const reset = (): void => {
    currentBand = 'none';
    speedingStartedAtMs = null;
  };

  return {
    detect,
    reset,
  };
};
