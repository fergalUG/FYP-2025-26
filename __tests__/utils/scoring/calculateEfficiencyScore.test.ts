import type { Event } from '@types';
import { EventType } from '@types';

import { calculateEfficiencyScore } from '@utils/scoring/calculateEfficiencyScore';
import type { EfficiencyScoringConfig } from '@utils/scoring/efficiencyScoringConfig';

const makeEvent = (partial: Partial<Event> & Pick<Event, 'timestamp' | 'type'>): Event => {
  return {
    id: partial.id ?? 1,
    journeyId: partial.journeyId ?? 1,
    timestamp: partial.timestamp,
    type: partial.type,
    latitude: partial.latitude ?? 0,
    longitude: partial.longitude ?? 0,
    speed: partial.speed ?? 0,
  };
};

const baseConfig: EfficiencyScoringConfig = {
  minScore: 0,
  maxScore: 100,
  recoveryTauMs: 4 * 60 * 1000,
  shortJourneyPriorMs: 0,

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

describe('calculateEfficiencyScore', () => {
  it('returns 100 for empty event list', () => {
    expect(calculateEfficiencyScore([], 0, baseConfig).score).toBe(100);
  });

  it('applies a drop then recovers (time-average score)', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 0, type: EventType.HarshBraking }),
      makeEvent({ id: 3, timestamp: 600000, type: EventType.JourneyEnd }),
    ];

    const result = calculateEfficiencyScore(events, 0, baseConfig);
    expect(result.score).toBe(97);
    expect(result.stats.harshBrakingCount).toBe(1);
  });

  it('de-bounces repeated incidents within cooldown', () => {
    const oneBrake = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 0, type: EventType.HarshBraking }),
      makeEvent({ id: 3, timestamp: 600000, type: EventType.JourneyEnd }),
    ];
    const twoBrakes = [...oneBrake.slice(0, 2), makeEvent({ id: 4, timestamp: 2000, type: EventType.HarshBraking }), oneBrake[2]];

    const a = calculateEfficiencyScore(oneBrake, 0, baseConfig);
    const b = calculateEfficiencyScore(twoBrakes, 0, baseConfig);
    expect(b.stats.harshBrakingCount).toBe(1);
    expect(b.score).toBe(a.score);
  });

  it('counts stop-and-go incidents and respects cooldown', () => {
    const baseEvents = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 600000, type: EventType.JourneyEnd }),
    ];
    const oneStopAndGo = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 10000, type: EventType.StopAndGo }),
      makeEvent({ id: 3, timestamp: 600000, type: EventType.JourneyEnd }),
    ];
    const debouncedStopAndGo = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 10000, type: EventType.StopAndGo }),
      makeEvent({ id: 3, timestamp: 20000, type: EventType.StopAndGo }),
      makeEvent({ id: 4, timestamp: 600000, type: EventType.JourneyEnd }),
    ];
    const twoStopAndGo = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 10000, type: EventType.StopAndGo }),
      makeEvent({ id: 3, timestamp: 45000, type: EventType.StopAndGo }),
      makeEvent({ id: 4, timestamp: 600000, type: EventType.JourneyEnd }),
    ];

    const base = calculateEfficiencyScore(baseEvents, 0, baseConfig);
    const one = calculateEfficiencyScore(oneStopAndGo, 0, baseConfig);
    const debounced = calculateEfficiencyScore(debouncedStopAndGo, 0, baseConfig);
    const two = calculateEfficiencyScore(twoStopAndGo, 0, baseConfig);

    expect(one.stats.stopAndGoCount).toBe(1);
    expect(debounced.stats.stopAndGoCount).toBe(1);
    expect(two.stats.stopAndGoCount).toBe(2);
    expect(one.score).toBeLessThan(base.score);
    expect(debounced.score).toBe(one.score);
    expect(two.score).toBeLessThan(one.score);
  });

  it('groups speeding samples into episodes and applies drain', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 100000, type: EventType.ModerateSpeeding }),
      makeEvent({ id: 3, timestamp: 110000, type: EventType.ModerateSpeeding }),
      makeEvent({ id: 4, timestamp: 120000, type: EventType.ModerateSpeeding }),
      makeEvent({ id: 5, timestamp: 300000, type: EventType.JourneyEnd }),
    ];

    const withDrain = calculateEfficiencyScore(events, 0, baseConfig);

    const noDrainConfig: EfficiencyScoringConfig = {
      ...baseConfig,
      speedingDrainPointsPerSecond: { moderate: 0, harsh: 0 },
    };
    const withoutDrain = calculateEfficiencyScore(events, 0, noDrainConfig);

    expect(withDrain.stats.moderateSpeedingEpisodeCount).toBe(1);
    expect(withDrain.stats.moderateSpeedingSeconds).toBe(20);
    expect(withDrain.stats.blendedAvgScore).toBeLessThan(withoutDrain.stats.blendedAvgScore);
  });

  it('penalizes clustered events more than spaced events (burst multiplier)', () => {
    const clustered = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 0, type: EventType.HarshBraking }),
      makeEvent({ id: 3, timestamp: 10000, type: EventType.SharpTurn }),
      makeEvent({ id: 4, timestamp: 600000, type: EventType.JourneyEnd }),
    ];
    const spaced = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, timestamp: 0, type: EventType.HarshBraking }),
      makeEvent({ id: 3, timestamp: 180000, type: EventType.SharpTurn }),
      makeEvent({ id: 4, timestamp: 600000, type: EventType.JourneyEnd }),
    ];

    const a = calculateEfficiencyScore(clustered, 0, baseConfig);
    const b = calculateEfficiencyScore(spaced, 0, baseConfig);
    expect(a.score).toBeLessThan(b.score);
  });

  it('calculates avgSpeed and maxSpeed from events and distance', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart, speed: 0 }),
      makeEvent({ id: 2, timestamp: 1000, type: EventType.LocationUpdate, speed: 50 }),
      makeEvent({ id: 3, timestamp: 2000, type: EventType.LocationUpdate, speed: 60 }),
      makeEvent({ id: 4, timestamp: 3000, type: EventType.LocationUpdate, speed: 80 }),
      makeEvent({ id: 5, timestamp: 3600000, type: EventType.JourneyEnd, speed: 0 }),
    ];

    // 1 hour journey, 60 km distance = 60 km/h average
    const result = calculateEfficiencyScore(events, 60, baseConfig);
    expect(result.stats.avgSpeed).toBe(60);
    expect(result.stats.maxSpeed).toBe(80);
  });
});
