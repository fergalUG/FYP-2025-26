import {
  LOW_SPEED_PROGRESS_RESET_DISTANCE_KM,
  LOW_SPEED_PROGRESS_RESET_MIN_DISPLACEMENT_KM,
  PASSIVE_SPEED_THRESHOLD,
  PASSIVE_TIMEOUT_MS,
} from '@constants/gpsConfig';
import { evaluateActiveStopDecision } from '@services/background/decisions/activeStopDecision';
import { clearLowSpeedCandidate } from '@services/background/state/mutators';
import type { TrackingState } from '@types';
import { calculateDistanceKm, convertMsToKmh, type ValidatedSpeed } from '@utils/gpsValidation';
import type { createLogger } from '@utils/logger';
import type * as Location from 'expo-location';

interface ActiveStopEndOptions {
  tailPruneFromTimestamp?: number | null;
  finalDistanceKm?: number;
  finalLocation?: Location.LocationObject | null;
}

export interface ActiveStopDebugContext {
  activityAgeMs: number | null;
  activityFresh: boolean;
  activityConfidence: string | null;
  activityConfidenceScore: number | null;
  activityAutomotive: boolean | null;
  activityWalking: boolean | null;
  activityRunning: boolean | null;
  activityCycling: boolean | null;
  activityStationary: boolean | null;
  nonAutomotiveCandidateSinceMs: number | null;
  nonAutomotiveCandidateAgeMs: number | null;
  nonAutomotiveConfirmationMs: number;
  nonAutomotiveMaxSpeedKmh: number;
  shouldEndForConfirmedNonAutomotiveProgress: boolean;
}

interface ProcessActiveStopDecisionInput {
  state: TrackingState;
  effectiveSpeed: ValidatedSpeed;
  nowMs: number;
  shouldEndForConfirmedNonAutomotiveProgress: boolean;
  debugContext?: ActiveStopDebugContext;
  endActiveTracking: (options?: ActiveStopEndOptions) => Promise<void>;
  logger: ReturnType<typeof createLogger>;
}

type ActiveStopProcessingResult = 'CONTINUE' | 'NEXT_LOCATION' | 'ENDED_ACTIVE';

interface CandidateDisplacementMetrics {
  rawDisplacementSinceCandidateStartKm: number | null;
  adjustedDisplacementSinceCandidateStartKm: number | null;
  accuracyAllowanceM: number | null;
}

const resolveCandidateDisplacementMetrics = (
  candidateStartLocation: Location.LocationObject | null,
  currentLocation: Location.LocationObject | null
): CandidateDisplacementMetrics => {
  if (!candidateStartLocation || !currentLocation) {
    return {
      rawDisplacementSinceCandidateStartKm: null,
      adjustedDisplacementSinceCandidateStartKm: null,
      accuracyAllowanceM: null,
    };
  }

  const rawDisplacementSinceCandidateStartKm = calculateDistanceKm(
    candidateStartLocation.coords.latitude,
    candidateStartLocation.coords.longitude,
    currentLocation.coords.latitude,
    currentLocation.coords.longitude
  );

  const startAccuracyM = Math.max(0, candidateStartLocation.coords.accuracy ?? 0);
  const currentAccuracyM = Math.max(0, currentLocation.coords.accuracy ?? 0);
  const accuracyAllowanceM = Math.max(startAccuracyM, currentAccuracyM);
  const adjustedDisplacementSinceCandidateStartKm = Math.max(0, rawDisplacementSinceCandidateStartKm - accuracyAllowanceM / 1000);

  return {
    rawDisplacementSinceCandidateStartKm,
    adjustedDisplacementSinceCandidateStartKm,
    accuracyAllowanceM,
  };
};

