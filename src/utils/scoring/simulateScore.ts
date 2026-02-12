import type { DrivingEventFamily, EventSeverity } from '@types';

import type { EfficiencyScoringConfig, SpeedingSeverity } from '@utils/scoring/efficiencyScoringConfig';
import type { SpeedingEpisode } from '@utils/scoring/normalizeEvents';

export interface PenaltyAction {
  family: DrivingEventFamily | 'stop_and_go';
  severity?: EventSeverity;
  timestamp: number;
}

export interface ScoreSimulationResult {
  durationMs: number;
  avgScore: number;
  endScore: number;
  minScore: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getDrainPointsPerMs = (severity: SpeedingSeverity, config: EfficiencyScoringConfig): number => {
  return config.speedingDrainPointsPerSecond[severity] / 1000;
};

const getSpeedingMaxSeverity = (episodes: SpeedingEpisode[]): SpeedingSeverity => {
  if (episodes.some((episode) => episode.severity === 'harsh')) {
    return 'harsh';
  }
  if (episodes.some((episode) => episode.severity === 'moderate')) {
    return 'moderate';
  }
  return 'light';
};

const integrateSegment = (s0: number, dtMs: number, drainPointsPerMs: number, config: EfficiencyScoringConfig): number => {
  if (dtMs <= 0) {
    return 0;
  }

  const tau = config.recoveryTauMs;
  const m = config.maxScore;

  if (tau <= 0) {
    return s0 * dtMs;
  }

  const equilibrium = m - drainPointsPerMs * tau;
  const exp = Math.exp(-dtMs / tau);
  return equilibrium * dtMs + (s0 - equilibrium) * tau * (1 - exp);
};

const advanceSegment = (s0: number, dtMs: number, drainPointsPerMs: number, config: EfficiencyScoringConfig): number => {
  if (dtMs <= 0) {
    return s0;
  }

  const tau = config.recoveryTauMs;
  const m = config.maxScore;

  if (tau <= 0) {
    return clamp(s0 - drainPointsPerMs * dtMs, config.minScore, config.maxScore);
  }

  const equilibrium = m - drainPointsPerMs * tau;
  const exp = Math.exp(-dtMs / tau);
  return equilibrium + (s0 - equilibrium) * exp;
};

export const simulateScoreTimeline = (args: {
  startTimestamp: number;
  endTimestamp: number;
  penaltyActions: PenaltyAction[];
  speedingEpisodes: SpeedingEpisode[];
  config: EfficiencyScoringConfig;
}): ScoreSimulationResult => {
  const { startTimestamp, endTimestamp, penaltyActions, speedingEpisodes, config } = args;
  const durationMs = Math.max(0, endTimestamp - startTimestamp);

  const actionsByTimestamp = new Map<number, PenaltyAction[]>();
  for (const action of penaltyActions) {
    const existing = actionsByTimestamp.get(action.timestamp);
    if (existing) {
      existing.push(action);
    } else {
      actionsByTimestamp.set(action.timestamp, [action]);
    }
  }

  const episodeStartsByTimestamp = new Map<number, SpeedingEpisode[]>();
  const episodeEndsByTimestamp = new Map<number, SpeedingEpisode[]>();

  for (const episode of speedingEpisodes) {
    const starts = episodeStartsByTimestamp.get(episode.startTimestamp);
    if (starts) starts.push(episode);
    else episodeStartsByTimestamp.set(episode.startTimestamp, [episode]);

    const ends = episodeEndsByTimestamp.get(episode.endTimestamp);
    if (ends) ends.push(episode);
    else episodeEndsByTimestamp.set(episode.endTimestamp, [episode]);
  }

  const timepointsSet = new Set<number>([startTimestamp, endTimestamp]);
  for (const ts of actionsByTimestamp.keys()) timepointsSet.add(ts);
  for (const ts of episodeStartsByTimestamp.keys()) timepointsSet.add(ts);
  for (const ts of episodeEndsByTimestamp.keys()) timepointsSet.add(ts);

  const timepoints = Array.from(timepointsSet)
    .filter((ts) => ts >= startTimestamp && ts <= endTimestamp)
    .sort((a, b) => a - b);

  let score = config.maxScore;
  let minScore = score;
  let area = 0;

  let drainPointsPerMs = 0;

  let lastPenaltyTimestamp: number | null = null;
  let burstCount = 0;

  const applyTimepoint = (ts: number): void => {
    const ending = episodeEndsByTimestamp.get(ts);
    if (ending && ending.length > 0) {
      // Episodes do not overlap; if they did, we'd need to recompute max drain.
      drainPointsPerMs = 0;
    }

    const starting = episodeStartsByTimestamp.get(ts);
    if (starting && starting.length > 0) {
      const maxSeverity = getSpeedingMaxSeverity(starting);
      drainPointsPerMs = getDrainPointsPerMs(maxSeverity, config);
    }

    const actions = actionsByTimestamp.get(ts);
    if (!actions) {
      return;
    }

    for (const action of actions) {
      const drop =
        action.family === 'stop_and_go'
          ? config.dropPoints.stopAndGo
          : action.severity
            ? config.dropPoints.driving[action.family][action.severity]
            : 0;
      if (drop <= 0) {
        continue;
      }

      if (lastPenaltyTimestamp === null || ts - lastPenaltyTimestamp > config.burstWindowMs) {
        burstCount = 0;
      }

      const multiplier = Math.min(config.burstMultiplierMax, 1 + burstCount * config.burstMultiplierStep);
      score = clamp(score - drop * multiplier, config.minScore, config.maxScore);
      minScore = Math.min(minScore, score);

      burstCount += 1;
      lastPenaltyTimestamp = ts;
    }
  };

  applyTimepoint(startTimestamp);
  minScore = Math.min(minScore, score);

  if (timepoints.length === 0) {
    return { durationMs, avgScore: score, endScore: score, minScore };
  }

  let currentTime = startTimestamp;
  for (const nextTime of timepoints) {
    if (nextTime < currentTime) {
      continue;
    }

    const dtMs = nextTime - currentTime;
    if (dtMs > 0) {
      area += integrateSegment(score, dtMs, drainPointsPerMs, config);
      const nextScore = advanceSegment(score, dtMs, drainPointsPerMs, config);
      minScore = Math.min(minScore, score, nextScore);
      score = nextScore;
      currentTime = nextTime;
    }

    if (nextTime !== startTimestamp) {
      applyTimepoint(nextTime);
    }
  }

  if (durationMs <= 0) {
    return {
      durationMs,
      avgScore: score,
      endScore: score,
      minScore,
    };
  }

  return {
    durationMs,
    avgScore: area / durationMs,
    endScore: score,
    minScore,
  };
};
