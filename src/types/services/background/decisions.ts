import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { PassiveTrackingProfile } from '@/types/services/backgroundService';
import type { TrackingMode } from '@/types/tracking';
import type { ValidatedSpeed } from '@utils/gpsValidation';

export interface PassiveStartDecisionInput {
  effectiveSpeed: ValidatedSpeed;
  locationTimestamp: number;
  candidateSince: number | null;
  candidateCount: number;
  activeSpeedThreshold: number;
  confirmationCount: number;
  confirmationWindowMs: number;
}

export type PassiveStartDecisionAction = 'NONE' | 'RESET_CANDIDATE' | 'UPDATE_CANDIDATE' | 'START_ACTIVE_GPS' | 'START_ACTIVE_CALCULATED';

export interface PassiveStartDecisionResult {
  action: PassiveStartDecisionAction;
  nextCandidateSince: number | null;
  nextCandidateCount: number;
}

export interface ActivityProbeDecisionInput {
  mode: TrackingMode;
  isTransitioning: boolean;
  passiveTrackingProfile: PassiveTrackingProfile;
  passiveActivityCandidateSince: number | null;
  lastActivityProbeTriggerAt: number | null;
  now: number;
  activity: ActivityData;
  minConfidenceScore: number;
  debounceMs: number;
  cooldownMs: number;
}

export type ActivityProbeDecisionAction = 'NONE' | 'SET_CANDIDATE' | 'RESET_CANDIDATE' | 'TRIGGER_PROBE';

export interface ActivityProbeDecisionResult {
  action: ActivityProbeDecisionAction;
  nextCandidateSince: number | null;
  nextLastTriggerAt: number | null;
  shouldSwitchToProbe: boolean;
}

export interface ActiveStopDecisionInput {
  effectiveSpeed: ValidatedSpeed;
  now: number;
  totalDistanceKm: number;
  lowSpeedStartTime: number | null;
  lowSpeedStartDistanceKm: number | null;
  passiveSpeedThreshold: number;
  timeoutMs: number;
  progressResetDistanceKm: number;
}

export type ActiveStopDecisionAction = 'NONE' | 'START_CANDIDATE' | 'RESET_CANDIDATE_PROGRESS' | 'ONGOING' | 'TIMEOUT' | 'CANCEL_CANDIDATE';

export interface ActiveStopDecisionResult {
  action: ActiveStopDecisionAction;
  finalDistanceKm?: number;
  secondsLeft?: number;
  timeoutMinutes?: number;
  distanceSinceCandidateStartKm?: number;
}
