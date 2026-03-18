import {
  CORNERING_MAX_ABS_SPEED_CHANGE_KMH_PER_SEC,
  CORNERING_TIER_THRESHOLDS,
  DETECTION_COOLDOWN_MS,
} from '@utils/tracking/severityThresholds';
import { roundTo } from '@utils/number';

import type { CorneringDetectorContext, DetectorResult } from '@types';
import { createCooldownGate, findHighestSeverity } from '@services/detectors/shared';

interface CorneringDetector {
  detect: (context: CorneringDetectorContext) => DetectorResult;
  reset: () => void;
}

export const createCorneringDetector = (): CorneringDetector => {
  const cooldownGate = createCooldownGate(DETECTION_COOLDOWN_MS.cornering);

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

    const severity = findHighestSeverity(thresholds, (tierThresholds) => {
      return horizontalForceG >= tierThresholds.minForceG && headingChangeDeg >= tierThresholds.minHeadingChangeDeg;
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
        headingChangeDeg: roundTo(headingChangeDeg, 3),
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
