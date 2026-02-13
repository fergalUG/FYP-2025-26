import { createCorneringDetector } from '@services/detectors/corneringDetector';

import type { CorneringDetectorContext } from '@types';

const buildContext = (overrides: Partial<CorneringDetectorContext> = {}): CorneringDetectorContext => {
  return {
    nowMs: 1000,
    speedKmh: 70,
    speedBand: 'high',
    speedChangeRateKmhPerSec: 1.5,
    horizontalForceG: 0.3,
    headingChangeDeg: 15,
    ...overrides,
  };
};

describe('corneringDetector', () => {
  it('rejects when heading data is missing', () => {
    const detector = createCorneringDetector();

    const result = detector.detect(buildContext({ headingChangeDeg: null }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('missing_heading');
  });

  it('rejects when absolute speed-change rate is above guard threshold', () => {
    const detector = createCorneringDetector();

    const result = detector.detect(buildContext({ speedChangeRateKmhPerSec: 10.01 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('speed_change');
  });

  it('rejects when force is below light threshold', () => {
    const detector = createCorneringDetector();

    const result = detector.detect(buildContext({ horizontalForceG: 0.14, headingChangeDeg: 40 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('force');
  });

  it('rejects when heading change is below light threshold', () => {
    const detector = createCorneringDetector();

    const result = detector.detect(buildContext({ horizontalForceG: 0.4, headingChangeDeg: 7.9 }));

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('heading');
  });

  it('classifies light, moderate, and harsh cornering severities', () => {
    const detector = createCorneringDetector();

    const light = detector.detect(buildContext({ nowMs: 1000, horizontalForceG: 0.15, headingChangeDeg: 8 }));
    const moderate = detector.detect(buildContext({ nowMs: 7000, horizontalForceG: 0.24, headingChangeDeg: 12 }));
    const harsh = detector.detect(buildContext({ nowMs: 13000, horizontalForceG: 0.5, headingChangeDeg: 20 }));

    expect(light.detected).toBe(true);
    expect(light.severity).toBe('light');

    expect(moderate.detected).toBe(true);
    expect(moderate.severity).toBe('moderate');

    expect(harsh.detected).toBe(true);
    expect(harsh.severity).toBe('harsh');
  });

  it('enforces cooldown between detections', () => {
    const detector = createCorneringDetector();

    const first = detector.detect(buildContext({ nowMs: 1000, horizontalForceG: 0.5, headingChangeDeg: 20 }));
    const second = detector.detect(buildContext({ nowMs: 3000, horizontalForceG: 0.5, headingChangeDeg: 20 }));

    expect(first.detected).toBe(true);
    expect(second.detected).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('allows detection again after reset', () => {
    const detector = createCorneringDetector();

    detector.detect(buildContext({ nowMs: 1000, horizontalForceG: 0.5, headingChangeDeg: 20 }));
    const blocked = detector.detect(buildContext({ nowMs: 1200, horizontalForceG: 0.5, headingChangeDeg: 20 }));

    detector.reset();
    const allowed = detector.detect(buildContext({ nowMs: 1200, horizontalForceG: 0.5, headingChangeDeg: 20 }));

    expect(blocked.detected).toBe(false);
    expect(blocked.reason).toBe('cooldown');
    expect(allowed.detected).toBe(true);
    expect(allowed.severity).toBe('harsh');
  });

  it('returns rounded metadata values on detection', () => {
    const detector = createCorneringDetector();

    const result = detector.detect(
      buildContext({
        nowMs: 1000,
        horizontalForceG: 0.24456,
        headingChangeDeg: 12.3456,
        speedChangeRateKmhPerSec: 2.71828,
      })
    );

    expect(result.detected).toBe(true);
    expect(result.metadata).toEqual({
      horizontalForceG: 0.245,
      headingChangeDeg: 12.346,
      speedChangeRateKmhPerSec: 2.718,
    });
  });
});
