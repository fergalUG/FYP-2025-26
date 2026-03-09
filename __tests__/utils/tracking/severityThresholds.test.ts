import {
  ACCELERATION_TIER_THRESHOLDS,
  BRAKING_TIER_THRESHOLDS,
  CORNERING_TIER_THRESHOLDS,
  DETECTION_COOLDOWN_MS,
  OSCILLATION_TIER_THRESHOLDS,
  SEVERITY_ORDER_DESC,
  SPEEDING_HYSTERESIS_MARGIN_KMH,
  SPEEDING_OVER_LIMIT_THRESHOLD_KMH,
  SPEEDING_PERSISTENCE_MS,
} from '@utils/tracking/severityThresholds';

describe('severityThresholds', () => {
  it('keeps severity order from harsh to light', () => {
    expect(SEVERITY_ORDER_DESC).toEqual(['harsh', 'moderate', 'light']);
  });

  it('uses monotonic thresholds for braking and acceleration tiers', () => {
    for (const thresholds of Object.values(BRAKING_TIER_THRESHOLDS)) {
      expect(thresholds.light.minForceG).toBeLessThanOrEqual(thresholds.moderate.minForceG);
      expect(thresholds.moderate.minForceG).toBeLessThanOrEqual(thresholds.harsh.minForceG);
      expect(thresholds.light.minRateKmhPerSec).toBeLessThanOrEqual(thresholds.moderate.minRateKmhPerSec);
      expect(thresholds.moderate.minRateKmhPerSec).toBeLessThanOrEqual(thresholds.harsh.minRateKmhPerSec);
    }

    for (const thresholds of Object.values(ACCELERATION_TIER_THRESHOLDS)) {
      expect(thresholds.light.minForceG).toBeLessThanOrEqual(thresholds.moderate.minForceG);
      expect(thresholds.moderate.minForceG).toBeLessThanOrEqual(thresholds.harsh.minForceG);
      expect(thresholds.light.minRateKmhPerSec).toBeLessThanOrEqual(thresholds.moderate.minRateKmhPerSec);
      expect(thresholds.moderate.minRateKmhPerSec).toBeLessThanOrEqual(thresholds.harsh.minRateKmhPerSec);
    }
  });

  it('uses monotonic thresholds for cornering tiers', () => {
    for (const thresholds of Object.values(CORNERING_TIER_THRESHOLDS)) {
      expect(thresholds.light.minForceG).toBeLessThanOrEqual(thresholds.moderate.minForceG);
      expect(thresholds.moderate.minForceG).toBeLessThanOrEqual(thresholds.harsh.minForceG);
      expect(thresholds.light.minHeadingChangeDeg).toBeLessThanOrEqual(thresholds.moderate.minHeadingChangeDeg);
      expect(thresholds.moderate.minHeadingChangeDeg).toBeLessThanOrEqual(thresholds.harsh.minHeadingChangeDeg);
    }
  });

  it('uses monotonic thresholds for oscillation tiers', () => {
    for (const thresholds of Object.values(OSCILLATION_TIER_THRESHOLDS)) {
      expect(thresholds.light.minSpeedStdDevKmh).toBeLessThanOrEqual(thresholds.moderate.minSpeedStdDevKmh);
      expect(thresholds.moderate.minSpeedStdDevKmh).toBeLessThanOrEqual(thresholds.harsh.minSpeedStdDevKmh);
      expect(thresholds.light.minSignFlipCount).toBeLessThanOrEqual(thresholds.moderate.minSignFlipCount);
      expect(thresholds.moderate.minSignFlipCount).toBeLessThanOrEqual(thresholds.harsh.minSignFlipCount);
      expect(thresholds.light.minForceP90G).toBeLessThanOrEqual(thresholds.moderate.minForceP90G);
      expect(thresholds.moderate.minForceP90G).toBeLessThanOrEqual(thresholds.harsh.minForceP90G);
    }
  });

  it('uses ascending speeding thresholds and non-negative cooldowns', () => {
    expect(SPEEDING_OVER_LIMIT_THRESHOLD_KMH.light).toBeLessThan(SPEEDING_OVER_LIMIT_THRESHOLD_KMH.moderate);
    expect(SPEEDING_OVER_LIMIT_THRESHOLD_KMH.moderate).toBeLessThan(SPEEDING_OVER_LIMIT_THRESHOLD_KMH.harsh);
    expect(SPEEDING_HYSTERESIS_MARGIN_KMH).toBeGreaterThanOrEqual(0);
    expect(SPEEDING_PERSISTENCE_MS).toBeGreaterThanOrEqual(0);

    for (const familyCooldowns of Object.values(DETECTION_COOLDOWN_MS)) {
      expect(familyCooldowns.light).toBeGreaterThanOrEqual(0);
      expect(familyCooldowns.moderate).toBeGreaterThanOrEqual(0);
      expect(familyCooldowns.harsh).toBeGreaterThanOrEqual(0);
    }
  });
});
