import {
  OSCILLATION_EPISODE_END_STABLE_MS,
  OSCILLATION_MIN_FORCE_SAMPLES,
  OSCILLATION_MIN_SPEED_KMH,
  OSCILLATION_MIN_SPEED_SAMPLES,
  OSCILLATION_SIGN_CHANGE_DEADBAND_KMH_PER_SEC,
  OSCILLATION_TIER_THRESHOLDS,
  OSCILLATION_WINDOW_MS,
  SEVERITY_ORDER_DESC,
} from '@utils/tracking/severityThresholds';

import type { DetectorResult, EventSeverity, OscillationDetectorContext } from '@types';

const FORCE_HISTORY_RETENTION_MS = Math.max(OSCILLATION_WINDOW_MS, OSCILLATION_EPISODE_END_STABLE_MS) * 2;

const computeStdDev = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + delta * delta;
  }, 0);

  return Math.sqrt(variance / values.length);
};

const computeP90 = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1));
  return sorted[index] ?? 0;
};

const countSignFlips = (rates: number[]): number => {
  let flips = 0;
  let prevSign = 0;

  for (const rate of rates) {
    if (!Number.isFinite(rate) || Math.abs(rate) < OSCILLATION_SIGN_CHANGE_DEADBAND_KMH_PER_SEC) {
      continue;
    }

    const sign = rate > 0 ? 1 : -1;
    if (prevSign !== 0 && sign !== prevSign) {
      flips += 1;
    }
    prevSign = sign;
  }

  return flips;
};

const severityWeight: Record<EventSeverity, number> = {
  light: 1,
  moderate: 2,
  harsh: 3,
};

const maxSeverity = (a: EventSeverity, b: EventSeverity): EventSeverity => {
  return severityWeight[a] >= severityWeight[b] ? a : b;
};

export interface OscillationDetector {
  addForceSample: (nowMs: number, forceG: number) => void;
  detect: (context: OscillationDetectorContext) => DetectorResult;
  reset: () => void;
}

