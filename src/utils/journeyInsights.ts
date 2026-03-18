import type { Journey, JourneyComparisonSummary, JourneyPeriodSummary, SummaryRange } from '@types';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUMMARY_RANGE_MS: Record<SummaryRange, number> = {
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

const hasFiniteNumber = (value: number | null | undefined): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

export const isCompletedJourney = (journey: Journey): boolean => {
  return (
    hasFiniteNumber(journey.startTime) && hasFiniteNumber(journey.endTime) && journey.endTime > 0 && hasFiniteNumber(journey.distanceKm)
  );
};

export const hasJourneyScore = (journey: Journey): boolean => {
  return hasFiniteNumber(journey.score ?? journey.stats?.score ?? null);
};

export const getSummaryRangeDurationMs = (range: SummaryRange): number => {
  return SUMMARY_RANGE_MS[range];
};

export const getJourneyAnchorTimestamp = (journey: Journey): number | null => {
  if (hasFiniteNumber(journey.endTime) && journey.endTime > 0) {
    return journey.endTime;
  }

  if (hasFiniteNumber(journey.startTime) && journey.startTime > 0) {
    return journey.startTime;
  }

  return null;
};

export const getJourneysInSummaryRange = (journeys: Journey[], range: SummaryRange, anchorTimestamp: number): Journey[] => {
  const windowStart = anchorTimestamp - getSummaryRangeDurationMs(range);

  return journeys.filter((journey) => {
    if (!isCompletedJourney(journey)) {
      return false;
    }

    const journeyAnchor = getJourneyAnchorTimestamp(journey);
    return typeof journeyAnchor === 'number' && journeyAnchor >= windowStart && journeyAnchor <= anchorTimestamp;
  });
};

const getJourneyScoreValue = (journey: Journey): number | null => {
  if (hasFiniteNumber(journey.score)) {
    return journey.score;
  }

  if (hasFiniteNumber(journey.stats?.score ?? null)) {
    return journey.stats?.score ?? null;
  }

  return null;
};

export const buildJourneyPeriodSummary = (journeys: Journey[], range: SummaryRange, anchorTimestamp: number): JourneyPeriodSummary => {
  const periodJourneys = getJourneysInSummaryRange(journeys, range, anchorTimestamp);
  const scoredJourneys = periodJourneys.filter(hasJourneyScore);
  const totalScore = scoredJourneys.reduce((sum, journey) => sum + (getJourneyScoreValue(journey) ?? 0), 0);
  const averageScore = scoredJourneys.length > 0 ? totalScore / scoredJourneys.length : null;
  const distanceKm = periodJourneys.reduce((sum, journey) => sum + (journey.distanceKm ?? 0), 0);

  return {
    range,
    anchorTimestamp,
    averageScore,
    journeyCount: periodJourneys.length,
    distanceKm,
    journeys: periodJourneys,
  };
};

export const buildJourneyComparisonSummary = (
  journeys: Journey[],
  currentJourney: Journey,
  range: SummaryRange
): JourneyComparisonSummary => {
  const anchorTimestamp = getJourneyAnchorTimestamp(currentJourney);
  const currentScore = getJourneyScoreValue(currentJourney);

  if (anchorTimestamp === null) {
    return {
      range,
      anchorTimestamp: 0,
      currentScore,
      baselineAverageScore: null,
      baselineJourneyCount: 0,
      delta: null,
    };
  }

  const baselineJourneys = getJourneysInSummaryRange(journeys, range, anchorTimestamp).filter(
    (journey) => journey.id !== currentJourney.id && hasJourneyScore(journey)
  );

  if (baselineJourneys.length === 0 || !hasFiniteNumber(currentScore)) {
    return {
      range,
      anchorTimestamp,
      currentScore,
      baselineAverageScore: null,
      baselineJourneyCount: baselineJourneys.length,
      delta: null,
    };
  }

  const baselineAverageScore =
    baselineJourneys.reduce((sum, journey) => sum + (getJourneyScoreValue(journey) ?? 0), 0) / baselineJourneys.length;

  return {
    range,
    anchorTimestamp,
    currentScore,
    baselineAverageScore,
    baselineJourneyCount: baselineJourneys.length,
    delta: currentScore - baselineAverageScore,
  };
};
