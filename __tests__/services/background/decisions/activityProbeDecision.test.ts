import { evaluateActivityProbeDecision, shouldTriggerPassiveProbeFromLocation } from '@services/background/decisions/activityProbeDecision';

import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { LocationObject } from 'expo-location';
import type { ValidatedSpeed } from '@utils/gpsValidation';

const makeActivity = (overrides: Partial<ActivityData>): ActivityData => ({
  automotive: false,
  walking: false,
  running: false,
  cycling: false,
  stationary: false,
  unknown: true,
  confidence: 'unknown',
  timestamp: 0,
  ...overrides,
});

const makeLocation = (latitude: number, longitude: number): LocationObject =>
  ({
    coords: {
      latitude,
      longitude,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 0,
  }) as LocationObject;

const makeSpeed = (overrides: Partial<ValidatedSpeed>): ValidatedSpeed => ({
  value: 0,
  isValid: false,
  confidence: 'none',
  source: 'none',
  ...overrides,
});

describe('evaluateActivityProbeDecision', () => {
  it('sets candidate on first valid automotive activity signal', () => {
    const result = evaluateActivityProbeDecision({
      mode: 'PASSIVE',
      isTransitioning: false,
      passiveTrackingProfile: 'COARSE',
      passiveActivityCandidateSince: null,
      lastActivityProbeTriggerAt: null,
      now: 10000,
      activity: makeActivity({ automotive: true, confidence: 'high' }),
      minConfidenceScore: 2,
      debounceMs: 3000,
      cooldownMs: 60000,
    });

    expect(result).toEqual({
      action: 'SET_CANDIDATE',
      nextCandidateSince: 10000,
      nextLastTriggerAt: null,
      shouldSwitchToProbe: false,
    });
  });

  it('triggers probe once debounce is satisfied', () => {
    const result = evaluateActivityProbeDecision({
      mode: 'PASSIVE',
      isTransitioning: false,
      passiveTrackingProfile: 'COARSE',
      passiveActivityCandidateSince: 10000,
      lastActivityProbeTriggerAt: null,
      now: 14000,
      activity: makeActivity({ automotive: true, confidence: 'high' }),
      minConfidenceScore: 2,
      debounceMs: 3000,
      cooldownMs: 60000,
    });

    expect(result).toEqual({
      action: 'TRIGGER_PROBE',
      nextCandidateSince: null,
      nextLastTriggerAt: 14000,
      shouldSwitchToProbe: true,
    });
  });

  it('does not trigger during cooldown window', () => {
    const result = evaluateActivityProbeDecision({
      mode: 'PASSIVE',
      isTransitioning: false,
      passiveTrackingProfile: 'COARSE',
      passiveActivityCandidateSince: 10000,
      lastActivityProbeTriggerAt: 13000,
      now: 14000,
      activity: makeActivity({ automotive: true, confidence: 'high' }),
      minConfidenceScore: 2,
      debounceMs: 3000,
      cooldownMs: 60000,
    });

    expect(result.shouldSwitchToProbe).toBe(false);
    expect(result.action).toBe('NONE');
  });

  it('resets candidate when leaving passive mode', () => {
    const result = evaluateActivityProbeDecision({
      mode: 'ACTIVE',
      isTransitioning: false,
      passiveTrackingProfile: 'COARSE',
      passiveActivityCandidateSince: 10000,
      lastActivityProbeTriggerAt: 13000,
      now: 14000,
      activity: makeActivity({ automotive: true, confidence: 'high' }),
      minConfidenceScore: 2,
      debounceMs: 3000,
      cooldownMs: 60000,
    });

    expect(result).toEqual({
      action: 'RESET_CANDIDATE',
      nextCandidateSince: null,
      nextLastTriggerAt: 13000,
      shouldSwitchToProbe: false,
    });
  });
});

describe('shouldTriggerPassiveProbeFromLocation', () => {
  it('returns false when speed is invalid', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      makeLocation(53.0, -6.0),
      makeLocation(53.001, -6.0),
      makeSpeed({ isValid: false, value: 4, source: 'gps' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(false);
  });

  it('returns false when speed is below threshold', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      makeLocation(53.0, -6.0),
      makeLocation(53.001, -6.0),
      makeSpeed({ isValid: true, value: 3.0, source: 'gps' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(false);
  });

  it('returns true for valid gps speed at or above threshold', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      null,
      makeLocation(53.001, -6.0),
      makeSpeed({ isValid: true, value: 3.33333, source: 'gps' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(true);
  });

  it('returns false for calculated speed when previous location is missing', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      null,
      makeLocation(53.001, -6.0),
      makeSpeed({ isValid: true, value: 4.0, source: 'calculated' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(false);
  });

  it('returns false for calculated speed when displacement is below threshold', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      makeLocation(53.0, -6.0),
      makeLocation(53.0001, -6.0),
      makeSpeed({ isValid: true, value: 4.0, source: 'calculated' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(false);
  });

  it('returns true for calculated speed when displacement meets threshold', () => {
    const triggered = shouldTriggerPassiveProbeFromLocation(
      makeLocation(53.0, -6.0),
      makeLocation(53.0003, -6.0),
      makeSpeed({ isValid: true, value: 4.0, source: 'calculated' }),
      3.33333,
      0.025
    );

    expect(triggered).toBe(true);
  });
});
