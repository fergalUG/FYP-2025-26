import { createOscillationDetector } from '@services/detectors/oscillationDetector';

import type { OscillationDetectorContext } from '@types';

const buildContext = (overrides: Partial<OscillationDetectorContext> = {}): OscillationDetectorContext => {
  return {
    nowMs: 0,
    speedKmh: 60,
    speedBand: 'high',
    speedChangeRateKmhPerSec: 10,
    speedReliable: true,
    suppressed: false,
    ...overrides,
  };
};

const addForceSamples = (detector: ReturnType<typeof createOscillationDetector>, nowMs: number, forceG: number, count: number): void => {
  for (let i = 0; i < count; i++) {
    detector.addForceSample(nowMs + i * 50, forceG);
  }
};

const runEpisode = (
  detector: ReturnType<typeof createOscillationDetector>,
  args: {
    oscillationSpeeds: number[];
    oscillationForceG: number;
    stableSpeedKmh?: number;
    stableForceG?: number;
    suppressed?: boolean;
  }
) => {
  let nowMs = 0;

  for (let i = 0; i < args.oscillationSpeeds.length; i++) {
    const speedKmh = args.oscillationSpeeds[i];
    addForceSamples(detector, nowMs, args.oscillationForceG, 4);
    detector.detect(
      buildContext({
        nowMs,
        speedKmh,
        speedChangeRateKmhPerSec: i % 2 === 0 ? 10 : -10,
        suppressed: args.suppressed ?? false,
      })
    );
    nowMs += 1000;
  }

  let emitted: ReturnType<typeof detector.detect> | null = null;
  for (let i = 0; i < 35; i++) {
    addForceSamples(detector, nowMs, args.stableForceG ?? 0.05, 2);
    const result = detector.detect(
      buildContext({
        nowMs,
        speedKmh: args.stableSpeedKmh ?? 67,
        speedChangeRateKmhPerSec: 0,
        suppressed: args.suppressed ?? false,
      })
    );
    if (result.detected) {
      emitted = result;
      break;
    }
    nowMs += 1000;
  }

  return emitted;
};

describe('oscillationDetector', () => {
  it('classifies light, moderate, and harsh oscillation episodes', () => {
    const lightDetector = createOscillationDetector();
    const light = runEpisode(lightDetector, {
      oscillationSpeeds: [60, 66, 60, 66, 60, 66, 60],
      oscillationForceG: 0.11,
    });

    const moderateDetector = createOscillationDetector();
    const moderate = runEpisode(moderateDetector, {
      oscillationSpeeds: [60, 70, 60, 70, 60, 70, 60],
      oscillationForceG: 0.15,
    });

    const harshDetector = createOscillationDetector();
    const harsh = runEpisode(harshDetector, {
      oscillationSpeeds: [60, 70, 60, 70, 60, 70, 60],
      oscillationForceG: 0.2,
    });

    expect(light?.detected).toBe(true);
    expect(light?.severity).toBe('light');

    expect(moderate?.detected).toBe(true);
    expect(moderate?.severity).toBe('moderate');

    expect(harsh?.detected).toBe(true);
    expect(harsh?.severity).toBe('harsh');
  });

  it('does not emit while the episode is active and only emits after stability', () => {
    const detector = createOscillationDetector();
    let nowMs = 0;

    const speeds = [60, 70, 60, 70, 60, 70, 60];
    for (let i = 0; i < speeds.length; i++) {
      addForceSamples(detector, nowMs, 0.2, 4);
      const result = detector.detect(
        buildContext({
          nowMs,
          speedKmh: speeds[i],
          speedChangeRateKmhPerSec: i % 2 === 0 ? 10 : -10,
        })
      );
      expect(result.detected).toBe(false);
      nowMs += 1000;
    }

    // Early stability should not emit yet because oscillation samples remain inside the 15-second window.
    for (let i = 0; i < 10; i++) {
      addForceSamples(detector, nowMs, 0.05, 2);
      const result = detector.detect(buildContext({ nowMs, speedKmh: 67, speedChangeRateKmhPerSec: 0 }));
      expect(result.detected).toBe(false);
      nowMs += 1000;
    }

    let closeResult = detector.detect(buildContext({ nowMs, speedKmh: 67, speedChangeRateKmhPerSec: 0 }));
    for (let i = 0; i < 25 && !closeResult.detected; i++) {
      nowMs += 1000;
      addForceSamples(detector, nowMs, 0.05, 2);
      closeResult = detector.detect(buildContext({ nowMs, speedKmh: 67, speedChangeRateKmhPerSec: 0 }));
    }

    expect(closeResult.detected).toBe(true);
    expect(closeResult.severity).toBe('harsh');
  });

  it('returns expected metadata on emitted episode', () => {
    const detector = createOscillationDetector();
    const result = runEpisode(detector, {
      oscillationSpeeds: [60, 70, 60, 70, 60, 70, 60],
      oscillationForceG: 0.2,
    });

    expect(result?.detected).toBe(true);
    expect(result?.metadata).toEqual(
      expect.objectContaining({
        episodeStartTs: expect.any(Number),
        episodeEndTs: expect.any(Number),
        episodeDurationMs: expect.any(Number),
        speedStdDevKmh: expect.any(Number),
        signFlipCount: expect.any(Number),
        forceP90G: expect.any(Number),
        forceMeanG: expect.any(Number),
        speedSampleCount: expect.any(Number),
        forceSampleCount: expect.any(Number),
      })
    );
  });

  it('suppresses detection when stop-go suppression is active', () => {
    const detector = createOscillationDetector();
    const result = runEpisode(detector, {
      oscillationSpeeds: [60, 70, 60, 70, 60, 70, 60],
      oscillationForceG: 0.25,
      suppressed: true,
    });

    expect(result).toBeNull();
  });

  it('can reset an active episode and avoid emission', () => {
    const detector = createOscillationDetector();
    let nowMs = 0;

    const speeds = [60, 70, 60, 70, 60, 70, 60];
    for (let i = 0; i < speeds.length; i++) {
      addForceSamples(detector, nowMs, 0.2, 4);
      detector.detect(
        buildContext({
          nowMs,
          speedKmh: speeds[i],
          speedChangeRateKmhPerSec: i % 2 === 0 ? 10 : -10,
        })
      );
      nowMs += 1000;
    }

    detector.reset();

    for (let i = 0; i < 10; i++) {
      addForceSamples(detector, nowMs, 0.05, 2);
      const result = detector.detect(buildContext({ nowMs, speedKmh: 67, speedChangeRateKmhPerSec: 0 }));
      expect(result.detected).toBe(false);
      nowMs += 1000;
    }
  });
});
