import type { ScoringStats } from '@types';

const formatSeconds = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
};

export const isSpeedLimitDetectionEnabledForJourney = (stats: ScoringStats): boolean => {
  return stats.speedLimitDetectionEnabled ?? true;
};

export const buildJourneyStatsSummary = (stats: ScoringStats): string => {
  const lightOscillationEpisodeCount = stats.lightOscillationEpisodeCount ?? 0;
  const moderateOscillationEpisodeCount = stats.moderateOscillationEpisodeCount ?? 0;
  const harshOscillationEpisodeCount = stats.harshOscillationEpisodeCount ?? 0;
  const lightOscillationSeconds = stats.lightOscillationSeconds ?? 0;
  const moderateOscillationSeconds = stats.moderateOscillationSeconds ?? 0;
  const harshOscillationSeconds = stats.harshOscillationSeconds ?? 0;

  const lightIncidentCount = stats.lightBrakingCount + stats.lightAccelerationCount + stats.lightTurnCount + lightOscillationEpisodeCount;
  const moderateIncidentCount =
    stats.moderateBrakingCount + stats.moderateAccelerationCount + stats.moderateTurnCount + moderateOscillationEpisodeCount;
  const harshIncidentCount = stats.harshBrakingCount + stats.harshAccelerationCount + stats.sharpTurnCount + harshOscillationEpisodeCount;
  const stopAndGoCount = stats.stopAndGoCount ?? 0;
  const totalDrivingEvents = lightIncidentCount + moderateIncidentCount + harshIncidentCount + stopAndGoCount;
  const totalSpeedingEpisodes = stats.lightSpeedingEpisodeCount + stats.moderateSpeedingEpisodeCount + stats.harshSpeedingEpisodeCount;
  const totalSpeedingSeconds = stats.lightSpeedingSeconds + stats.moderateSpeedingSeconds + stats.harshSpeedingSeconds;
  const totalOscillationEpisodes = lightOscillationEpisodeCount + moderateOscillationEpisodeCount + harshOscillationEpisodeCount;
  const totalOscillationSeconds = lightOscillationSeconds + moderateOscillationSeconds + harshOscillationSeconds;

  const summaryParts: string[] = [];

  if (totalDrivingEvents === 0) {
    summaryParts.push('No driving events');
  } else {
    summaryParts.push(
      `${totalDrivingEvents} driving event${totalDrivingEvents === 1 ? '' : 's'} (Light ${lightIncidentCount}, Moderate ${moderateIncidentCount}, Harsh ${harshIncidentCount})`
    );
  }

  if (stopAndGoCount === 0) {
    summaryParts.push('no stop & go');
  } else {
    summaryParts.push(`${stopAndGoCount} stop & go event${stopAndGoCount === 1 ? '' : 's'}`);
  }

  if (!isSpeedLimitDetectionEnabledForJourney(stats)) {
    summaryParts.push('speeding detection disabled');
  } else if (totalSpeedingEpisodes === 0) {
    summaryParts.push('no speeding');
  } else {
    summaryParts.push(
      `${totalSpeedingEpisodes} speeding episode${totalSpeedingEpisodes === 1 ? '' : 's'} (${formatSeconds(totalSpeedingSeconds)})`
    );
  }

  if (totalOscillationEpisodes === 0) {
    summaryParts.push('no oscillation');
  } else {
    summaryParts.push(
      `${totalOscillationEpisodes} oscillation episode${totalOscillationEpisodes === 1 ? '' : 's'} (${formatSeconds(totalOscillationSeconds)})`
    );
  }

  return summaryParts.join(', ');
};
