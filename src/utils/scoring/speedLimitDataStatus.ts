import type { ScoringStats } from '@types';

export type SpeedLimitDataStatus = NonNullable<ScoringStats['speedLimitDataStatus']> | 'legacy';

export const getSpeedLimitDataStatus = (stats: ScoringStats): SpeedLimitDataStatus => {
  if (stats.speedLimitDataStatus) {
    return stats.speedLimitDataStatus;
  }

  if (stats.speedLimitDetectionEnabled === false) {
    return 'disabled';
  }

  return 'legacy';
};

export const isSpeedLimitDataUsable = (stats: ScoringStats): boolean => {
  const status = getSpeedLimitDataStatus(stats);
  return status === 'legacy' || status === 'ready';
};
