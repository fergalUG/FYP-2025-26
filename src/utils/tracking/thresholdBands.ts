import type { SpeedBand } from '@/types/tracking';

const BAND_MARGIN_KMH_DEFAULT = 3;

export const getSpeedBand = (speedKmh: number): SpeedBand => {
  if (speedKmh < 20) return 'low';
  if (speedKmh < 50) return 'mid';
  if (speedKmh < 80) return 'high';
  return 'very_high';
};

export const resolveSpeedBand = (
  speedKmh: number,
  previousBand: SpeedBand | null,
  marginKmh: number = BAND_MARGIN_KMH_DEFAULT
): SpeedBand => {
  if (!previousBand) {
    return getSpeedBand(speedKmh);
  }

  switch (previousBand) {
    case 'low':
      return speedKmh >= 20 + marginKmh ? 'mid' : 'low';
    case 'mid':
      if (speedKmh < 20 - marginKmh) return 'low';
      return speedKmh >= 50 + marginKmh ? 'high' : 'mid';
    case 'high':
      if (speedKmh < 50 - marginKmh) return 'mid';
      return speedKmh >= 80 + marginKmh ? 'very_high' : 'high';
    case 'very_high':
      return speedKmh < 80 - marginKmh ? 'high' : 'very_high';
    default:
      return getSpeedBand(speedKmh);
  }
};
