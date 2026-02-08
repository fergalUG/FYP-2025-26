import { EventType } from '@types';

export type SpeedingSeverity = 'moderate' | 'harsh';

export interface EfficiencyScoringConfig {
  minScore: number; // 0
  maxScore: number; // 100
  recoveryTauMs: number; // time constant for score recovery

  shortJourneyPriorMs: number; // time before start to ensure short journeys get reasonable scores

  dropPoints: Partial<Record<EventType, number>>; // points to drop per event
  cooldownMs: Partial<Record<EventType, number>>; // cooldown between events of the same type

  speedingEpisodeGapMs: number; // max gap between speeding samples to consider them part of the same episode
  speedingDrainPointsPerSecond: Record<SpeedingSeverity, number>; // points drained per second of speeding

  burstWindowMs: number; // time window to consider for burst multiplier
  burstMultiplierStep: number; // multiplier increase per event in a burst
  burstMultiplierMax: number; // maximum burst multiplier
}

export const DEFAULT_EFFICIENCY_SCORING_CONFIG: EfficiencyScoringConfig = {
  minScore: 0,
  maxScore: 100,
  recoveryTauMs: 4 * 60 * 1000,

  shortJourneyPriorMs: 5 * 60 * 1000,

  dropPoints: {
    [EventType.HarshBraking]: 8,
    [EventType.HarshAcceleration]: 6,
    [EventType.SharpTurn]: 6,
    [EventType.ModerateSpeeding]: 4,
    [EventType.HarshSpeeding]: 8,
    [EventType.StopAndGo]: 5,
  },

  cooldownMs: {
    [EventType.HarshBraking]: 4000,
    [EventType.HarshAcceleration]: 4000,
    [EventType.SharpTurn]: 5000,
    [EventType.StopAndGo]: 30000,
  },

  speedingEpisodeGapMs: 25 * 1000,
  speedingDrainPointsPerSecond: {
    moderate: 0.02,
    harsh: 0.05,
  },

  burstWindowMs: 45 * 1000,
  burstMultiplierStep: 0.25,
  burstMultiplierMax: 2.0,
};
