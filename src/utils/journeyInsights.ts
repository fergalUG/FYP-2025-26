import type {
  DrivingOverviewCategoryKey,
  DrivingOverviewCategorySummary,
  DrivingOverviewSeverityBreakdown,
  DrivingOverviewSummary,
  Journey,
  JourneyComparisonSummary,
  JourneyPeriodSummary,
  ScoringStats,
  SummaryRange,
} from '@types';
import { getSpeedLimitDataStatus, isSpeedLimitDataUsable } from '@utils/scoring/speedLimitDataStatus';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUMMARY_RANGE_MS: Record<SummaryRange, number> = {
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

const DRIVING_OVERVIEW_LABELS: Record<DrivingOverviewCategoryKey, string> = {
  braking: 'Braking',
  acceleration: 'Acceleration',
  cornering: 'Cornering',
  stopAndGo: 'Stop & Go',
  speeding: 'Speeding',
  oscillation: 'Oscillation',
};

const EMPTY_SEVERITY_BREAKDOWN: DrivingOverviewSeverityBreakdown = {
  light: 0,
  moderate: 0,
  harsh: 0,
};

const hasFiniteNumber = (value: number | null | undefined): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const hasJourneyStats = (journey: Journey): journey is Journey & { stats: ScoringStats } => {
  return isCompletedJourney(journey) && journey.stats != null && hasFiniteNumber(journey.stats.durationMs);
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

const createSeverityBreakdown = (): DrivingOverviewSeverityBreakdown => ({
  ...EMPTY_SEVERITY_BREAKDOWN,
});

const sumSeverityBreakdown = (
  journeys: Array<Journey & { stats: ScoringStats }>,
  resolver: (stats: ScoringStats) => DrivingOverviewSeverityBreakdown
): DrivingOverviewSeverityBreakdown => {
  return journeys.reduce<DrivingOverviewSeverityBreakdown>((summary, journey) => {
    const breakdown = resolver(journey.stats);

    summary.light += breakdown.light;
    summary.moderate += breakdown.moderate;
    summary.harsh += breakdown.harsh;

    return summary;
  }, createSeverityBreakdown());
};

const sumDurationSeconds = (journeys: Array<Journey & { stats: ScoringStats }>, resolver: (stats: ScoringStats) => number): number => {
  return journeys.reduce((sum, journey) => sum + resolver(journey.stats), 0);
};

const buildOverviewCategorySummary = (args: {
  key: DrivingOverviewCategoryKey;
  evaluatedJourneys: Array<Journey & { stats: ScoringStats }>;
  availability?: DrivingOverviewCategorySummary['availability'];
  availabilityMessage?: string | null;
  countResolver: (stats: ScoringStats) => number;
  severityResolver?: (stats: ScoringStats) => DrivingOverviewSeverityBreakdown;
  durationResolver?: (stats: ScoringStats) => number;
}): DrivingOverviewCategorySummary => {
  const {
    key,
    evaluatedJourneys,
    availability = 'ready',
    availabilityMessage = null,
    countResolver,
    severityResolver,
    durationResolver,
  } = args;

  if (availability === 'unavailable') {
    return {
      key,
      label: DRIVING_OVERVIEW_LABELS[key],
      totalCount: null,
      perHourRate: null,
      averageMinutesBetween: null,
      affectedJourneyCount: 0,
      evaluatedJourneyCount: 0,
      affectedJourneyPercentage: null,
      severityBreakdown: severityResolver ? createSeverityBreakdown() : null,
      totalDurationSeconds: null,
      availability,
      availabilityMessage,
    };
  }

  const evaluatedJourneyCount = evaluatedJourneys.length;
  const totalDrivingTimeMs = evaluatedJourneys.reduce((sum, journey) => sum + journey.stats.durationMs, 0);
  const totalCount = evaluatedJourneys.reduce((sum, journey) => sum + countResolver(journey.stats), 0);
  const affectedJourneyCount = evaluatedJourneys.filter((journey) => countResolver(journey.stats) > 0).length;
  const perHourRate = totalDrivingTimeMs > 0 ? totalCount / (totalDrivingTimeMs / (60 * 60 * 1000)) : 0;
  const averageMinutesBetween = totalCount > 0 ? totalDrivingTimeMs / 60000 / totalCount : null;
  const affectedJourneyPercentage = evaluatedJourneyCount > 0 ? (affectedJourneyCount / evaluatedJourneyCount) * 100 : null;

  return {
    key,
    label: DRIVING_OVERVIEW_LABELS[key],
    totalCount,
    perHourRate,
    averageMinutesBetween,
    affectedJourneyCount,
    evaluatedJourneyCount,
    affectedJourneyPercentage,
    severityBreakdown: severityResolver ? sumSeverityBreakdown(evaluatedJourneys, severityResolver) : null,
    totalDurationSeconds: durationResolver ? sumDurationSeconds(evaluatedJourneys, durationResolver) : null,
    availability,
    availabilityMessage,
  };
};

export const buildDrivingOverviewSummary = (journeys: Journey[], range: SummaryRange, anchorTimestamp: number): DrivingOverviewSummary => {
  const journeysInRange = getJourneysInSummaryRange(journeys, range, anchorTimestamp);
  const analyzedJourneys = journeysInRange.filter(hasJourneyStats);
  const analyzedJourneyCount = analyzedJourneys.length;
  const drivingTimeMs = analyzedJourneys.reduce((sum, journey) => sum + journey.stats.durationMs, 0);
  const distanceKm = analyzedJourneys.reduce((sum, journey) => sum + (journey.distanceKm ?? 0), 0);

  const speedingAvailability = analyzedJourneys.reduce(
    (summary, journey) => {
      const status = getSpeedLimitDataStatus(journey.stats);

      if (status === 'ready') {
        summary.readyJourneyCount += 1;
      } else if (status === 'legacy') {
        summary.legacyJourneyCount += 1;
      } else if (status === 'disabled') {
        summary.disabledJourneyCount += 1;
      } else {
        summary.unavailableJourneyCount += 1;
      }

      return summary;
    },
    {
      readyJourneyCount: 0,
      legacyJourneyCount: 0,
      unavailableJourneyCount: 0,
      disabledJourneyCount: 0,
    }
  );

  const eligibleSpeedingJourneys = analyzedJourneys.filter((journey) => isSpeedLimitDataUsable(journey.stats));
  const speedingAvailabilityMessage =
    eligibleSpeedingJourneys.length > 0
      ? null
      : speedingAvailability.disabledJourneyCount > 0 && speedingAvailability.unavailableJourneyCount === 0
        ? 'Speed limit detection was disabled for this range.'
        : 'No usable speed limit data was available in this range.';

  const categories: DrivingOverviewCategorySummary[] = [
    buildOverviewCategorySummary({
      key: 'braking',
      evaluatedJourneys: analyzedJourneys,
      countResolver: (stats) => stats.lightBrakingCount + stats.moderateBrakingCount + stats.harshBrakingCount,
      severityResolver: (stats) => ({
        light: stats.lightBrakingCount,
        moderate: stats.moderateBrakingCount,
        harsh: stats.harshBrakingCount,
      }),
    }),
    buildOverviewCategorySummary({
      key: 'acceleration',
      evaluatedJourneys: analyzedJourneys,
      countResolver: (stats) => stats.lightAccelerationCount + stats.moderateAccelerationCount + stats.harshAccelerationCount,
      severityResolver: (stats) => ({
        light: stats.lightAccelerationCount,
        moderate: stats.moderateAccelerationCount,
        harsh: stats.harshAccelerationCount,
      }),
    }),
    buildOverviewCategorySummary({
      key: 'cornering',
      evaluatedJourneys: analyzedJourneys,
      countResolver: (stats) => stats.lightTurnCount + stats.moderateTurnCount + stats.sharpTurnCount,
      severityResolver: (stats) => ({
        light: stats.lightTurnCount,
        moderate: stats.moderateTurnCount,
        harsh: stats.sharpTurnCount,
      }),
    }),
    buildOverviewCategorySummary({
      key: 'stopAndGo',
      evaluatedJourneys: analyzedJourneys,
      countResolver: (stats) => stats.stopAndGoCount ?? 0,
    }),
    eligibleSpeedingJourneys.length > 0
      ? buildOverviewCategorySummary({
          key: 'speeding',
          evaluatedJourneys: eligibleSpeedingJourneys,
          countResolver: (stats) => stats.lightSpeedingEpisodeCount + stats.moderateSpeedingEpisodeCount + stats.harshSpeedingEpisodeCount,
          severityResolver: (stats) => ({
            light: stats.lightSpeedingEpisodeCount,
            moderate: stats.moderateSpeedingEpisodeCount,
            harsh: stats.harshSpeedingEpisodeCount,
          }),
          durationResolver: (stats) => stats.lightSpeedingSeconds + stats.moderateSpeedingSeconds + stats.harshSpeedingSeconds,
        })
      : buildOverviewCategorySummary({
          key: 'speeding',
          evaluatedJourneys: [],
          availability: 'unavailable',
          availabilityMessage: speedingAvailabilityMessage,
          countResolver: () => 0,
          severityResolver: () => createSeverityBreakdown(),
          durationResolver: () => 0,
        }),
    buildOverviewCategorySummary({
      key: 'oscillation',
      evaluatedJourneys: analyzedJourneys,
      countResolver: (stats) =>
        stats.lightOscillationEpisodeCount + stats.moderateOscillationEpisodeCount + stats.harshOscillationEpisodeCount,
      severityResolver: (stats) => ({
        light: stats.lightOscillationEpisodeCount,
        moderate: stats.moderateOscillationEpisodeCount,
        harsh: stats.harshOscillationEpisodeCount,
      }),
      durationResolver: (stats) => stats.lightOscillationSeconds + stats.moderateOscillationSeconds + stats.harshOscillationSeconds,
    }),
  ];

  const totalOccurrenceCount = categories.reduce((sum, category) => sum + (category.totalCount ?? 0), 0);

  return {
    range,
    anchorTimestamp,
    analyzedJourneyCount,
    drivingTimeMs,
    distanceKm,
    totalOccurrenceCount,
    categories,
    speedingAvailability,
  };
};
