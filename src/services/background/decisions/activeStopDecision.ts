import type { ActiveStopDecisionInput, ActiveStopDecisionResult } from '@/types/services/background/decisions';

export const evaluateActiveStopDecision = (input: ActiveStopDecisionInput): ActiveStopDecisionResult => {
  const {
    effectiveSpeed,
    now,
    totalDistanceKm,
    lowSpeedStartTime,
    lowSpeedStartDistanceKm,
    passiveSpeedThreshold,
    timeoutMs,
    progressResetDistanceKm,
  } = input;

  if (!effectiveSpeed.isValid || effectiveSpeed.value < passiveSpeedThreshold) {
    if (lowSpeedStartTime === null) {
      return {
        action: 'START_CANDIDATE',
      };
    }

    const distanceAtCandidateStart = lowSpeedStartDistanceKm ?? totalDistanceKm;
    const distanceSinceCandidateStartKm = Math.max(0, totalDistanceKm - distanceAtCandidateStart);

    if (distanceSinceCandidateStartKm >= progressResetDistanceKm) {
      return {
        action: 'RESET_CANDIDATE_PROGRESS',
        distanceSinceCandidateStartKm,
      };
    }

    const elapsedTime = now - lowSpeedStartTime;
    if (elapsedTime >= timeoutMs) {
      return {
        action: 'TIMEOUT',
        finalDistanceKm: lowSpeedStartDistanceKm ?? totalDistanceKm,
        timeoutMinutes: Math.round(timeoutMs / 60000),
      };
    }

    return {
      action: 'ONGOING',
      secondsLeft: Math.ceil((timeoutMs - elapsedTime) / 1000),
    };
  }

  if (effectiveSpeed.isValid && effectiveSpeed.value >= passiveSpeedThreshold && lowSpeedStartTime !== null) {
    return {
      action: 'CANCEL_CANDIDATE',
    };
  }

  return {
    action: 'NONE',
  };
};
