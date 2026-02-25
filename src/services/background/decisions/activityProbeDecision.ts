import { calculateDistanceKm } from '@utils/gpsValidation';

import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { PassiveTrackingProfile } from '@/types/services/backgroundService';
import type { TrackingMode } from '@/types/tracking';
import type { ValidatedSpeed } from '@utils/gpsValidation';
import type * as Location from 'expo-location';

interface ActivityProbeDecisionInput {
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

type ActivityProbeDecisionAction = 'NONE' | 'SET_CANDIDATE' | 'RESET_CANDIDATE' | 'TRIGGER_PROBE';

interface ActivityProbeDecisionResult {
  action: ActivityProbeDecisionAction;
  nextCandidateSince: number | null;
  nextLastTriggerAt: number | null;
  shouldSwitchToProbe: boolean;
}

export const resolveActivityConfidenceScore = (confidence: ActivityData['confidence']): number => {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

export const evaluateActivityProbeDecision = (input: ActivityProbeDecisionInput): ActivityProbeDecisionResult => {
  const {
    mode,
    isTransitioning,
    passiveTrackingProfile,
    passiveActivityCandidateSince,
    lastActivityProbeTriggerAt,
    now,
    activity,
    minConfidenceScore,
    debounceMs,
    cooldownMs,
  } = input;

  if (mode !== 'PASSIVE' || isTransitioning) {
    return {
      action: 'RESET_CANDIDATE',
      nextCandidateSince: null,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  const confidenceScore = resolveActivityConfidenceScore(activity.confidence);
  if (!activity.automotive || confidenceScore < minConfidenceScore) {
    if (!activity.automotive && confidenceScore >= minConfidenceScore) {
      return {
        action: 'RESET_CANDIDATE',
        nextCandidateSince: null,
        nextLastTriggerAt: lastActivityProbeTriggerAt,
        shouldSwitchToProbe: false,
      };
    }

    return {
      action: 'NONE',
      nextCandidateSince: passiveActivityCandidateSince,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  if (lastActivityProbeTriggerAt !== null && now - lastActivityProbeTriggerAt < cooldownMs) {
    return {
      action: 'NONE',
      nextCandidateSince: passiveActivityCandidateSince,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  if (passiveTrackingProfile === 'PROBE') {
    return {
      action: 'RESET_CANDIDATE',
      nextCandidateSince: null,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  if (passiveActivityCandidateSince === null) {
    return {
      action: 'SET_CANDIDATE',
      nextCandidateSince: now,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  if (now - passiveActivityCandidateSince < debounceMs) {
    return {
      action: 'NONE',
      nextCandidateSince: passiveActivityCandidateSince,
      nextLastTriggerAt: lastActivityProbeTriggerAt,
      shouldSwitchToProbe: false,
    };
  }

  return {
    action: 'TRIGGER_PROBE',
    nextCandidateSince: null,
    nextLastTriggerAt: now,
    shouldSwitchToProbe: true,
  };
};

export const shouldTriggerPassiveProbeFromLocation = (
  previousLocation: Location.LocationObject | null,
  currentLocation: Location.LocationObject,
  effectiveSpeed: ValidatedSpeed,
  passiveProbeTriggerSpeedThreshold: number,
  passiveProbeMinDisplacementKm: number
): boolean => {
  if (!effectiveSpeed.isValid || effectiveSpeed.value < passiveProbeTriggerSpeedThreshold) {
    return false;
  }

  if (effectiveSpeed.source === 'gps') {
    return true;
  }

  if (!previousLocation) {
    return false;
  }

  const displacementKm = calculateDistanceKm(
    previousLocation.coords.latitude,
    previousLocation.coords.longitude,
    currentLocation.coords.latitude,
    currentLocation.coords.longitude
  );

  return displacementKm >= passiveProbeMinDisplacementKm;
};
