import { createAccelerationDetector } from '@services/detectors/accelerationDetector';

import type { DetectorContext } from '@types';

const buildContext = (overrides: Partial<DetectorContext> = {}): DetectorContext => {
  return {
    nowMs: 1000,
    speedKmh: 70,
    speedBand: 'high',
    speedChangeRateKmhPerSec: 8,
    horizontalForceG: 0.22,
    ...overrides,
  };
};

describe('accelerationDetector', () => {
  it('ignores non-acceleration direction samples', () => {
    const detector = createAccelerationDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: -0.3 }));

    expect(result).toEqual({ detected: false, reason: 'none' });
  });

  it('rejects when acceleration rate is below light threshold', () => {
    const detector = createAccelerationDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: 4.9, horizontalForceG: 0.4 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('rate');
  });

  it('rejects when horizontal force is below light threshold', () => {
    const detector = createAccelerationDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: 6, horizontalForceG: 0.09 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('force');
  });

  it('classifies light, moderate, and harsh acceleration severities', () => {
    const detector = createAccelerationDetector();

    const light = detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: 5, horizontalForceG: 0.1 }));
    const moderate = detector.detect(buildContext({ nowMs: 6000, speedChangeRateKmhPerSec: 7, horizontalForceG: 0.18 }));
    const harsh = detector.detect(buildContext({ nowMs: 11000, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));

    expect(light.detected).toBe(true);
    expect(light.severity).toBe('light');

    expect(moderate.detected).toBe(true);
    expect(moderate.severity).toBe('moderate');

    expect(harsh.detected).toBe(true);
    expect(harsh.severity).toBe('harsh');
  });

  it('enforces cooldown between detections', () => {
    const detector = createAccelerationDetector();

    const first = detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));
    const second = detector.detect(buildContext({ nowMs: 2500, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));

    expect(first.detected).toBe(true);
    expect(second.detected).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('allows detection again after reset', () => {
    const detector = createAccelerationDetector();

    detector.detect(buildContext({ nowMs: 1000, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));
    const blocked = detector.detect(buildContext({ nowMs: 1200, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));

    detector.reset();
    const allowed = detector.detect(buildContext({ nowMs: 1200, speedChangeRateKmhPerSec: 9, horizontalForceG: 0.26 }));

    expect(blocked.detected).toBe(false);
    expect(blocked.reason).toBe('cooldown');
    expect(allowed.detected).toBe(true);
    expect(allowed.severity).toBe('harsh');
  });

  it('returns rounded metadata values on detection', () => {
    const detector = createAccelerationDetector();

    const result = detector.detect(
      buildContext({
        nowMs: 1000,
        speedChangeRateKmhPerSec: 7.87654,
        horizontalForceG: 0.18765,
      })
    );

    expect(result.detected).toBe(true);
    expect(result.metadata).toEqual({
      horizontalForceG: 0.188,
      speedChangeRateKmhPerSec: 7.877,
    });
  });
});
