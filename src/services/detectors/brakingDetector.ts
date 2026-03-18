import { BRAKING_TIER_THRESHOLDS, DETECTION_COOLDOWN_MS } from '@utils/tracking/severityThresholds';
import { roundTo } from '@utils/number';

import type { DetectorContext, DetectorResult } from '@types';
import { createCooldownGate, findHighestSeverity } from '@services/detectors/shared';

interface BrakingDetector {
  detect: (context: DetectorContext) => DetectorResult;
  reset: () => void;
}

export const createBrakingDetector = (): BrakingDetector => {
  const cooldownGate = createCooldownGate(DETECTION_COOLDOWN_MS.braking);

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

    const severity = findHighestSeverity(thresholds, (tierThresholds) => {
      return decelRate >= tierThresholds.minRateKmhPerSec && horizontalForceG >= tierThresholds.minForceG;
    });

    const cooldownResult = cooldownGate.enter(nowMs, severity);
    if (cooldownResult) {
      return cooldownResult;
    }

    return {
      detected: true,
      severity,
      reason: 'none',
      metadata: {
        horizontalForceG: roundTo(horizontalForceG, 3),
        speedChangeRateKmhPerSec: roundTo(speedChangeRateKmhPerSec, 3),
      },
    };
  };

  const reset = () => {
    cooldownGate.reset();
  };

  return {
    detect,
    reset,
  };
};
