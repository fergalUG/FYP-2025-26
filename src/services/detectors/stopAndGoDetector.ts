import {
  STOP_AND_GO_EVENT_COOLDOWN_MS,
  STOP_AND_GO_GO_DWELL_MS,
  STOP_AND_GO_GO_SPEED_KMH,
  STOP_AND_GO_MIN_CYCLES,
  STOP_AND_GO_STOP_DWELL_MS,
  STOP_AND_GO_STOP_SPEED_KMH,
  STOP_AND_GO_WINDOW_MS,
} from '@utils/tracking/severityThresholds';

import type {
  StopAndGoDetectorContext,
  StopAndGoDetectorReason,
  StopAndGoDetectorResult,
  StopAndGoDetectorState,
  StopAndGoPhase,
} from '@types';

export interface StopAndGoDetector {
  detect: (context: StopAndGoDetectorContext) => StopAndGoDetectorResult;
  getState: () => StopAndGoDetectorState;
  isSuppressionActive: () => boolean;
  clearCandidates: () => void;
  reset: () => void;
}

export const createStopAndGoDetector = (): StopAndGoDetector => {
  let phase: StopAndGoPhase = 'unknown';
  let stopCandidateStartMs: number | null = null;
  let goCandidateStartMs: number | null = null;
  let cycleTimestamps: number[] = [];
  let lastEventTimeMs: number | null = null;

  const getState = (): StopAndGoDetectorState => {
    return {
      phase,
      cycleCount: cycleTimestamps.length,
      stopCandidateStartMs,
      goCandidateStartMs,
      lastEventTimeMs,
    };
  };

  const buildResult = (
    detected: boolean,
    reason: StopAndGoDetectorReason = 'none',
    metadata?: StopAndGoDetectorResult['metadata']
  ): StopAndGoDetectorResult => {
    return {
      detected,
      reason,
      state: getState(),
      ...(metadata ? { metadata } : {}),
    };
  };

  const clearCandidates = (): void => {
    stopCandidateStartMs = null;
    goCandidateStartMs = null;
  };

  const isSuppressionActive = (): boolean => {
    return phase === 'stopped' || stopCandidateStartMs !== null || goCandidateStartMs !== null;
  };

  const reset = (): void => {
    phase = 'unknown';
    stopCandidateStartMs = null;
    goCandidateStartMs = null;
    cycleTimestamps = [];
    lastEventTimeMs = null;
  };

  const detect = (context: StopAndGoDetectorContext): StopAndGoDetectorResult => {
    const { nowMs, speedKmh } = context;
    if (!Number.isFinite(nowMs) || !Number.isFinite(speedKmh) || speedKmh < 0) {
      return buildResult(false, 'none');
    }

    cycleTimestamps = cycleTimestamps.filter((timestamp) => nowMs - timestamp <= STOP_AND_GO_WINDOW_MS);

    if (speedKmh <= STOP_AND_GO_STOP_SPEED_KMH) {
      goCandidateStartMs = null;

      if (phase !== 'stopped') {
        if (stopCandidateStartMs === null) {
          stopCandidateStartMs = nowMs;
        } else if (nowMs - stopCandidateStartMs >= STOP_AND_GO_STOP_DWELL_MS) {
          phase = 'stopped';
          stopCandidateStartMs = null;
        }
      }

      return buildResult(false, 'none');
    }

    if (speedKmh >= STOP_AND_GO_GO_SPEED_KMH) {
      stopCandidateStartMs = null;

      let rejectionReason: StopAndGoDetectorReason = 'none';

      if (phase !== 'moving') {
        if (goCandidateStartMs === null) {
          goCandidateStartMs = nowMs;
          return buildResult(false, 'none');
        }

        if (nowMs - goCandidateStartMs >= STOP_AND_GO_GO_DWELL_MS) {
          if (phase === 'stopped') {
            cycleTimestamps.push(nowMs);
            cycleTimestamps = cycleTimestamps.filter((timestamp) => nowMs - timestamp <= STOP_AND_GO_WINDOW_MS);

            if (cycleTimestamps.length < STOP_AND_GO_MIN_CYCLES) {
              rejectionReason = 'insufficient_cycles';
            } else if (lastEventTimeMs !== null && nowMs - lastEventTimeMs < STOP_AND_GO_EVENT_COOLDOWN_MS) {
              rejectionReason = 'cooldown';
            } else {
              const cycleCount = cycleTimestamps.length;

              lastEventTimeMs = nowMs;
              cycleTimestamps = [];
              phase = 'moving';
              goCandidateStartMs = null;

              return buildResult(true, 'none', {
                cycleCount,
                detectionWindowMs: STOP_AND_GO_WINDOW_MS,
                stopSpeedThresholdKmh: STOP_AND_GO_STOP_SPEED_KMH,
                goSpeedThresholdKmh: STOP_AND_GO_GO_SPEED_KMH,
              });
            }
          }

          phase = 'moving';
          goCandidateStartMs = null;
        }
      }

      return buildResult(false, rejectionReason);
    }

    // Middle-speed band: preserve the resolved phase but reset dwell candidates.
    clearCandidates();
    return buildResult(false, 'speed_band');
  };

  return {
    detect,
    getState,
    isSuppressionActive,
    clearCandidates,
    reset,
  };
};
