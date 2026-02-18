import { createStopAndGoDetector } from '@services/detectors/stopAndGoDetector';
import {
  STOP_AND_GO_EVENT_COOLDOWN_MS,
  STOP_AND_GO_GO_DWELL_MS,
  STOP_AND_GO_GO_SPEED_KMH,
  STOP_AND_GO_STOP_DWELL_MS,
} from '@utils/tracking/severityThresholds';

const runCycle = (detector: ReturnType<typeof createStopAndGoDetector>, startMs: number, goSpeedKmh: number = 20) => {
  detector.detect({ nowMs: startMs, speedKmh: 0 });
  detector.detect({ nowMs: startMs + STOP_AND_GO_STOP_DWELL_MS + 100, speedKmh: 0 });
  detector.detect({ nowMs: startMs + STOP_AND_GO_STOP_DWELL_MS + 200, speedKmh: goSpeedKmh });
  return detector.detect({
    nowMs: startMs + STOP_AND_GO_STOP_DWELL_MS + STOP_AND_GO_GO_DWELL_MS + 400,
    speedKmh: goSpeedKmh,
  });
};

describe('stopAndGoDetector', () => {
  it('detects after the second completed stop-and-go cycle', () => {
    const detector = createStopAndGoDetector();

    const firstCycle = runCycle(detector, 0);
    expect(firstCycle.detected).toBe(false);
    expect(firstCycle.reason).toBe('insufficient_cycles');

    const secondCycle = runCycle(detector, 12000);
    expect(secondCycle.detected).toBe(true);
    expect(secondCycle.reason).toBe('none');
    expect(secondCycle.metadata).toEqual(
      expect.objectContaining({
        cycleCount: 2,
      })
    );
  });

  it('holds resolved phase through middle-speed band samples', () => {
    const detector = createStopAndGoDetector();

    detector.detect({ nowMs: 0, speedKmh: 0 });
    detector.detect({ nowMs: STOP_AND_GO_STOP_DWELL_MS + 100, speedKmh: 0 });
    expect(detector.getState().phase).toBe('stopped');
    expect(detector.isSuppressionActive()).toBe(true);

    const midBand = detector.detect({ nowMs: STOP_AND_GO_STOP_DWELL_MS + 200, speedKmh: 7 });
    expect(midBand.reason).toBe('speed_band');
    expect(midBand.state.phase).toBe('stopped');
    expect(detector.isSuppressionActive()).toBe(true);

    detector.detect({ nowMs: STOP_AND_GO_STOP_DWELL_MS + 500, speedKmh: STOP_AND_GO_GO_SPEED_KMH + 5 });
    const moved = detector.detect({
      nowMs: STOP_AND_GO_STOP_DWELL_MS + STOP_AND_GO_GO_DWELL_MS + 1000,
      speedKmh: STOP_AND_GO_GO_SPEED_KMH + 5,
    });

    expect(moved.detected).toBe(false);
    expect(moved.state.phase).toBe('moving');
    expect(moved.state.cycleCount).toBe(1);
  });

  it('applies cooldown after a detected event', () => {
    const detector = createStopAndGoDetector();

    runCycle(detector, 0);
    const detected = runCycle(detector, 12000);
    expect(detected.detected).toBe(true);

    runCycle(detector, 22000);
    const cooldownRejected = runCycle(detector, 30000);
    expect(cooldownRejected.detected).toBe(false);
    expect(cooldownRejected.reason).toBe('cooldown');

    const postCooldown = runCycle(detector, 30000 + STOP_AND_GO_EVENT_COOLDOWN_MS + 2000);
    expect(postCooldown.detected).toBe(true);
  });

  it('resets state and suppression flags', () => {
    const detector = createStopAndGoDetector();

    detector.detect({ nowMs: 0, speedKmh: 0 });
    detector.detect({ nowMs: STOP_AND_GO_STOP_DWELL_MS + 100, speedKmh: 0 });

    expect(detector.getState().phase).toBe('stopped');
    expect(detector.isSuppressionActive()).toBe(true);

    detector.reset();

    expect(detector.getState()).toEqual({
      phase: 'unknown',
      cycleCount: 0,
      stopCandidateStartMs: null,
      goCandidateStartMs: null,
      lastEventTimeMs: null,
    });
    expect(detector.isSuppressionActive()).toBe(false);
  });
});
