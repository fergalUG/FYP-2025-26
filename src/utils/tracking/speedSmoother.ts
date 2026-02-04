import type { SpeedSample, SmoothedSpeed } from '@/types/tracking';
import type { SpeedConfidence, SpeedSource } from '@utils/gpsValidation';

const pickMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const pickByCount = <T extends string>(counts: Record<T, number>, order: T[]): T => {
  let best = order[0];
  let bestCount = -1;
  for (const key of order) {
    const count = counts[key] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
};

const summarizeConfidence = (samples: SpeedSample[]): SpeedConfidence => {
  if (samples.length === 0) return 'none';
  const counts = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  } satisfies Record<SpeedConfidence, number>;
  for (const sample of samples) {
    counts[sample.confidence] += 1;
  }
  return pickByCount(counts, ['high', 'medium', 'low', 'none']);
};

const summarizeSource = (samples: SpeedSample[]): SpeedSource => {
  if (samples.length === 0) return 'none';
  const counts = {
    gps: 0,
    calculated: 0,
    none: 0,
  } satisfies Record<SpeedSource, number>;
  for (const sample of samples) {
    counts[sample.source] += 1;
  }
  return pickByCount(counts, ['gps', 'calculated', 'none']);
};

export const createSpeedSmoother = (maxSamples: number) => {
  let samples: SpeedSample[] = [];

  const getSmoothed = (): SmoothedSpeed => ({
    speedMs: pickMedian(samples.map((sample) => sample.speedMs)),
    confidence: summarizeConfidence(samples),
    source: summarizeSource(samples),
    samples: samples.length,
  });

  const addSample = (speedMs: number, confidence: SpeedConfidence, source: SpeedSource): SmoothedSpeed => {
    if (!Number.isFinite(speedMs) || speedMs < 0) {
      return getSmoothed();
    }

    samples.push({ speedMs, confidence, source });
    if (samples.length > maxSamples) {
      samples.shift();
    }

    return getSmoothed();
  };

  const reset = (): void => {
    samples = [];
  };

  return {
    addSample,
    reset,
    getSmoothed,
  };
};
