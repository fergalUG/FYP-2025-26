import type { PassiveStartDecisionInput, PassiveStartDecisionResult } from '@/types/services/background/decisions';

export const evaluatePassiveStartDecision = (input: PassiveStartDecisionInput): PassiveStartDecisionResult => {
  const {
    effectiveSpeed,
    locationTimestamp,
    candidateSince,
    candidateCount,
    activeSpeedThreshold,
    confirmationCount,
    confirmationWindowMs,
  } = input;

  if (effectiveSpeed.isValid && effectiveSpeed.value >= activeSpeedThreshold) {
    if (effectiveSpeed.source === 'gps') {
      return {
        action: 'START_ACTIVE_GPS',
        nextCandidateSince: null,
        nextCandidateCount: 0,
      };
    }

    const shouldResetCandidateWindow = candidateSince === null || locationTimestamp - candidateSince > confirmationWindowMs;
    const nextCandidateSince = shouldResetCandidateWindow ? locationTimestamp : candidateSince;
    const nextCandidateCount = shouldResetCandidateWindow ? 1 : candidateCount + 1;

    if (nextCandidateCount >= confirmationCount) {
      return {
        action: 'START_ACTIVE_CALCULATED',
        nextCandidateSince: null,
        nextCandidateCount: 0,
      };
    }

    return {
      action: 'UPDATE_CANDIDATE',
      nextCandidateSince,
      nextCandidateCount,
    };
  }

  if (candidateCount > 0) {
    return {
      action: 'RESET_CANDIDATE',
      nextCandidateSince: null,
      nextCandidateCount: 0,
    };
  }

  return {
    action: 'NONE',
    nextCandidateSince: candidateSince,
    nextCandidateCount: candidateCount,
  };
};
