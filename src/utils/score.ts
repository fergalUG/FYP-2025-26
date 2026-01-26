import type { Theme } from '@theme';

export const getScoreColor = (score: number, theme: Theme): string => {
  if (score >= 80) return theme.colors.score.excellent;
  if (score >= 60) return theme.colors.score.good;
  if (score >= 40) return theme.colors.score.fair;
  return theme.colors.score.poor;
};
