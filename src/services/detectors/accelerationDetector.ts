import { DETECTION_COOLDOWN_MS, ACCELERATION_TIER_THRESHOLDS } from '@utils/tracking/severityThresholds';
import { roundTo } from '@utils/number';

import type { DetectorContext, DetectorResult } from '@types';
import { createCooldownGate, findHighestSeverity } from '@services/detectors/shared';

interface AccelerationDetector {
  detect: (context: DetectorContext) => DetectorResult;
  reset: () => void;
}

export const createAccelerationDetector = (): AccelerationDetector => {
  const cooldownGate = createCooldownGate(DETECTION_COOLDOWN_MS.acceleration);

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

    const severity = findHighestSeverity(thresholds, (tierThresholds) => {
      return accelRate >= tierThresholds.minRateKmhPerSec && horizontalForceG >= tierThresholds.minForceG;
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
