import {
  CORNERING_MAX_ABS_SPEED_CHANGE_KMH_PER_SEC,
  CORNERING_TIER_THRESHOLDS,
  DETECTION_COOLDOWN_MS,
  SEVERITY_ORDER_DESC,
} from '@utils/tracking/severityThresholds';

import type { CorneringDetectorContext, DetectorResult } from '@types';

interface CorneringDetector {
  detect: (context: CorneringDetectorContext) => DetectorResult;
  reset: () => void;
}

export const createCorneringDetector = (): CorneringDetector => {
  let lastEventTimeMs: number | null = null;

  const detect = (context: CorneringDetectorContext): DetectorResult => {
    const { nowMs, speedChangeRateKmhPerSec, horizontalForceG, headingChangeDeg, speedBand } = context;

    if (headingChangeDeg === null || !Number.isFinite(headingChangeDeg)) {
      return { detected: false, reason: 'missing_heading' };
    }

    const absSpeedChangeRate = Math.abs(speedChangeRateKmhPerSec);
    if (absSpeedChangeRate > CORNERING_MAX_ABS_SPEED_CHANGE_KMH_PER_SEC) {
      return { detected: false, reason: 'speed_change' };
    }

    const thresholds = CORNERING_TIER_THRESHOLDS[speedBand];
    const forcePassesLight = horizontalForceG >= thresholds.light.minForceG;
    if (!forcePassesLight) {
      return { detected: false, reason: 'force' };
    }

    const headingPassesLight = headingChangeDeg >= thresholds.light.minHeadingChangeDeg;
    if (!headingPassesLight) {
      return { detected: false, reason: 'heading' };
    }

    const severity =
      SEVERITY_ORDER_DESC.find((tier) => {
        const tierThresholds = thresholds[tier];
        return horizontalForceG >= tierThresholds.minForceG && headingChangeDeg >= tierThresholds.minHeadingChangeDeg;
      }) ?? 'light';

    const cooldownMs = DETECTION_COOLDOWN_MS.cornering[severity];
    if (lastEventTimeMs !== null && nowMs - lastEventTimeMs < cooldownMs) {
      return { detected: false, reason: 'cooldown' };
    }

    lastEventTimeMs = nowMs;
    return {
      detected: true,
      severity,
      reason: 'none',
      metadata: {
        horizontalForceG: Number(horizontalForceG.toFixed(3)),
        headingChangeDeg: Number(headingChangeDeg.toFixed(3)),
        speedChangeRateKmhPerSec: Number(speedChangeRateKmhPerSec.toFixed(3)),
      },
    };
  };

  const reset = () => {
    lastEventTimeMs = null;
  };

  return {
    detect,
    reset,
  };
};