export const processActiveStopDecision = async (input: ProcessActiveStopDecisionInput): Promise<ActiveStopProcessingResult> => {
  const { state, effectiveSpeed, nowMs, shouldEndForConfirmedNonAutomotiveProgress, debugContext, endActiveTracking, logger } = input;
  const candidateDisplacementMetrics = resolveCandidateDisplacementMetrics(state.lowSpeedStartLocation, state.lastLocation);

  const activeStopDecision = evaluateActiveStopDecision({
    effectiveSpeed,
    now: nowMs,
    totalDistanceKm: state.totalDistance,
    lowSpeedStartTime: state.lowSpeedStartTime,
    lowSpeedStartDistanceKm: state.lowSpeedStartDistanceKm,
    adjustedDisplacementSinceCandidateStartKm: candidateDisplacementMetrics.adjustedDisplacementSinceCandidateStartKm,
    shouldEndForConfirmedNonAutomotiveProgress,
    passiveSpeedThreshold: PASSIVE_SPEED_THRESHOLD,
    timeoutMs: PASSIVE_TIMEOUT_MS,
    progressResetDistanceKm: LOW_SPEED_PROGRESS_RESET_DISTANCE_KM,
    progressResetMinDisplacementKm: LOW_SPEED_PROGRESS_RESET_MIN_DISPLACEMENT_KM,
  });

  if (debugContext) {
    logger.debug('Active stop decision evaluated', {
      action: activeStopDecision.action,
      speedKmh: convertMsToKmh(effectiveSpeed.value),
      speedValid: effectiveSpeed.isValid,
      lowSpeedStartTime: state.lowSpeedStartTime,
      distanceSinceCandidateStartM: (activeStopDecision.distanceSinceCandidateStartKm ?? 0) * 1000,
      rawDisplacementSinceCandidateStartM: (candidateDisplacementMetrics.rawDisplacementSinceCandidateStartKm ?? 0) * 1000,
      adjustedDisplacementSinceCandidateStartM: (candidateDisplacementMetrics.adjustedDisplacementSinceCandidateStartKm ?? 0) * 1000,
      displacementAccuracyAllowanceM: candidateDisplacementMetrics.accuracyAllowanceM,
      ...debugContext,
    });
  }

  if (activeStopDecision.action === 'START_CANDIDATE') {
    state.lowSpeedStartTime = nowMs;
    state.lowSpeedStartDistanceKm = state.totalDistance;
    state.lowSpeedStartEventTimestamp = nowMs;
    state.lowSpeedStartLocation = state.lastLocation;
    logger.debug(`Low speed or invalid speed detected (${effectiveSpeed.reason}); monitoring for timeout.`);
    return 'NEXT_LOCATION';
  }

  if (activeStopDecision.action === 'RESET_CANDIDATE_PROGRESS') {
    state.lowSpeedStartTime = nowMs;
    state.lowSpeedStartDistanceKm = state.totalDistance;
    state.lowSpeedStartEventTimestamp = nowMs;
    state.lowSpeedStartLocation = state.lastLocation;
    logger.info(
      `Low-speed timeout reset: vehicle moved ${((activeStopDecision.distanceSinceCandidateStartKm ?? 0) * 1000).toFixed(0)}m during candidate window with ${((candidateDisplacementMetrics.adjustedDisplacementSinceCandidateStartKm ?? 0) * 1000).toFixed(0)}m verified displacement.`
    );
    return 'NEXT_LOCATION';
  }

  if (activeStopDecision.action === 'END_CONFIRMED_NON_AUTOMOTIVE') {
    logger.info(
      `Low-speed progress detected (${((activeStopDecision.distanceSinceCandidateStartKm ?? 0) * 1000).toFixed(0)}m) with confirmed non-automotive activity; ending journey.`,
      debugContext
    );
    await endActiveTracking({
      tailPruneFromTimestamp: state.lowSpeedStartEventTimestamp,
      finalDistanceKm: activeStopDecision.finalDistanceKm ?? state.totalDistance,
      finalLocation: state.lowSpeedStartLocation ?? state.lastLocation,
    });
    return 'ENDED_ACTIVE';
  }

  if (activeStopDecision.action === 'TIMEOUT') {
    const timeoutMinutes = activeStopDecision.timeoutMinutes ?? Math.round(PASSIVE_TIMEOUT_MS / 60000);
    const thresholdSpeedKmh = convertMsToKmh(PASSIVE_SPEED_THRESHOLD).toFixed(1);
    logger.info(`Speed remained below ${thresholdSpeedKmh}km/h for ${timeoutMinutes} minutes; switching to PASSIVE tracking mode.`);
    await endActiveTracking({
      tailPruneFromTimestamp: state.lowSpeedStartEventTimestamp,
      finalDistanceKm: activeStopDecision.finalDistanceKm ?? state.totalDistance,
      finalLocation: state.lowSpeedStartLocation ?? state.lastLocation,
    });
    return 'ENDED_ACTIVE';
  }

  if (activeStopDecision.action === 'ONGOING') {
    logger.debug(
      `Low-speed condition ongoing; ${activeStopDecision.secondsLeft ?? Math.ceil(PASSIVE_TIMEOUT_MS / 1000)}s left before switching to PASSIVE mode.`
    );
    return 'NEXT_LOCATION';
  }

  if (activeStopDecision.action === 'CANCEL_CANDIDATE') {
    clearLowSpeedCandidate(state);
    logger.info('Speed recovered above threshold; low-speed monitoring cancelled.');
  }

  return 'CONTINUE';
};
