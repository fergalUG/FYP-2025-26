import type { ValidatedSpeed } from '@utils/gpsValidation';

export interface ActiveStopDecisionInput {
  effectiveSpeed: ValidatedSpeed;
  now: number;
  totalDistanceKm: number;
  lowSpeedStartTime: number | null;
  lowSpeedStartDistanceKm: number | null;
  isAutomotiveConfirmedForReset: boolean;
  passiveSpeedThreshold: number;
  timeoutMs: number;
  progressResetDistanceKm: number;
}

export type ActiveStopDecisionAction =
  | 'NONE'
  | 'START_CANDIDATE'
  | 'RESET_CANDIDATE_PROGRESS'
  | 'END_UNCONFIRMED_ACTIVITY'
  | 'ONGOING'
  | 'TIMEOUT'
  | 'CANCEL_CANDIDATE';

export interface ActiveStopDecisionResult {
  action: ActiveStopDecisionAction;
  finalDistanceKm?: number;
  secondsLeft?: number;
  timeoutMinutes?: number;
  distanceSinceCandidateStartKm?: number;
}

export const evaluateActiveStopDecision = (input: ActiveStopDecisionInput): ActiveStopDecisionResult => {
  const {
    effectiveSpeed,
    now,
    totalDistanceKm,
    lowSpeedStartTime,
    lowSpeedStartDistanceKm,
    isAutomotiveConfirmedForReset,
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
      if (!isAutomotiveConfirmedForReset) {
        return {
          action: 'END_UNCONFIRMED_ACTIVITY',
          finalDistanceKm: lowSpeedStartDistanceKm ?? totalDistanceKm,
          distanceSinceCandidateStartKm,
        };
      }

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