export const createOscillationDetector = (): OscillationDetector => {
  let speedHistory: Array<{ speedKmh: number; timestamp: number; speedChangeRateKmhPerSec: number | null }> = [];
  let forceHistory: Array<{ forceG: number; timestamp: number }> = [];

  let episodeActive = false;
  let episodeStartMs: number | null = null;
  let episodeStabilityStartMs: number | null = null;
  let episodePeakSeverity: EventSeverity | null = null;
  let episodePeakStdDevKmh = 0;
  let episodePeakSignFlips = 0;
  let episodePeakForceP90G = 0;
  let episodeForceSum = 0;
  let episodeForceCount = 0;
  let episodeForceSamples: number[] = [];

  const resetEpisode = (): void => {
    episodeActive = false;
    episodeStartMs = null;
    episodeStabilityStartMs = null;
    episodePeakSeverity = null;
    episodePeakStdDevKmh = 0;
    episodePeakSignFlips = 0;
    episodePeakForceP90G = 0;
    episodeForceSum = 0;
    episodeForceCount = 0;
    episodeForceSamples = [];
  };

  const addForceSample = (nowMs: number, forceG: number): void => {
    if (!Number.isFinite(forceG) || forceG < 0 || !Number.isFinite(nowMs)) {
      return;
    }

    forceHistory.push({ forceG, timestamp: nowMs });
    forceHistory = forceHistory.filter((sample) => sample.timestamp >= nowMs - FORCE_HISTORY_RETENTION_MS);

    if (episodeActive) {
      episodeForceSum += forceG;
      episodeForceCount += 1;
      episodeForceSamples.push(forceG);
    }
  };

  const detect = (context: OscillationDetectorContext): DetectorResult => {
    const { nowMs, speedKmh, speedBand, speedChangeRateKmhPerSec, speedReliable, suppressed } = context;
    const oscillationWindowStart = nowMs - OSCILLATION_WINDOW_MS;

    if (Number.isFinite(speedKmh) && speedKmh >= 0) {
      speedHistory.push({
        speedKmh,
        timestamp: nowMs,
        speedChangeRateKmhPerSec:
          speedChangeRateKmhPerSec !== null && Number.isFinite(speedChangeRateKmhPerSec) ? speedChangeRateKmhPerSec : null,
      });
    }

    speedHistory = speedHistory.filter((sample) => sample.timestamp >= oscillationWindowStart);
    forceHistory = forceHistory.filter((sample) => sample.timestamp >= nowMs - FORCE_HISTORY_RETENTION_MS);

    const speedWindow = speedHistory.filter(
      (sample) => sample.timestamp >= oscillationWindowStart && sample.speedKmh >= OSCILLATION_MIN_SPEED_KMH
    );
    const speedValues = speedWindow.map((sample) => sample.speedKmh);
    const speedRates = speedWindow
      .map((sample) => sample.speedChangeRateKmhPerSec)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const forceWindow = forceHistory
      .filter((sample) => sample.timestamp >= oscillationWindowStart)
      .map((sample) => sample.forceG)
      .filter((value) => Number.isFinite(value));

    const speedStdDevKmh = computeStdDev(speedValues);
    const signFlipCount = countSignFlips(speedRates);
    const forceP90G = computeP90(forceWindow);

    const hasMinimumSamples = speedWindow.length >= OSCILLATION_MIN_SPEED_SAMPLES && forceWindow.length >= OSCILLATION_MIN_FORCE_SAMPLES;
    const eligible = speedReliable && !suppressed && speedKmh >= OSCILLATION_MIN_SPEED_KMH && hasMinimumSamples;

    let rejectionReason: DetectorResult['reason'] = 'none';
    let detectedSeverity: EventSeverity | null = null;

    if (eligible) {
      const thresholds = OSCILLATION_TIER_THRESHOLDS[speedBand];

      if (speedStdDevKmh < thresholds.light.minSpeedStdDevKmh) {
        rejectionReason = 'std_dev';
      } else if (signFlipCount < thresholds.light.minSignFlipCount) {
        rejectionReason = 'sign_flips';
      } else if (forceP90G < thresholds.light.minForceP90G) {
        rejectionReason = 'force';
      } else {
        detectedSeverity =
          SEVERITY_ORDER_DESC.find((tier) => {
            const tierThresholds = thresholds[tier];
            return (
              speedStdDevKmh >= tierThresholds.minSpeedStdDevKmh &&
              signFlipCount >= tierThresholds.minSignFlipCount &&
              forceP90G >= tierThresholds.minForceP90G
            );
          }) ?? 'light';
      }
    }

    if (detectedSeverity) {
      if (!episodeActive) {
        episodeActive = true;
        episodeStartMs = nowMs;
        episodePeakSeverity = detectedSeverity;
        episodePeakStdDevKmh = speedStdDevKmh;
        episodePeakSignFlips = signFlipCount;
        episodePeakForceP90G = forceP90G;
        episodeForceSum = 0;
        episodeForceCount = 0;
        episodeForceSamples = [];
      } else if (episodePeakSeverity) {
        episodePeakSeverity = maxSeverity(episodePeakSeverity, detectedSeverity);
      } else {
        episodePeakSeverity = detectedSeverity;
      }

      episodePeakStdDevKmh = Math.max(episodePeakStdDevKmh, speedStdDevKmh);
      episodePeakSignFlips = Math.max(episodePeakSignFlips, signFlipCount);
      episodePeakForceP90G = Math.max(episodePeakForceP90G, forceP90G);
      episodeStabilityStartMs = null;

      return { detected: false, reason: 'none' };
    }

    if (!episodeActive) {
      return { detected: false, reason: rejectionReason };
    }

    if (episodeStabilityStartMs === null) {
      episodeStabilityStartMs = nowMs;
      return { detected: false, reason: 'none' };
    }

    if (nowMs - episodeStabilityStartMs < OSCILLATION_EPISODE_END_STABLE_MS) {
      return { detected: false, reason: 'none' };
    }

    if (episodeStartMs === null || episodePeakSeverity === null) {
      resetEpisode();
      return { detected: false, reason: 'none' };
    }

    const episodeDurationMs = Math.max(0, nowMs - episodeStartMs);
    if (episodeDurationMs <= 0) {
      resetEpisode();
      return { detected: false, reason: 'none' };
    }

    const forceMeanG =
      episodeForceCount > 0
        ? episodeForceSum / episodeForceCount
        : forceWindow.length > 0
          ? forceWindow.reduce((sum, value) => sum + value, 0) / forceWindow.length
          : 0;
    const forceEpisodeP90G = episodeForceSamples.length > 0 ? computeP90(episodeForceSamples) : forceP90G;

    const result: DetectorResult = {
      detected: true,
      severity: episodePeakSeverity,
      reason: 'none',
      metadata: {
        episodeStartTs: episodeStartMs,
        episodeEndTs: nowMs,
        episodeDurationMs,
        speedStdDevKmh: Number(episodePeakStdDevKmh.toFixed(3)),
        signFlipCount: episodePeakSignFlips,
        forceP90G: Number(Math.max(episodePeakForceP90G, forceEpisodeP90G).toFixed(3)),
        forceMeanG: Number(forceMeanG.toFixed(3)),
        speedSampleCount: speedWindow.length,
        forceSampleCount: episodeForceCount > 0 ? episodeForceCount : forceWindow.length,
      },
    };

    resetEpisode();
    return result;
  };

  const reset = (): void => {
    speedHistory = [];
    forceHistory = [];
    resetEpisode();
  };

  return {
    addForceSample,
    detect,
    reset,
  };
};
