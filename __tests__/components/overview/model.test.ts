import type { DrivingOverviewCategorySummary } from '@types';

import {
  buildOverviewCategoryRows,
  formatOverviewDrivingTime,
  formatOverviewPrimaryValue,
  shouldUseCompactOverviewCards,
} from '@components/overview/model';

const makeCategory = (
  partial: Partial<DrivingOverviewCategorySummary> & Pick<DrivingOverviewCategorySummary, 'key' | 'label' | 'availability'>
): DrivingOverviewCategorySummary => ({
  key: partial.key,
  label: partial.label,
  totalCount: partial.totalCount ?? 6,
  perHourRate: partial.perHourRate ?? 2,
  averageMinutesBetween: partial.averageMinutesBetween ?? 30,
  affectedJourneyCount: partial.affectedJourneyCount ?? 3,
  evaluatedJourneyCount: partial.evaluatedJourneyCount ?? 4,
  affectedJourneyPercentage: partial.affectedJourneyPercentage ?? 75,
  severityBreakdown: partial.severityBreakdown ?? {
    light: 2,
    moderate: 3,
    harsh: 1,
  },
  totalDurationSeconds: partial.totalDurationSeconds ?? null,
  availability: partial.availability,
  availabilityMessage: partial.availabilityMessage ?? null,
});

describe('overview model', () => {
  it('builds compact card rows for available categories with optional coverage and split details', () => {
    const category = makeCategory({
      key: 'speeding',
      label: 'Speeding',
      availability: 'ready',
      totalDurationSeconds: 210,
      evaluatedJourneyCount: 3,
    });

    expect(formatOverviewPrimaryValue(category)).toBe('6');
    expect(buildOverviewCategoryRows(category, 5)).toEqual([
      { label: 'Rate', value: '2.0/hr' },
      { label: 'Drives', value: '3/3 (75%)' },
      { label: 'Time', value: '3m 30s' },
      { label: 'Split', value: 'L2 M3 H1' },
      { label: 'Coverage', value: '3/5 drives' },
    ]);
  });

  it('returns an unavailable state and uses compact cards only on narrower screens', () => {
    const category = makeCategory({
      key: 'speeding',
      label: 'Speeding',
      availability: 'unavailable',
      totalCount: null,
      perHourRate: null,
      averageMinutesBetween: null,
      affectedJourneyPercentage: null,
      severityBreakdown: null,
      availabilityMessage: 'No usable speed limit data was available in this range.',
    });

    expect(formatOverviewPrimaryValue(category)).toBe('Unavailable');
    expect(buildOverviewCategoryRows(category, 4)).toEqual([
      { label: 'Status', value: 'No usable speed limit data was available in this range.' },
    ]);
    expect(shouldUseCompactOverviewCards(390)).toBe(true);
    expect(shouldUseCompactOverviewCards(520)).toBe(false);
    expect(formatOverviewDrivingTime(90 * 60 * 1000)).toBe('1h 30m');
  });
});
