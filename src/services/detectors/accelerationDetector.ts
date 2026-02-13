import { ACCELERATION_TIER_THRESHOLDS, DETECTION_COOLDOWN_MS, SEVERITY_ORDER_DESC } from '@utils/tracking/severityThresholds';

import type { DetectorContext, DetectorResult } from '@types';

export interface AccelerationDetector {
  detect: (context: DetectorContext) => DetectorResult;
  reset: () => void;
}

export const createAccelerationDetector = (): AccelerationDetector => {
  let lastEventTimeMs: number | null = null;

  const detect = (context: DetectorContext): DetectorResult => {
    const { nowMs, speedChangeRateKmhPerSec, horizontalForceG, speedBand } = context;
    if (speedChangeRateKmhPerSec <= 0) {
      return { detected: false, reason: 'none' };
    }

    const accelRate = speedChangeRateKmhPerSec;
    const thresholds = ACCELERATION_TIER_THRESHOLDS[speedBand];
    const ratePassesLight = accelRate >= thresholds.light.minRateKmhPerSec;
    if (!ratePassesLight) {
      return { detected: false, reason: 'rate' };
    }

    const forcePassesLight = horizontalForceG >= thresholds.light.minForceG;
    if (!forcePassesLight) {
      return { detected: false, reason: 'force' };
    }

    const severity =
      SEVERITY_ORDER_DESC.find((tier) => {
        const tierThresholds = thresholds[tier];
        return accelRate >= tierThresholds.minRateKmhPerSec && horizontalForceG >= tierThresholds.minForceG;
      }) ?? 'light';

    const cooldownMs = DETECTION_COOLDOWN_MS.acceleration[severity];
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
