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
        light: 1.5,
        moderate: 3.5,
        harsh: 6,
      },
      acceleration: {
        light: 3,
        moderate: 5,
        harsh: 7.5,
      },
      cornering: {
        light: 0.5,
        moderate: 1,
        harsh: 2,
      },
      oscillation: {
        light: 3,
        moderate: 6,
        harsh: 10,
      },
      speeding: {
        light: 0.5,
        moderate: 1.5,
        harsh: 3.5,
      },
    },
    stopAndGo: 2.5,
  },

  incidentCooldownMs: {
    braking: 4000,
    acceleration: 4000,
    cornering: 5000,
    oscillation: 30000,
    stop_and_go: 30000,
  },

  speedingEpisodeGapMs: 20 * 1000,
  speedingDrainPointsPerSecond: {
    light: 0.004,
    moderate: 0.012,
    harsh: 0.03,
  },

  burstWindowMs: 45 * 1000,
  burstMultiplierStep: 0.12,
  burstMultiplierMax: 1.5,
};
