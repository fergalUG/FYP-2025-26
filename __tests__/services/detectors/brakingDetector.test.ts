import { createBrakingDetector } from '@services/detectors/brakingDetector';

import type { DetectorContext } from '@types';

const buildContext = (overrides: Partial<DetectorContext> = {}): DetectorContext => {
  return {
    nowMs: 1000,
    speedKmh: 70,
    speedBand: 'high',
    speedChangeRateKmhPerSec: -9,
    horizontalForceG: 0.26,
    ...overrides,
  };
};

describe('brakingDetector', () => {
  it('ignores non-braking direction samples', () => {
    const detector = createBrakingDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: 0.3 }));

    expect(result).toEqual({ detected: false, reason: 'none' });
  });

  it('rejects when deceleration rate is below light threshold', () => {
    const detector = createBrakingDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: -4.9, horizontalForceG: 0.5 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('rate');
  });

  it('rejects when horizontal force is below light threshold', () => {
    const detector = createBrakingDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: -7, horizontalForceG: 0.11 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('force');
  });

  it('classifies light, moderate, and harsh braking severities', () => {
    const detector = createBrakingDetector();

    const light = detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: -5, horizontalForceG: 0.12 }));
    const moderate = detector.detect(buildContext({ nowMs: 6000, speedChangeRateKmhPerSec: -8, horizontalForceG: 0.2 }));
    const harsh = detector.detect(buildContext({ nowMs: 11000, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));

    expect(light.detected).toBe(true);
    expect(light.severity).toBe('light');

    expect(moderate.detected).toBe(true);
    expect(moderate.severity).toBe('moderate');

    expect(harsh.detected).toBe(true);
    expect(harsh.severity).toBe('harsh');
  });

  it('enforces cooldown between detections', () => {
    const detector = createBrakingDetector();

    const first = detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));
    const second = detector.detect(buildContext({ nowMs: 2500, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));

    expect(first.detected).toBe(true);
    expect(second.detected).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('allows detection again after reset', () => {
    const detector = createBrakingDetector();

    detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));
    const blocked = detector.detect(buildContext({ nowMs: 1200, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));

    detector.reset();
    const allowed = detector.detect(buildContext({ nowMs: 1200, speedChangeRateKmhPerSec: -10, horizontalForceG: 0.3 }));

    expect(blocked.detected).toBe(false);
    expect(blocked.reason).toBe('cooldown');
    expect(allowed.detected).toBe(true);
    expect(allowed.severity).toBe('harsh');
  });

  it('returns rounded metadata values on detection', () => {
    const detector = createBrakingDetector();

    const result = detector.detect(
      buildContext({
        nowMs: 1000,
        speedChangeRateKmhPerSec: -7.98765,
        horizontalForceG: 0.23456,
      })
    );

    expect(result.detected).toBe(true);
    expect(result.metadata).toEqual({
      horizontalForceG: 0.235,
      speedChangeRateKmhPerSec: -7.988,
    });
  });
});
