import type { Event, ScoreTimelinePoint } from '@types';
import { EventType } from '@types';

import { DEFAULT_EFFICIENCY_SCORING_CONFIG, type EfficiencyScoringConfig } from '@utils/scoring/efficiencyScoringConfig';
import { normalizeJourneyEvents, type NormalizedJourneyEvents } from '@utils/scoring/normalizeEvents';
import {
  advanceScoreTimelineSegment,
  simulateScoreTimelineDetailed,
  type PenaltyAction,
  type ScoreTimelineSimulation,
} from '@utils/scoring/simulateScore';

interface BuildScoreTimelineSeriesOptions {
  config?: EfficiencyScoringConfig;
  maxPoints?: number;
}

const DEFAULT_MAX_POINTS = 100;
const DEFAULT_BASE_SAMPLES = 180;

const getJourneyBounds = (events: Event[]): { startTimestamp: number; endTimestamp: number } | null => {
  if (events.length === 0) {
    return null;
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const startEvent = sorted.find((event) => event.type === EventType.JourneyStart);
  const endEvent = [...sorted].reverse().find((event) => event.type === EventType.JourneyEnd);

  const earliestTimestamp = sorted[0].timestamp;
  const startTimestamp = startEvent ? Math.min(startEvent.timestamp, earliestTimestamp) : earliestTimestamp;
  const endTimestamp = endEvent?.timestamp ?? sorted[sorted.length - 1].timestamp;

  return { startTimestamp, endTimestamp };
};

const buildPenaltyActions = (normalized: NormalizedJourneyEvents): PenaltyAction[] => {
  return [
    ...normalized.incidents.map((incident) => ({
      family: incident.family,
      severity: incident.severity ?? undefined,
      timestamp: incident.timestamp,
    })),
    ...normalized.speedingEpisodes.map((episode) => ({
      family: 'speeding' as const,
      severity: episode.severity,
      timestamp: episode.startTimestamp,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);
};

const scoreAtTimestamp = (simulation: ScoreTimelineSimulation, config: EfficiencyScoringConfig, timestamp: number): number => {
  if (simulation.boundaries.length === 0) {
    return config.maxScore;
  }

  if (timestamp <= simulation.startTimestamp) {
    return simulation.boundaries[0]?.score ?? config.maxScore;
  }

  if (timestamp >= simulation.endTimestamp) {
    return simulation.boundaries[simulation.boundaries.length - 1]?.score ?? config.maxScore;
  }

  const exactBoundary = simulation.boundaries.find((point) => point.timestamp === timestamp);
  if (exactBoundary) {
    return exactBoundary.score;
  }

  const segment = simulation.segments.find((candidate) => timestamp > candidate.startTimestamp && timestamp < candidate.endTimestamp);
  if (!segment) {
    return simulation.boundaries[simulation.boundaries.length - 1]?.score ?? config.maxScore;
  }

  return advanceScoreTimelineSegment(segment.startScore, timestamp - segment.startTimestamp, segment.drainPointsPerMs, config);
};

const compressScoreTimelinePoints = (points: ScoreTimelinePoint[], maxPoints: number): ScoreTimelinePoint[] => {
  if (points.length <= maxPoints) {
    return points;
  }

  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const bucketSize = Math.ceil((points.length - 2) / bucketCount);
  const compressed: ScoreTimelinePoint[] = [points[0]];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = 1 + bucketIndex * bucketSize;
    const end = Math.min(points.length - 1, start + bucketSize);
    const bucket = points.slice(start, end);

    if (bucket.length === 0) {
      continue;
    }

    let minPoint = bucket[0];
    let maxPoint = bucket[0];

    for (const point of bucket) {
      if (point.score < minPoint.score) {
        minPoint = point;
      }
      if (point.score > maxPoint.score) {
        maxPoint = point;
      }
    }

    const ordered = [minPoint, maxPoint].sort((a, b) => a.timestamp - b.timestamp);
    for (const point of ordered) {
      const previous = compressed[compressed.length - 1];
      if (!previous || previous.timestamp !== point.timestamp) {
        compressed.push(point);
      }
    }
  }

  const lastPoint = points[points.length - 1];
  if (compressed[compressed.length - 1]?.timestamp !== lastPoint.timestamp) {
    compressed.push(lastPoint);
  }

  return compressed;
};

export const buildScoreTimelineSeries = (events: Event[], options: BuildScoreTimelineSeriesOptions = {}): ScoreTimelinePoint[] => {
  const config = options.config ?? DEFAULT_EFFICIENCY_SCORING_CONFIG;
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const bounds = getJourneyBounds(events);

  if (!bounds) {
    return [];
  }

  const normalized = normalizeJourneyEvents(events, config);
  const simulation = simulateScoreTimelineDetailed({
    startTimestamp: bounds.startTimestamp,
    endTimestamp: bounds.endTimestamp,
    penaltyActions: buildPenaltyActions(normalized),
    speedingEpisodes: normalized.speedingEpisodes,
    config,
  });

  if (simulation.durationMs <= 0) {
    return [
      {
        timestamp: simulation.startTimestamp,
        elapsedMs: 0,
        score: simulation.boundaries[0]?.score ?? config.maxScore,
      },
    ];
  }

  const sampleCount = Math.max(maxPoints, DEFAULT_BASE_SAMPLES);
  const timestampSet = new Set<number>(simulation.boundaries.map((point) => point.timestamp));

  for (let index = 0; index < sampleCount; index += 1) {
    const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    timestampSet.add(Math.round(simulation.startTimestamp + simulation.durationMs * ratio));
  }

  const points = Array.from(timestampSet)
    .sort((a, b) => a - b)
    .map((timestamp) => ({
      timestamp,
      elapsedMs: timestamp - simulation.startTimestamp,
      score: scoreAtTimestamp(simulation, config, timestamp),
    }));

  return compressScoreTimelinePoints(points, maxPoints);
};
