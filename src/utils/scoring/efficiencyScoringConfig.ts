import type { DrivingEventFamily, EventSeverity } from '@types';

export type SpeedingSeverity = EventSeverity;
export type IncidentFamily = Exclude<DrivingEventFamily, 'speeding'> | 'stop_and_go';

export interface EfficiencyScoringConfig {
  minScore: number; // 0
  maxScore: number; // 100
  recoveryTauMs: number; // time constant for score recovery

  shortJourneyPriorMs: number; // time before start to ensure short journeys get reasonable scores

  dropPoints: {
    driving: Record<DrivingEventFamily, Record<EventSeverity, number>>;
    stopAndGo: number;
  };
  incidentCooldownMs: Record<IncidentFamily, number>;

  speedingEpisodeGapMs: number; // max gap between speeding samples to consider them part of the same episode
  speedingDrainPointsPerSecond: Record<SpeedingSeverity, number>; // points drained per second of speeding

  burstWindowMs: number; // time window to consider for burst multiplier
  burstMultiplierStep: number; // multiplier increase per event in a burst
  burstMultiplierMax: number; // maximum burst multiplier
}

export const DEFAULT_EFFICIENCY_SCORING_CONFIG: EfficiencyScoringConfig = {
  minScore: 0,
  maxScore: 100,
  recoveryTauMs: 5 * 60 * 1000,

  shortJourneyPriorMs: 2 * 60 * 1000,

  dropPoints: {
    driving: {
      braking: {
        light: 2,
        moderate: 5,
        harsh: 8,
      },
      acceleration: {
        light: 2,
        moderate: 4,
        harsh: 6,
      },
      cornering: {
        light: 2,
        moderate: 4,
        harsh: 6,
      },
      oscillation: {
        light: 3,
        moderate: 6,
        harsh: 9,
      },
      speeding: {
        light: 1,
        moderate: 4,
        harsh: 8,
      },
    },
    stopAndGo: 6,
  },

  incidentCooldownMs: {
    braking: 4000,
    acceleration: 4000,
    cornering: 5000,
    oscillation: 30000,
    stop_and_go: 30000,
  },

  speedingEpisodeGapMs: 25 * 1000,
  speedingDrainPointsPerSecond: {
    light: 0.01,
    moderate: 0.02,
    harsh: 0.05,
  },

  burstWindowMs: 45 * 1000,
  burstMultiplierStep: 0.25,
  burstMultiplierMax: 2.0,
};
