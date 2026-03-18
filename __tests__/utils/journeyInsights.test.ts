import type { Journey, ScoringStats } from '@types';

import { buildDrivingOverviewSummary, buildJourneyComparisonSummary, buildJourneyPeriodSummary } from '@utils/journeyInsights';

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

const makeStats = (partial: Partial<ScoringStats> = {}): ScoringStats => ({
  durationMs: 60 * 60 * 1000,
  speedLimitDetectionEnabled: true,
  speedLimitDataStatus: 'ready',
  score: 88,
  avgScore: 86,
  blendedAvgScore: 86,
  endScore: 84,
  minScore: 78,
  harshBrakingCount: 0,
  moderateBrakingCount: 0,
  lightBrakingCount: 0,
  harshAccelerationCount: 0,
  moderateAccelerationCount: 0,
  lightAccelerationCount: 0,
  sharpTurnCount: 0,
  moderateTurnCount: 0,
  lightTurnCount: 0,
  stopAndGoCount: 0,
  lightSpeedingEpisodeCount: 0,
  moderateSpeedingEpisodeCount: 0,
  harshSpeedingEpisodeCount: 0,
  lightSpeedingSeconds: 0,
  moderateSpeedingSeconds: 0,
  harshSpeedingSeconds: 0,
  lightOscillationEpisodeCount: 0,
  moderateOscillationEpisodeCount: 0,
  harshOscillationEpisodeCount: 0,
  lightOscillationSeconds: 0,
  moderateOscillationSeconds: 0,
  harshOscillationSeconds: 0,
  avgSpeed: 42,
  maxSpeed: 80,
  ...partial,
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

  describe('buildDrivingOverviewSummary', () => {
    it('filters overview data by range and excludes completed journeys without stats', () => {
      const anchorTimestamp = 30 * DAY_MS;
      const journeys = [
        makeJourney({ id: 1, startTime: anchorTimestamp - 2 * DAY_MS, distanceKm: 10, stats: makeStats() }),
        makeJourney({ id: 2, startTime: anchorTimestamp - 12 * DAY_MS, distanceKm: 15, stats: makeStats() }),
        makeJourney({ id: 3, startTime: anchorTimestamp - 2 * DAY_MS, distanceKm: 8, stats: null }),
      ];

      const weekly = buildDrivingOverviewSummary(journeys, 'week', anchorTimestamp);
      const monthly = buildDrivingOverviewSummary(journeys, 'month', anchorTimestamp);

      expect(weekly.analyzedJourneyCount).toBe(1);
      expect(weekly.distanceKm).toBe(10);
      expect(monthly.analyzedJourneyCount).toBe(2);
      expect(monthly.distanceKm).toBe(25);
    });

    it('aggregates category totals, rates, time-between values, affected journeys, and severity splits', () => {
      const anchorTimestamp = 30 * DAY_MS;
      const journeys = [
        makeJourney({
          id: 10,
          startTime: anchorTimestamp - DAY_MS,
          distanceKm: 12,
          stats: makeStats({
            durationMs: 60 * 60 * 1000,
            lightBrakingCount: 1,
            moderateBrakingCount: 1,
            stopAndGoCount: 1,
            lightOscillationEpisodeCount: 1,
            lightOscillationSeconds: 30,
          }),
        }),
        makeJourney({
          id: 11,
          startTime: anchorTimestamp - 2 * DAY_MS,
          distanceKm: 18,
          stats: makeStats({
            durationMs: 60 * 60 * 1000,
            harshBrakingCount: 1,
            lightAccelerationCount: 2,
            moderateAccelerationCount: 1,
            lightTurnCount: 1,
            lightSpeedingEpisodeCount: 2,
            lightSpeedingSeconds: 120,
            moderateOscillationEpisodeCount: 1,
            moderateOscillationSeconds: 60,
          }),
        }),
      ];

      const summary = buildDrivingOverviewSummary(journeys, 'week', anchorTimestamp);
      const braking = summary.categories.find((category) => category.key === 'braking');
      const stopAndGo = summary.categories.find((category) => category.key === 'stopAndGo');
      const oscillation = summary.categories.find((category) => category.key === 'oscillation');

      expect(summary.analyzedJourneyCount).toBe(2);
      expect(summary.drivingTimeMs).toBe(2 * 60 * 60 * 1000);
      expect(summary.distanceKm).toBe(30);
      expect(summary.totalOccurrenceCount).toBe(12);

      expect(braking).toEqual(
        expect.objectContaining({
          totalCount: 3,
          affectedJourneyCount: 2,
          evaluatedJourneyCount: 2,
          severityBreakdown: { light: 1, moderate: 1, harsh: 1 },
        })
      );
      expect(braking?.perHourRate).toBeCloseTo(1.5, 5);
      expect(braking?.averageMinutesBetween).toBeCloseTo(40, 5);
      expect(braking?.affectedJourneyPercentage).toBeCloseTo(100, 5);

      expect(stopAndGo).toEqual(
        expect.objectContaining({
          totalCount: 1,
          affectedJourneyCount: 1,
          affectedJourneyPercentage: 50,
          severityBreakdown: null,
        })
      );
      expect(stopAndGo?.perHourRate).toBeCloseTo(0.5, 5);
      expect(stopAndGo?.averageMinutesBetween).toBeCloseTo(120, 5);

      expect(oscillation).toEqual(
        expect.objectContaining({
          totalCount: 2,
          totalDurationSeconds: 90,
          severityBreakdown: { light: 1, moderate: 1, harsh: 0 },
        })
      );
    });

    it('limits speeding metrics to journeys with usable speed-limit data', () => {
      const anchorTimestamp = 30 * DAY_MS;
      const journeys = [
        makeJourney({
          id: 21,
          startTime: anchorTimestamp - DAY_MS,
          stats: makeStats({
            durationMs: 60 * 60 * 1000,
            speedLimitDataStatus: 'ready',
            lightSpeedingEpisodeCount: 2,
            lightSpeedingSeconds: 120,
          }),
        }),
        makeJourney({
          id: 22,
          startTime: anchorTimestamp - 2 * DAY_MS,
          stats: makeStats({
            durationMs: 30 * 60 * 1000,
            speedLimitDataStatus: undefined,
            moderateSpeedingEpisodeCount: 1,
            moderateSpeedingSeconds: 60,
          }),
        }),
        makeJourney({
          id: 23,
          startTime: anchorTimestamp - 3 * DAY_MS,
          stats: makeStats({
            durationMs: 45 * 60 * 1000,
            speedLimitDetectionEnabled: false,
            speedLimitDataStatus: 'disabled',
            harshSpeedingEpisodeCount: 5,
            harshSpeedingSeconds: 500,
          }),
        }),
        makeJourney({
          id: 24,
          startTime: anchorTimestamp - 4 * DAY_MS,
          stats: makeStats({
            durationMs: 45 * 60 * 1000,
            speedLimitDataStatus: 'unavailable',
            harshSpeedingEpisodeCount: 4,
            harshSpeedingSeconds: 400,
          }),
        }),
      ];

      const summary = buildDrivingOverviewSummary(journeys, 'week', anchorTimestamp);
      const speeding = summary.categories.find((category) => category.key === 'speeding');

      expect(summary.speedingAvailability).toEqual({
        readyJourneyCount: 1,
        legacyJourneyCount: 1,
        unavailableJourneyCount: 1,
        disabledJourneyCount: 1,
      });
      expect(speeding).toEqual(
        expect.objectContaining({
          availability: 'ready',
          totalCount: 3,
          totalDurationSeconds: 180,
          affectedJourneyCount: 2,
          evaluatedJourneyCount: 2,
          severityBreakdown: { light: 2, moderate: 1, harsh: 0 },
        })
      );
      expect(speeding?.perHourRate).toBeCloseTo(2, 5);
      expect(speeding?.affectedJourneyPercentage).toBeCloseTo(100, 5);
    });

    it('marks speeding as unavailable when the selected range has no usable speed-limit data', () => {
      const anchorTimestamp = 30 * DAY_MS;
      const journeys = [
        makeJourney({
          id: 31,
          startTime: anchorTimestamp - DAY_MS,
          stats: makeStats({
            speedLimitDetectionEnabled: false,
            speedLimitDataStatus: 'disabled',
          }),
        }),
        makeJourney({
          id: 32,
          startTime: anchorTimestamp - 2 * DAY_MS,
          stats: makeStats({
            speedLimitDataStatus: 'unavailable',
          }),
        }),
      ];

      const summary = buildDrivingOverviewSummary(journeys, 'week', anchorTimestamp);
      const speeding = summary.categories.find((category) => category.key === 'speeding');

      expect(speeding).toEqual(
        expect.objectContaining({
          availability: 'unavailable',
          totalCount: null,
          perHourRate: null,
          averageMinutesBetween: null,
        })
      );
      expect(speeding?.availabilityMessage).toContain('No usable speed limit data');
    });
  });
});
