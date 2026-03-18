import type { EventSeverity } from '@/types/db';

import type { DetectorResult } from '@types';
import { SEVERITY_ORDER_DESC } from '@utils/tracking/severityThresholds';

export const findHighestSeverity = <TThreshold>(
  thresholds: Record<EventSeverity, TThreshold>,
  matchesThreshold: (threshold: TThreshold) => boolean
): EventSeverity => {
  return SEVERITY_ORDER_DESC.find((severity) => matchesThreshold(thresholds[severity])) ?? 'light';
};

export const createCooldownGate = (cooldownsBySeverity: Record<EventSeverity, number>) => {
  let lastEventTimeMs: number | null = null;

  return {
    enter: (nowMs: number, severity: EventSeverity): DetectorResult | null => {
      const cooldownMs = cooldownsBySeverity[severity];
      if (lastEventTimeMs !== null && nowMs - lastEventTimeMs < cooldownMs) {
        return { detected: false, reason: 'cooldown' };
      }

      lastEventTimeMs = nowMs;
      return null;
    },
    reset: (): void => {
      lastEventTimeMs = null;
    },
  };
};
