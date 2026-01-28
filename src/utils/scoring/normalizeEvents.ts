import type { Event } from '@types';
import { EventType } from '@types';

import type { EfficiencyScoringConfig, SpeedingSeverity } from '@utils/scoring/efficiencyScoringConfig';

export interface NormalizedIncident {
  type: EventType;
  timestamp: number;
}

export interface SpeedingEpisode {
  startTimestamp: number;
  endTimestamp: number;
  severity: SpeedingSeverity;
}

export interface NormalizedJourneyEvents {
  incidents: NormalizedIncident[];
  speedingEpisodes: SpeedingEpisode[];

  harshBrakingCount: number;
  harshAccelerationCount: number;
  sharpTurnCount: number;

  moderateSpeedingEpisodeCount: number;
  harshSpeedingEpisodeCount: number;
  moderateSpeedingSeconds: number;
  harshSpeedingSeconds: number;
}

const isDiscreteIncidentType = (type: EventType): boolean => {
  return type === EventType.HarshBraking || type === EventType.HarshAcceleration || type === EventType.SharpTurn;
};

const isSpeedingSampleType = (type: EventType): boolean => {
  return type === EventType.ModerateSpeeding || type === EventType.HarshSpeeding;
};

const maxSeverity = (a: SpeedingSeverity, b: SpeedingSeverity): SpeedingSeverity => {
  if (a === 'harsh' || b === 'harsh') return 'harsh';
  return 'moderate';
};

export const normalizeJourneyEvents = (events: Event[], config: EfficiencyScoringConfig): NormalizedJourneyEvents => {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const incidents: NormalizedIncident[] = [];
  const lastIncidentTimestampByType = new Map<EventType, number>();

  const speedingSamples: Array<{ timestamp: number; severity: SpeedingSeverity }> = [];

  for (const event of sorted) {
    if (isDiscreteIncidentType(event.type)) {
      const cooldown = config.cooldownMs[event.type] ?? 0;
      const lastTs = lastIncidentTimestampByType.get(event.type);
      if (typeof lastTs === 'number' && event.timestamp - lastTs < cooldown) {
        continue;
      }

      lastIncidentTimestampByType.set(event.type, event.timestamp);
      incidents.push({ type: event.type, timestamp: event.timestamp });
      continue;
    }

    if (isSpeedingSampleType(event.type)) {
      speedingSamples.push({
        timestamp: event.timestamp,
        severity: event.type === EventType.HarshSpeeding ? 'harsh' : 'moderate',
      });
    }
  }

  const speedingEpisodes: SpeedingEpisode[] = [];
  let currentEpisode: SpeedingEpisode | null = null;

  for (const sample of speedingSamples) {
    if (!currentEpisode) {
      currentEpisode = {
        startTimestamp: sample.timestamp,
        endTimestamp: sample.timestamp,
        severity: sample.severity,
      };
      continue;
    }

    if (sample.timestamp - currentEpisode.endTimestamp <= config.speedingEpisodeGapMs) {
      currentEpisode.endTimestamp = sample.timestamp;
      currentEpisode.severity = maxSeverity(currentEpisode.severity, sample.severity);
      continue;
    }

    speedingEpisodes.push(currentEpisode);
    currentEpisode = {
      startTimestamp: sample.timestamp,
      endTimestamp: sample.timestamp,
      severity: sample.severity,
    };
  }

  if (currentEpisode) {
    speedingEpisodes.push(currentEpisode);
  }

  let harshBrakingCount = 0;
  let harshAccelerationCount = 0;
  let sharpTurnCount = 0;
  for (const incident of incidents) {
    if (incident.type === EventType.HarshBraking) harshBrakingCount += 1;
    if (incident.type === EventType.HarshAcceleration) harshAccelerationCount += 1;
    if (incident.type === EventType.SharpTurn) sharpTurnCount += 1;
  }

  let moderateSpeedingEpisodeCount = 0;
  let harshSpeedingEpisodeCount = 0;
  let moderateSpeedingSeconds = 0;
  let harshSpeedingSeconds = 0;

  for (const episode of speedingEpisodes) {
    const seconds = Math.max(0, (episode.endTimestamp - episode.startTimestamp) / 1000);
    if (episode.severity === 'harsh') {
      harshSpeedingEpisodeCount += 1;
      harshSpeedingSeconds += seconds;
    } else {
      moderateSpeedingEpisodeCount += 1;
      moderateSpeedingSeconds += seconds;
    }
  }

  return {
    incidents,
    speedingEpisodes,

    harshBrakingCount,
    harshAccelerationCount,
    sharpTurnCount,

    moderateSpeedingEpisodeCount,
    harshSpeedingEpisodeCount,
    moderateSpeedingSeconds,
    harshSpeedingSeconds,
  };
};
