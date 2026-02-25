import type { TrackingState } from '@types';

export const resetPassiveStartCandidate = (state: TrackingState): void => {
  state.passiveStartCandidateSince = null;
  state.passiveStartCandidateCount = 0;
};

export const resetPassiveActivityCandidate = (state: TrackingState): void => {
  state.passiveActivityCandidateSince = null;
};

export const clearLowSpeedCandidate = (state: TrackingState): void => {
  state.lowSpeedStartTime = null;
  state.lowSpeedStartDistanceKm = null;
  state.lowSpeedStartEventTimestamp = null;
  state.lowSpeedStartLocation = null;
};
