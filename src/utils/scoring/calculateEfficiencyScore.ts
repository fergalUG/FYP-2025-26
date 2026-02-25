import type { Event } from '@types';
import { EventType } from '@types';
import type { ScoringStats } from '@types';

import type { EfficiencyScoringConfig } from '@utils/scoring/efficiencyScoringConfig';
import { DEFAULT_EFFICIENCY_SCORING_CONFIG } from '@utils/scoring/efficiencyScoringConfig';
import { normalizeJourneyEvents } from '@utils/scoring/normalizeEvents';
import { simulateScoreTimeline } from '@utils/scoring/simulateScore';

interface EfficiencyScoreResult {
  score: number;
  stats: ScoringStats;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getJourneyBounds = (events: Event[]): { startTimestamp: number; endTimestamp: number } | null => {
  if (events.length === 0) {
    return null;
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const startEvent = sorted.find((e) => e.type === EventType.JourneyStart);
  const endEvent = [...sorted].reverse().find((e) => e.type === EventType.JourneyEnd);

  const earliestTimestamp = sorted[0].timestamp;
  const startTimestamp = startEvent ? Math.min(startEvent.timestamp, earliestTimestamp) : earliestTimestamp;
  const endTimestamp = endEvent?.timestamp ?? sorted[sorted.length - 1].timestamp;

  return { startTimestamp, endTimestamp };
};

export const calculateEfficiencyScore = (
  events: Event[],
  distanceKm: number = 0,
  config: EfficiencyScoringConfig = DEFAULT_EFFICIENCY_SCORING_CONFIG
): EfficiencyScoreResult => {
  const bounds = getJourneyBounds(events);
  if (!bounds) {
    const stats: ScoringStats = {
      durationMs: 0,

      score: 100,
      avgScore: 100,
      blendedAvgScore: 100,
      endScore: 100,
      minScore: 100,

      harshBrakingCount: 0,
      moderateBrakingCount: 0,
      lightBrakingCount: 0,
      harshAccelerationCount: 0,
      moderateAccelerationCount: 0,
      lightAccelerationCount: 0,
      sharpTurnCount: 0,
      moderateTurnCount: 0,
      lightTurnCount: 0,
      stopAndGoCount: 0,

      lightSpeedingEpisodeCount: 0,
      moderateSpeedingEpisodeCount: 0,
      harshSpeedingEpisodeCount: 0,
      lightSpeedingSeconds: 0,
      moderateSpeedingSeconds: 0,
      harshSpeedingSeconds: 0,

      lightOscillationEpisodeCount: 0,
      moderateOscillationEpisodeCount: 0,
      harshOscillationEpisodeCount: 0,
      lightOscillationSeconds: 0,
      moderateOscillationSeconds: 0,
      harshOscillationSeconds: 0,

      avgSpeed: 0,
      maxSpeed: 0,
    };

    return {
      score: stats.score,
      stats,
    };
  }

  const normalized = normalizeJourneyEvents(events, config);

  const penaltyActions = [
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

  const simulation = simulateScoreTimeline({
    startTimestamp: bounds.startTimestamp,
    endTimestamp: bounds.endTimestamp,
    penaltyActions,
    speedingEpisodes: normalized.speedingEpisodes,
    config,
  });

  const avgScore = clamp(simulation.avgScore, config.minScore, config.maxScore);
  const priorMs = Math.max(0, config.shortJourneyPriorMs);
  const denom = simulation.durationMs + priorMs;

  const blendedAvgScore = denom > 0 ? (avgScore * simulation.durationMs + config.maxScore * priorMs) / denom : avgScore;
  const finalScore = Math.round(clamp(blendedAvgScore, config.minScore, config.maxScore));

  const speedValues = events.filter((e) => e.speed > 0).map((e) => e.speed);
  const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : 0;
  const durationHours = simulation.durationMs / (1000 * 60 * 60);
  const avgSpeed = durationHours > 0 ? distanceKm / durationHours : 0;

  const stats: ScoringStats = {
    durationMs: simulation.durationMs,

    score: finalScore,
    avgScore,
    blendedAvgScore,
    endScore: clamp(simulation.endScore, config.minScore, config.maxScore),
    minScore: clamp(simulation.minScore, config.minScore, config.maxScore),

    harshBrakingCount: normalized.harshBrakingCount,
    moderateBrakingCount: normalized.moderateBrakingCount,
    lightBrakingCount: normalized.lightBrakingCount,
    harshAccelerationCount: normalized.harshAccelerationCount,
    moderateAccelerationCount: normalized.moderateAccelerationCount,
    lightAccelerationCount: normalized.lightAccelerationCount,
    sharpTurnCount: normalized.sharpTurnCount,
    moderateTurnCount: normalized.moderateTurnCount,
    lightTurnCount: normalized.lightTurnCount,
    stopAndGoCount: normalized.stopAndGoCount,

    lightSpeedingEpisodeCount: normalized.lightSpeedingEpisodeCount,
    moderateSpeedingEpisodeCount: normalized.moderateSpeedingEpisodeCount,
    harshSpeedingEpisodeCount: normalized.harshSpeedingEpisodeCount,
    lightSpeedingSeconds: normalized.lightSpeedingSeconds,
    moderateSpeedingSeconds: normalized.moderateSpeedingSeconds,
    harshSpeedingSeconds: normalized.harshSpeedingSeconds,

    lightOscillationEpisodeCount: normalized.lightOscillationEpisodeCount,
    moderateOscillationEpisodeCount: normalized.moderateOscillationEpisodeCount,
    harshOscillationEpisodeCount: normalized.harshOscillationEpisodeCount,
    lightOscillationSeconds: normalized.lightOscillationSeconds,
    moderateOscillationSeconds: normalized.moderateOscillationSeconds,
    harshOscillationSeconds: normalized.harshOscillationSeconds,

    avgSpeed: Math.round(avgSpeed * 100) / 100,
    maxSpeed: Math.round(maxSpeed * 100) / 100,
  };

  return {
    score: finalScore,
    stats,
  };
};
