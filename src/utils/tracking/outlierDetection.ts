import { MAX_ACCELERATION_MS2, MAX_DECELERATION_MS2 } from '@constants/tracking';

import type { OutlierCheckResult } from '@/types/tracking';

export const checkSpeedOutlier = (currentSpeedMs: number, lastSpeedMs: number, timeDeltaSeconds: number): OutlierCheckResult => {
  if (timeDeltaSeconds <= 0) {
    return {
      isOutlier: true,
      reason: 'Non-positive time delta',
      fallbackSpeed: lastSpeedMs,
    };
  }

  const acceleration = (currentSpeedMs - lastSpeedMs) / timeDeltaSeconds;

  if (acceleration > MAX_ACCELERATION_MS2) {
    return {
      isOutlier: true,
      reason: `Acceleration too high (${acceleration.toFixed(2)} m/s²)`,
      fallbackSpeed: lastSpeedMs,
    };
  }

  if (acceleration < MAX_DECELERATION_MS2) {
    return {
      isOutlier: true,
      reason: `Deceleration too high (${acceleration.toFixed(2)} m/s²)`,
      fallbackSpeed: lastSpeedMs,
    };
  }

  return {
    isOutlier: false,
    fallbackSpeed: currentSpeedMs,
  };
};
