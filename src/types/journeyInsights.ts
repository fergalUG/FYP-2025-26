import type { Journey } from '@/types/db';

export type SummaryRange = 'week' | 'month';

export interface JourneyPeriodSummary {
  range: SummaryRange;
  anchorTimestamp: number;
  averageScore: number | null;
  journeyCount: number;
  distanceKm: number;
  journeys: Journey[];
}

export interface JourneyComparisonSummary {
  range: SummaryRange;
  anchorTimestamp: number;
  currentScore: number | null;
  baselineAverageScore: number | null;
  baselineJourneyCount: number;
  delta: number | null;
}

export type DrivingOverviewCategoryKey = 'braking' | 'acceleration' | 'cornering' | 'stopAndGo' | 'speeding' | 'oscillation';

export interface DrivingOverviewSeverityBreakdown {
  light: number;
  moderate: number;
  harsh: number;
}

export type DrivingOverviewAvailability = 'ready' | 'unavailable';

export interface DrivingOverviewCategorySummary {
  key: DrivingOverviewCategoryKey;
  label: string;
  totalCount: number | null;
  perHourRate: number | null;
  averageMinutesBetween: number | null;
  affectedJourneyCount: number;
  evaluatedJourneyCount: number;
  affectedJourneyPercentage: number | null;
  severityBreakdown: DrivingOverviewSeverityBreakdown | null;
  totalDurationSeconds: number | null;
  availability: DrivingOverviewAvailability;
  availabilityMessage: string | null;
}

export interface DrivingOverviewSpeedingAvailabilitySummary {
  readyJourneyCount: number;
  legacyJourneyCount: number;
  unavailableJourneyCount: number;
  disabledJourneyCount: number;
}

export interface DrivingOverviewSummary {
  range: SummaryRange;
  anchorTimestamp: number;
  analyzedJourneyCount: number;
  drivingTimeMs: number;
  distanceKm: number;
  totalOccurrenceCount: number;
  categories: DrivingOverviewCategorySummary[];
  speedingAvailability: DrivingOverviewSpeedingAvailabilitySummary;
}
