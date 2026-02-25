import { SEVERITY_ORDER_DESC, SPEEDING_THRESHOLD_KMH } from '@utils/tracking/severityThresholds';

import type { EventSeverity } from '@/types/db';

interface SpeedingDetector {
  detect: (speedKmh: number) => EventSeverity | null;
}

export const createSpeedingDetector = (): SpeedingDetector => {
  const detect = (speedKmh: number): EventSeverity | null => {
    return (
      SEVERITY_ORDER_DESC.find((severity) => {
        return speedKmh > SPEEDING_THRESHOLD_KMH[severity];
      }) ?? null
    );
  };

  return {
    detect,
  };
};
