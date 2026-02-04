import { createSpeedSmoother } from '@utils/tracking/speedSmoother';

describe('speedSmoother', () => {
  it('returns empty state before any samples', () => {
    const smoother = createSpeedSmoother(3);
    const result = smoother.getSmoothed();

    expect(result).toEqual({
      speedMs: 0,
      confidence: 'none',
      source: 'none',
      samples: 0,
    });
  });

  it('uses median for odd sample counts', () => {
    const smoother = createSpeedSmoother(5);

    smoother.addSample(10, 'high', 'gps');
    smoother.addSample(30, 'high', 'gps');
    const result = smoother.addSample(20, 'high', 'gps');

    expect(result.speedMs).toBe(20);
    expect(result.samples).toBe(3);
  });

  it('uses average of middle values for even sample counts', () => {
    const smoother = createSpeedSmoother(4);

    smoother.addSample(10, 'high', 'gps');
    const result = smoother.addSample(20, 'high', 'gps');

    expect(result.speedMs).toBe(15);
    expect(result.samples).toBe(2);
  });

  it('respects max sample size and drops oldest', () => {
    const smoother = createSpeedSmoother(3);

    smoother.addSample(5, 'high', 'gps');
    smoother.addSample(10, 'high', 'gps');
    smoother.addSample(15, 'high', 'gps');
    const result = smoother.addSample(100, 'high', 'gps');

    expect(result.samples).toBe(3);
    expect(result.speedMs).toBe(15);
  });

  it('summarizes confidence by majority', () => {
    const smoother = createSpeedSmoother(5);

    smoother.addSample(10, 'medium', 'gps');
    smoother.addSample(12, 'medium', 'gps');
    smoother.addSample(14, 'high', 'gps');
    smoother.addSample(16, 'medium', 'gps');
    const result = smoother.addSample(18, 'high', 'gps');

    expect(result.confidence).toBe('medium');
  });

  it('summarizes source by majority', () => {
    const smoother = createSpeedSmoother(4);

    smoother.addSample(10, 'high', 'gps');
    smoother.addSample(12, 'high', 'calculated');
    smoother.addSample(14, 'high', 'gps');
    const result = smoother.addSample(16, 'high', 'gps');

    expect(result.source).toBe('gps');
  });

  it('ignores invalid samples and keeps last smoothed value', () => {
    const smoother = createSpeedSmoother(3);

    smoother.addSample(10, 'high', 'gps');
    smoother.addSample(-10, 'high', 'gps');
    const result = smoother.addSample(Number.NaN, 'high', 'gps');

    expect(result.speedMs).toBe(10);
    expect(result.samples).toBe(1);
  });

  it('resets state', () => {
    const smoother = createSpeedSmoother(3);

    smoother.addSample(10, 'high', 'gps');
    smoother.reset();
    const result = smoother.getSmoothed();

    expect(result.samples).toBe(0);
    expect(result.speedMs).toBe(0);
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('none');
  });
});
