import type { DrivingOverviewCategorySummary, DrivingOverviewSeverityBreakdown } from '@types';

export interface OverviewDetailRow {
  label: string;
  value: string;
}

export const COMPACT_OVERVIEW_BREAKPOINT = 430;

const formatRatePerHour = (rate: number | null): string => {
  if (rate == null) {
    return '—';
  }

  return `${rate >= 10 ? Math.round(rate) : rate.toFixed(1)}/hr`;
};

const formatMinutes = (minutes: number | null): string => {
  if (minutes == null) {
    return '—';
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  }

  if (minutes >= 10) {
    return `${Math.round(minutes)}m`;
  }

  return `${minutes.toFixed(1)}m`;
};

const formatSeconds = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
};

const formatSeverityBreakdown = (breakdown: DrivingOverviewSeverityBreakdown): string => {
  return `L${breakdown.light} M${breakdown.moderate} H${breakdown.harsh}`;
};

export const shouldUseCompactOverviewCards = (screenWidth: number): boolean => {
  return Number.isFinite(screenWidth) && screenWidth < COMPACT_OVERVIEW_BREAKPOINT;
};

export const formatOverviewDrivingTime = (durationMs: number): string => {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
};

export const formatOverviewPrimaryValue = (category: DrivingOverviewCategorySummary): string => {
  if (category.availability === 'unavailable') {
    return 'Unavailable';
  }

  return String(category.totalCount ?? 0);
};

export const getOverviewPrimaryLabel = (category: DrivingOverviewCategorySummary): string => {
  if (category.key === 'speeding' || category.key === 'oscillation') {
    return 'Episodes';
  }

  return 'Events';
};

export const buildOverviewCategoryRows = (category: DrivingOverviewCategorySummary, totalJourneyCount: number): OverviewDetailRow[] => {
  if (category.availability === 'unavailable') {
    return [{ label: 'Status', value: category.availabilityMessage ?? 'Unavailable' }];
  }

  const rows: OverviewDetailRow[] = [
    { label: 'Rate', value: formatRatePerHour(category.perHourRate) },
    { label: 'Between', value: formatMinutes(category.averageMinutesBetween) },
    {
      label: 'Drives',
      value:
        category.affectedJourneyPercentage == null
          ? '—'
          : `${category.affectedJourneyCount}/${category.evaluatedJourneyCount} (${Math.round(category.affectedJourneyPercentage)}%)`,
    },
  ];

  if (category.totalDurationSeconds != null) {
    rows.push({ label: 'Time', value: formatSeconds(category.totalDurationSeconds) });
  }

  if (category.severityBreakdown) {
    rows.push({ label: 'Split', value: formatSeverityBreakdown(category.severityBreakdown) });
  }

  if (category.evaluatedJourneyCount !== totalJourneyCount) {
    rows.push({ label: 'Coverage', value: `${category.evaluatedJourneyCount}/${totalJourneyCount} drives` });
  }

  return rows;
};
