import { evaluateActivityProbeDecision } from '@services/background/decisions/activityProbeDecision';

import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';

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
