import type { ScoringStats } from '@types';
import { buildJourneyStatsSummary, isSpeedLimitDetectionEnabledForJourney } from '@components/journey/journeyStatsModel';

const buildStats = (overrides: Partial<ScoringStats> = {}): ScoringStats => ({
  durationMs: 600_000,
  speedLimitDetectionEnabled: true,
  speedLimitDataStatus: 'ready',
  score: 90,
  avgScore: 91,
  blendedAvgScore: 91,
  endScore: 92,
  minScore: 84,
  harshBrakingCount: 0,
  moderateBrakingCount: 1,
  lightBrakingCount: 2,
  harshAccelerationCount: 0,
  moderateAccelerationCount: 1,
  lightAccelerationCount: 1,
  sharpTurnCount: 0,
  moderateTurnCount: 1,
  lightTurnCount: 1,
  stopAndGoCount: 1,
  lightSpeedingEpisodeCount: 1,
  moderateSpeedingEpisodeCount: 0,
  harshSpeedingEpisodeCount: 0,
  lightSpeedingSeconds: 24,
  moderateSpeedingSeconds: 0,
  harshSpeedingSeconds: 0,
  lightOscillationEpisodeCount: 0,
  moderateOscillationEpisodeCount: 0,
  harshOscillationEpisodeCount: 0,
  lightOscillationSeconds: 0,
  moderateOscillationSeconds: 0,
  harshOscillationSeconds: 0,
  avgSpeed: 42,
  maxSpeed: 80,
  ...overrides,
});

describe('journeyStatsModel', () => {
  it('treats legacy journeys without a saved flag as speed limit detection enabled', () => {
    const legacyStats = buildStats({ speedLimitDetectionEnabled: undefined as unknown as boolean });

    expect(isSpeedLimitDetectionEnabledForJourney(legacyStats)).toBe(true);
  });

  it('marks speeding detection as disabled in the journey summary when the feature was off', () => {
    const stats = buildStats({
      speedLimitDetectionEnabled: false,
      speedLimitDataStatus: 'disabled',
      lightSpeedingEpisodeCount: 0,
      moderateSpeedingEpisodeCount: 0,
      harshSpeedingEpisodeCount: 0,
      lightSpeedingSeconds: 0,
      moderateSpeedingSeconds: 0,
      harshSpeedingSeconds: 0,
    });

    expect(buildJourneyStatsSummary(stats)).toContain('speeding detection disabled');
    expect(buildJourneyStatsSummary(stats)).not.toContain('no speeding');
  });

  it('marks speeding detection as unavailable when local road data was not ready', () => {
    const stats = buildStats({
      speedLimitDataStatus: 'unavailable',
      lightSpeedingEpisodeCount: 0,
      moderateSpeedingEpisodeCount: 0,
      harshSpeedingEpisodeCount: 0,
      lightSpeedingSeconds: 0,
      moderateSpeedingSeconds: 0,
      harshSpeedingSeconds: 0,
    });

    expect(isSpeedLimitDetectionEnabledForJourney(stats)).toBe(false);
    expect(buildJourneyStatsSummary(stats)).toContain('speeding detection unavailable');
    expect(buildJourneyStatsSummary(stats)).not.toContain('no speeding');
  });
});
