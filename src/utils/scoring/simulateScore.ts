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

export interface ScoreTimelineSegment {
  startTimestamp: number;
  endTimestamp: number;
  startScore: number;
  drainPointsPerMs: number;
}

export interface ScoreTimelineBoundary {
  timestamp: number;
  score: number;
}

export interface ScoreTimelineSimulation extends ScoreSimulationResult {
  startTimestamp: number;
  endTimestamp: number;
  boundaries: ScoreTimelineBoundary[];
  segments: ScoreTimelineSegment[];
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
  const maxScore = config.maxScore;

  if (tau <= 0) {
    return s0 * dtMs;
  }

  const equilibrium = maxScore - drainPointsPerMs * tau;
  const exp = Math.exp(-dtMs / tau);
  return equilibrium * dtMs + (s0 - equilibrium) * tau * (1 - exp);
};

export const advanceScoreTimelineSegment = (
  s0: number,
  dtMs: number,
  drainPointsPerMs: number,
  config: EfficiencyScoringConfig
): number => {
  if (dtMs <= 0) {
    return s0;
  }

  const tau = config.recoveryTauMs;
  const maxScore = config.maxScore;

  if (tau <= 0) {
    return clamp(s0 - drainPointsPerMs * dtMs, config.minScore, config.maxScore);
  }

  const equilibrium = maxScore - drainPointsPerMs * tau;
  const exp = Math.exp(-dtMs / tau);
  return equilibrium + (s0 - equilibrium) * exp;
};

export const simulateScoreTimelineDetailed = (args: {
  startTimestamp: number;
  endTimestamp: number;
  penaltyActions: PenaltyAction[];
  speedingEpisodes: SpeedingEpisode[];
  config: EfficiencyScoringConfig;
}): ScoreTimelineSimulation => {
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

  const boundaries: ScoreTimelineBoundary[] = [];
  const segments: ScoreTimelineSegment[] = [];

  const applyTimepoint = (ts: number): void => {
    const ending = episodeEndsByTimestamp.get(ts);
    if (ending && ending.length > 0) {
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
  boundaries.push({ timestamp: startTimestamp, score });

  let currentTime = startTimestamp;

  for (const nextTime of timepoints) {
    if (nextTime <= currentTime) {
      continue;
    }

    const dtMs = nextTime - currentTime;
    area += integrateSegment(score, dtMs, drainPointsPerMs, config);
    segments.push({
      startTimestamp: currentTime,
      endTimestamp: nextTime,
      startScore: score,
      drainPointsPerMs,
    });

    const nextScore = advanceScoreTimelineSegment(score, dtMs, drainPointsPerMs, config);
    minScore = Math.min(minScore, score, nextScore);
    score = nextScore;
    currentTime = nextTime;

    applyTimepoint(nextTime);
    minScore = Math.min(minScore, score);
    boundaries.push({ timestamp: nextTime, score });
  }

  if (durationMs <= 0) {
    return {
      startTimestamp,
      endTimestamp,
      durationMs,
      avgScore: score,
      endScore: score,
      minScore,
      boundaries,
      segments,
    };
  }

  return {
    startTimestamp,
    endTimestamp,
    durationMs,
    avgScore: area / durationMs,
    endScore: score,
    minScore,
    boundaries,
    segments,
  };
};

export const simulateScoreTimeline = (args: {
  startTimestamp: number;
  endTimestamp: number;
  penaltyActions: PenaltyAction[];
  speedingEpisodes: SpeedingEpisode[];
  config: EfficiencyScoringConfig;
}): ScoreSimulationResult => {
  const simulation = simulateScoreTimelineDetailed(args);

  return {
    durationMs: simulation.durationMs,
    avgScore: simulation.avgScore,
    endScore: simulation.endScore,
    minScore: simulation.minScore,
  };
};
