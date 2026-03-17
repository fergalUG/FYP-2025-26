import { createSpeedingDetector } from '@services/detectors/speedingDetector';
import { SPEEDING_HYSTERESIS_MARGIN_KMH, SPEEDING_OVER_LIMIT_THRESHOLD_KMH } from '@utils/tracking/severityThresholds';

const SPEED_LIMIT_KMH = 80;
const EPSILON_KMH = 0.1;
const LIGHT_ENTRY_SPEED_KMH = SPEED_LIMIT_KMH + SPEEDING_OVER_LIMIT_THRESHOLD_KMH.light + SPEEDING_HYSTERESIS_MARGIN_KMH + EPSILON_KMH;
const LIGHT_EXIT_SPEED_KMH = SPEED_LIMIT_KMH + SPEEDING_OVER_LIMIT_THRESHOLD_KMH.light - SPEEDING_HYSTERESIS_MARGIN_KMH;
const MODERATE_SPEED_KMH = SPEED_LIMIT_KMH + SPEEDING_OVER_LIMIT_THRESHOLD_KMH.moderate + SPEEDING_HYSTERESIS_MARGIN_KMH + EPSILON_KMH;
const HARSH_SPEED_KMH = SPEED_LIMIT_KMH + SPEEDING_OVER_LIMIT_THRESHOLD_KMH.harsh + SPEEDING_HYSTERESIS_MARGIN_KMH + EPSILON_KMH;

describe('speedingDetector', () => {
  it('does not detect when speed is below entry threshold with hysteresis margin', () => {
    const detector = createSpeedingDetector();

    const result = detector.detect({
      nowMs: 0,
      speedKmh: LIGHT_ENTRY_SPEED_KMH - 2 * EPSILON_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('none');
  });

  it('requires 2 seconds persistence before detection', () => {
    const detector = createSpeedingDetector();

    const first = detector.detect({
      nowMs: 0,
      speedKmh: LIGHT_ENTRY_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });
    const second = detector.detect({
      nowMs: 1500,
      speedKmh: LIGHT_ENTRY_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });
    const third = detector.detect({
      nowMs: 2000,
      speedKmh: LIGHT_ENTRY_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    expect(first.detected).toBe(false);
    expect(first.reason).toBe('persistence');
    expect(second.detected).toBe(false);
    expect(second.reason).toBe('persistence');
    expect(third.detected).toBe(true);
    expect(third.severity).toBe('light');
  });

  it('classifies moderate and harsh based on over-limit thresholds', () => {
    const detector = createSpeedingDetector();

    detector.detect({
      nowMs: 0,
      speedKmh: MODERATE_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    const moderate = detector.detect({
      nowMs: 2100,
      speedKmh: MODERATE_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });
    const harsh = detector.detect({
      nowMs: 2200,
      speedKmh: HARSH_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    expect(moderate.detected).toBe(true);
    expect(moderate.severity).toBe('moderate');
    expect(harsh.detected).toBe(true);
    expect(harsh.severity).toBe('harsh');
  });

  it('applies hysteresis before exiting speeding state', () => {
    const detector = createSpeedingDetector();

    detector.detect({
      nowMs: 0,
      speedKmh: LIGHT_ENTRY_SPEED_KMH + 1,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    const detected = detector.detect({
      nowMs: 2500,
      speedKmh: LIGHT_ENTRY_SPEED_KMH + 1,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });
    const stillSpeeding = detector.detect({
      nowMs: 3000,
      speedKmh: LIGHT_EXIT_SPEED_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });
    const cleared = detector.detect({
      nowMs: 3500,
      speedKmh: LIGHT_EXIT_SPEED_KMH - EPSILON_KMH,
      speedLimitKmh: SPEED_LIMIT_KMH,
    });

    expect(detected.detected).toBe(true);
    expect(stillSpeeding.detected).toBe(true);
    expect(stillSpeeding.severity).toBe('light');
    expect(cleared.detected).toBe(false);
    expect(cleared.reason).toBe('none');
  });
});
