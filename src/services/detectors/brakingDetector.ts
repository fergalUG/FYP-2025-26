import { BRAKING_TIER_THRESHOLDS, DETECTION_COOLDOWN_MS, SEVERITY_ORDER_DESC } from '@utils/tracking/severityThresholds';

import type { DetectorContext, DetectorResult } from '@types';

export interface BrakingDetector {
  detect: (context: DetectorContext) => DetectorResult;
  reset: () => void;
}

export const createBrakingDetector = (): BrakingDetector => {
  let lastEventTimeMs: number | null = null;

  const detect = (context: DetectorContext): DetectorResult => {
    const { nowMs, speedChangeRateKmhPerSec, horizontalForceG, speedBand } = context;
    if (speedChangeRateKmhPerSec >= 0) {
      return { detected: false, reason: 'none' };
    }

    const decelRate = Math.abs(speedChangeRateKmhPerSec);
    const thresholds = BRAKING_TIER_THRESHOLDS[speedBand];
    const ratePassesLight = decelRate >= thresholds.light.minRateKmhPerSec;
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
        return decelRate >= tierThresholds.minRateKmhPerSec && horizontalForceG >= tierThresholds.minForceG;
      }) ?? 'light';

    const cooldownMs = DETECTION_COOLDOWN_MS.braking[severity];
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
