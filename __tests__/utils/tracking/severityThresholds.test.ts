import {
  ACCELERATION_TIER_THRESHOLDS,
  BRAKING_TIER_THRESHOLDS,
  CORNERING_TIER_THRESHOLDS,
  DETECTION_COOLDOWN_MS,
  SEVERITY_ORDER_DESC,
  SPEEDING_THRESHOLD_KMH,
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

  it('uses ascending speeding thresholds and non-negative cooldowns', () => {
    expect(SPEEDING_THRESHOLD_KMH.light).toBeLessThan(SPEEDING_THRESHOLD_KMH.moderate);
    expect(SPEEDING_THRESHOLD_KMH.moderate).toBeLessThan(SPEEDING_THRESHOLD_KMH.harsh);

    for (const familyCooldowns of Object.values(DETECTION_COOLDOWN_MS)) {
      expect(familyCooldowns.light).toBeGreaterThanOrEqual(0);
      expect(familyCooldowns.moderate).toBeGreaterThanOrEqual(0);
      expect(familyCooldowns.harsh).toBeGreaterThanOrEqual(0);
    }
  });
});
