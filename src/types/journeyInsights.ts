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

export interface HotspotFamilyBreakdown {
  braking: number;
  acceleration: number;
  cornering: number;
  oscillation: number;
  stopAndGo: number;
}

export interface HotspotMarker {
  id: string;
  kind: 'hotspot';
  latitude: number;
  longitude: number;
  count: number;
  journeyCount: number;
  dominantFamily: keyof HotspotFamilyBreakdown | null;
  familyBreakdown: HotspotFamilyBreakdown;
}
