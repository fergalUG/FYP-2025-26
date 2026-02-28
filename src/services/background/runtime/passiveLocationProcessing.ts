import {
  ACTIVE_SPEED_THRESHOLD,
  PASSIVE_PROBE_DURATION_MS,
  PASSIVE_PROBE_MIN_DISPLACEMENT_KM,
  PASSIVE_PROBE_TRIGGER_SPEED_THRESHOLD,
  PASSIVE_START_CONFIRMATION_COUNT,
  PASSIVE_START_CONFIRMATION_WINDOW_MS,
} from '@constants/gpsConfig';
import { evaluatePassiveStartDecision } from '@services/background/decisions/passiveStartDecision';
import { shouldTriggerPassiveProbeFromLocation } from '@services/background/decisions/activityProbeDecision';
import { convertMsToKmh, type ValidatedSpeed } from '@utils/gpsValidation';

import type { PassiveTrackingProfile, TrackingState } from '@types';
import type { createLogger } from '@utils/logger';
import type * as Location from 'expo-location';

interface ProcessPassiveLocationInput {
  state: TrackingState;
  location: Location.LocationObject;
  locationForProcessing: Location.LocationObject;
  effectiveSpeed: ValidatedSpeed;
  nowMs: number;
  switchPassiveTrackingProfile: (profile: PassiveTrackingProfile, reason: string) => Promise<void>;
  startActiveTracking: (triggerLocation: Location.LocationObject | null) => Promise<void>;
  logger: ReturnType<typeof createLogger>;
}

type PassiveLocationProcessingResult = 'CONTINUE' | 'STARTED_ACTIVE';

export const processPassiveLocation = async (input: ProcessPassiveLocationInput): Promise<PassiveLocationProcessingResult> => {
  const { state, location, locationForProcessing, effectiveSpeed, nowMs, switchPassiveTrackingProfile, startActiveTracking, logger } =
    input;

  if (
    state.passiveTrackingProfile === 'COARSE' &&
    shouldTriggerPassiveProbeFromLocation(
      state.lastLocation,
      location,
      effectiveSpeed,
      PASSIVE_PROBE_TRIGGER_SPEED_THRESHOLD,
      PASSIVE_PROBE_MIN_DISPLACEMENT_KM
    )
  ) {
    await switchPassiveTrackingProfile('PROBE', 'movement signal detected');
  } else if (
    state.passiveTrackingProfile === 'PROBE' &&
    state.passiveProbeStartedAt !== null &&
    nowMs - state.passiveProbeStartedAt >= PASSIVE_PROBE_DURATION_MS
  ) {
    await switchPassiveTrackingProfile('COARSE', 'probe timeout reached without active confirmation');
  }

  const passiveStartDecision = evaluatePassiveStartDecision({
    effectiveSpeed,
    locationTimestamp: location.timestamp,
    candidateSince: state.passiveStartCandidateSince,
    candidateCount: state.passiveStartCandidateCount,
    activeSpeedThreshold: ACTIVE_SPEED_THRESHOLD,
    confirmationCount: PASSIVE_START_CONFIRMATION_COUNT,
    confirmationWindowMs: PASSIVE_START_CONFIRMATION_WINDOW_MS,
  });
  state.passiveStartCandidateSince = passiveStartDecision.nextCandidateSince;
  state.passiveStartCandidateCount = passiveStartDecision.nextCandidateCount;

  if (passiveStartDecision.action === 'START_ACTIVE_GPS') {
    const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
    logger.info(
      `Speed exceeded ${convertMsToKmh(ACTIVE_SPEED_THRESHOLD).toFixed(1)}km/h (valid: ${speedLabelKmh} km/h); switching to ACTIVE tracking mode.`
    );
    await startActiveTracking(locationForProcessing);
    return 'STARTED_ACTIVE';
  }

  if (passiveStartDecision.action === 'UPDATE_CANDIDATE') {
    const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
    logger.debug(
      `Passive start candidate ${state.passiveStartCandidateCount}/${PASSIVE_START_CONFIRMATION_COUNT} from calculated speed (${speedLabelKmh} km/h).`,
      {
        candidateSince: state.passiveStartCandidateSince,
        candidateWindowMs: PASSIVE_START_CONFIRMATION_WINDOW_MS,
      }
    );
  }

  if (passiveStartDecision.action === 'START_ACTIVE_CALCULATED') {
    const speedLabelKmh = convertMsToKmh(effectiveSpeed.value).toFixed(1);
    logger.info(
      `Calculated speed confirmed above ${convertMsToKmh(ACTIVE_SPEED_THRESHOLD).toFixed(1)}km/h (valid: ${speedLabelKmh} km/h); switching to ACTIVE tracking mode.`
    );
    await startActiveTracking(locationForProcessing);
    return 'STARTED_ACTIVE';
  }

  if (passiveStartDecision.action === 'RESET_CANDIDATE') {
    logger.debug('Passive start candidate reset because speed dropped below threshold or became invalid.');
  }

  state.lastLocation = location;
  return 'CONTINUE';
};
