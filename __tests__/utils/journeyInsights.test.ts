import type { Journey } from '@types';

import { buildJourneyComparisonSummary, buildJourneyPeriodSummary } from '@utils/journeyInsights';

const DAY_MS = 24 * 60 * 60 * 1000;

const makeJourney = (partial: Partial<Journey> & Pick<Journey, 'id' | 'startTime'>): Journey => ({
  id: partial.id,
  title: partial.title ?? `Journey ${partial.id}`,
  date: partial.date ?? '2026-03-18',
  startTime: partial.startTime,
  endTime: Object.prototype.hasOwnProperty.call(partial, 'endTime') ? partial.endTime : partial.startTime + 30 * 60 * 1000,
  score: partial.score ?? 80,
  distanceKm: partial.distanceKm ?? 10,
  stats: partial.stats ?? null,
});

describe('journeyInsights', () => {
  describe('buildJourneyPeriodSummary', () => {
    it('filters completed journeys inside the selected rolling window', () => {
      const anchorTimestamp = 30 * DAY_MS;
      const journeys = [
        makeJourney({ id: 1, startTime: anchorTimestamp - 2 * DAY_MS, score: 80, distanceKm: 10 }),
        makeJourney({ id: 2, startTime: anchorTimestamp - 10 * DAY_MS, score: 90, distanceKm: 15 }),
        makeJourney({ id: 3, startTime: anchorTimestamp - 20 * DAY_MS, score: 70, distanceKm: 20 }),
        makeJourney({ id: 4, startTime: anchorTimestamp - 2 * DAY_MS, endTime: null, score: 85, distanceKm: 12 }),
      ];

      const weeklySummary = buildJourneyPeriodSummary(journeys, 'week', anchorTimestamp);
      const monthlySummary = buildJourneyPeriodSummary(journeys, 'month', anchorTimestamp);

      expect(weeklySummary.journeyCount).toBe(1);
      expect(weeklySummary.averageScore).toBe(80);
      expect(weeklySummary.distanceKm).toBe(10);

      expect(monthlySummary.journeyCount).toBe(3);
      expect(monthlySummary.averageScore).toBeCloseTo(80, 5);
      expect(monthlySummary.distanceKm).toBe(45);
    });
  });

  describe('buildJourneyComparisonSummary', () => {
    it('anchors to the viewed journey and excludes the current journey from the baseline', () => {
      const currentJourney = makeJourney({
        id: 10,
        startTime: 20 * DAY_MS,
        endTime: 20 * DAY_MS + 60 * 60 * 1000,
        score: 88,
      });
      const journeys = [
        currentJourney,
        makeJourney({ id: 11, startTime: 18 * DAY_MS, endTime: 18 * DAY_MS + 10, score: 80 }),
        makeJourney({ id: 12, startTime: 15 * DAY_MS, endTime: 15 * DAY_MS + 10, score: 76 }),
        makeJourney({ id: 13, startTime: 5 * DAY_MS, endTime: 5 * DAY_MS + 10, score: 99 }),
        makeJourney({ id: 14, startTime: 21 * DAY_MS, endTime: 21 * DAY_MS + 10, score: 65 }),
      ];

      const comparison = buildJourneyComparisonSummary(journeys, currentJourney, 'week');

      expect(comparison.currentScore).toBe(88);
      expect(comparison.baselineJourneyCount).toBe(2);
      expect(comparison.baselineAverageScore).toBeCloseTo(78, 5);
      expect(comparison.delta).toBeCloseTo(10, 5);
    });

    it('returns an empty baseline when there are no earlier scored journeys in range', () => {
      const currentJourney = makeJourney({ id: 20, startTime: 12 * DAY_MS, score: 84 });
      const comparison = buildJourneyComparisonSummary([currentJourney], currentJourney, 'week');

      expect(comparison.baselineAverageScore).toBeNull();
      expect(comparison.delta).toBeNull();
      expect(comparison.baselineJourneyCount).toBe(0);
    });
  });
});
