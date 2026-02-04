import { getSpeedBand, resolveSpeedBand } from '@utils/tracking/thresholdBands';

describe('thresholdBands', () => {
  it('assigns initial band by speed', () => {
    expect(getSpeedBand(19)).toBe('low');
    expect(getSpeedBand(20)).toBe('mid');
    expect(getSpeedBand(49)).toBe('mid');
    expect(getSpeedBand(50)).toBe('high');
    expect(getSpeedBand(79)).toBe('high');
    expect(getSpeedBand(80)).toBe('very_high');
  });

  it('applies hysteresis around the 50 km/h boundary with 3 km/h margin', () => {
    let band: ReturnType<typeof getSpeedBand> | null = 'mid';

    band = resolveSpeedBand(49.9, band, 3);
    expect(band).toBe('mid');

    band = resolveSpeedBand(50.1, band, 3);
    expect(band).toBe('mid');

    band = resolveSpeedBand(53, band, 3);
    expect(band).toBe('high');

    band = resolveSpeedBand(49, band, 3);
    expect(band).toBe('high');

    band = resolveSpeedBand(46, band, 3);
    expect(band).toBe('mid');
  });

  it('applies hysteresis around the 20 km/h boundary with 3 km/h margin', () => {
    let band: ReturnType<typeof getSpeedBand> | null = 'low';

    band = resolveSpeedBand(19.9, band, 3);
    expect(band).toBe('low');

    band = resolveSpeedBand(22, band, 3);
    expect(band).toBe('low');

    band = resolveSpeedBand(23, band, 3);
    expect(band).toBe('mid');

    band = resolveSpeedBand(19, band, 3);
    expect(band).toBe('mid');

    band = resolveSpeedBand(16, band, 3);
    expect(band).toBe('low');
  });

  it('applies hysteresis around the 80 km/h boundary with 3 km/h margin', () => {
    let band: ReturnType<typeof getSpeedBand> | null = 'high';

    band = resolveSpeedBand(79.5, band, 3);
    expect(band).toBe('high');

    band = resolveSpeedBand(81, band, 3);
    expect(band).toBe('high');

    band = resolveSpeedBand(83, band, 3);
    expect(band).toBe('very_high');

    band = resolveSpeedBand(79, band, 3);
    expect(band).toBe('very_high');

    band = resolveSpeedBand(76, band, 3);
    expect(band).toBe('high');
  });
});
