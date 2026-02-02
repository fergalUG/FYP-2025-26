import { checkSpeedOutlier } from '@utils/tracking/outlierDetection';

describe('checkSpeedOutlier', () => {
  it('flags outlier for excessive acceleration', () => {
    const result = checkSpeedOutlier(30, 0, 1);
    expect(result.isOutlier).toBe(true);
    expect(result.reason).toContain('Acceleration');
    expect(result.fallbackSpeed).toBe(0);
  });

  it('flags outlier for excessive deceleration', () => {
    const result = checkSpeedOutlier(0, 30, 1);
    expect(result.isOutlier).toBe(true);
    expect(result.reason).toContain('Deceleration');
    expect(result.fallbackSpeed).toBe(30);
  });

  it('accepts normal acceleration', () => {
    const result = checkSpeedOutlier(10, 8, 1);
    expect(result.isOutlier).toBe(false);
    expect(result.fallbackSpeed).toBe(10);
  });

  it('flags outlier when time delta is invalid', () => {
    const result = checkSpeedOutlier(10, 8, 0);
    expect(result.isOutlier).toBe(true);
    expect(result.reason).toContain('Non-positive');
  });
});
