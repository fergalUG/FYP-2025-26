import type { DrivingEventFamily, Event, EventSeverity } from '@types';
import { EventType } from '@types';

import type { EfficiencyScoringConfig, IncidentFamily, SpeedingSeverity } from '@utils/scoring/efficiencyScoringConfig';

export interface NormalizedIncident {
  family: IncidentFamily;
  severity: EventSeverity | null;
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
  moderateBrakingCount: number;
  lightBrakingCount: number;

  harshAccelerationCount: number;
  moderateAccelerationCount: number;
  lightAccelerationCount: number;

  sharpTurnCount: number;
  moderateTurnCount: number;
  lightTurnCount: number;

  stopAndGoCount: number;

  lightSpeedingEpisodeCount: number;
  moderateSpeedingEpisodeCount: number;
  harshSpeedingEpisodeCount: number;

  lightSpeedingSeconds: number;
  moderateSpeedingSeconds: number;
  harshSpeedingSeconds: number;
}

interface NormalizedDrivingEvent {
  family: DrivingEventFamily;
  severity: EventSeverity;
}

const severityWeight: Record<EventSeverity, number> = {
  light: 1,
  moderate: 2,
  harsh: 3,
};

const maxSeverity = (a: SpeedingSeverity, b: SpeedingSeverity): SpeedingSeverity => {
  return severityWeight[a] >= severityWeight[b] ? a : b;
};

const isDrivingSeverity = (value: unknown): value is EventSeverity => {
  return value === 'light' || value === 'moderate' || value === 'harsh';
};

const normalizeDrivingEvent = (event: Event): NormalizedDrivingEvent | null => {
  if (event.type === EventType.DrivingEvent) {
    const family = event.family;
    const severity = event.severity;
    if (
      (family === 'braking' || family === 'acceleration' || family === 'cornering' || family === 'speeding') &&
      isDrivingSeverity(severity)
    ) {
      return { family, severity };
    }
  }
  return null;
};

export const normalizeJourneyEvents = (events: Event[], config: EfficiencyScoringConfig): NormalizedJourneyEvents => {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const incidents: NormalizedIncident[] = [];
  const lastIncidentTimestampByFamily = new Map<IncidentFamily, number>();

  const speedingSamples: Array<{ timestamp: number; severity: SpeedingSeverity }> = [];

  for (const event of sorted) {
    if (event.type === EventType.StopAndGo) {
      const family: IncidentFamily = 'stop_and_go';
      const cooldown = config.incidentCooldownMs[family];
      const lastTs = lastIncidentTimestampByFamily.get(family);
      if (typeof lastTs === 'number' && event.timestamp - lastTs < cooldown) {
        continue;
      }
      lastIncidentTimestampByFamily.set(family, event.timestamp);
      incidents.push({ family, severity: null, timestamp: event.timestamp });
      continue;
    }

    const drivingEvent = normalizeDrivingEvent(event);
    if (!drivingEvent) {
      continue;
    }

    if (drivingEvent.family === 'speeding') {
      speedingSamples.push({
        timestamp: event.timestamp,
        severity: drivingEvent.severity,
      });
      continue;
    }

    const family = drivingEvent.family as IncidentFamily;
    const cooldown = config.incidentCooldownMs[family];
    const lastTs = lastIncidentTimestampByFamily.get(family);
    if (typeof lastTs === 'number' && event.timestamp - lastTs < cooldown) {
      continue;
    }

    lastIncidentTimestampByFamily.set(family, event.timestamp);
    incidents.push({
      family,
      severity: drivingEvent.severity,
      timestamp: event.timestamp,
    });
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
  let moderateBrakingCount = 0;
  let lightBrakingCount = 0;

  let harshAccelerationCount = 0;
  let moderateAccelerationCount = 0;
  let lightAccelerationCount = 0;

  let sharpTurnCount = 0;
  let moderateTurnCount = 0;
  let lightTurnCount = 0;

  let stopAndGoCount = 0;

  for (const incident of incidents) {
    if (incident.family === 'stop_and_go') {
      stopAndGoCount += 1;
      continue;
    }

    if (incident.family === 'braking') {
      if (incident.severity === 'harsh') harshBrakingCount += 1;
      if (incident.severity === 'moderate') moderateBrakingCount += 1;
      if (incident.severity === 'light') lightBrakingCount += 1;
    }

    if (incident.family === 'acceleration') {
      if (incident.severity === 'harsh') harshAccelerationCount += 1;
      if (incident.severity === 'moderate') moderateAccelerationCount += 1;
      if (incident.severity === 'light') lightAccelerationCount += 1;
    }

    if (incident.family === 'cornering') {
      if (incident.severity === 'harsh') sharpTurnCount += 1;
      if (incident.severity === 'moderate') moderateTurnCount += 1;
      if (incident.severity === 'light') lightTurnCount += 1;
    }
  }

  let lightSpeedingEpisodeCount = 0;
  let moderateSpeedingEpisodeCount = 0;
  let harshSpeedingEpisodeCount = 0;
  let lightSpeedingSeconds = 0;
  let moderateSpeedingSeconds = 0;
  let harshSpeedingSeconds = 0;

  for (const episode of speedingEpisodes) {
    const seconds = Math.max(0, (episode.endTimestamp - episode.startTimestamp) / 1000);
    if (episode.severity === 'harsh') {
      harshSpeedingEpisodeCount += 1;
      harshSpeedingSeconds += seconds;
    } else if (episode.severity === 'moderate') {
      moderateSpeedingEpisodeCount += 1;
      moderateSpeedingSeconds += seconds;
    } else {
      lightSpeedingEpisodeCount += 1;
      lightSpeedingSeconds += seconds;
    }
  }

  return {
    incidents,
    speedingEpisodes,

    harshBrakingCount,
    moderateBrakingCount,
    lightBrakingCount,

    harshAccelerationCount,
    moderateAccelerationCount,
    lightAccelerationCount,

    sharpTurnCount,
    moderateTurnCount,
    lightTurnCount,

    stopAndGoCount,

    lightSpeedingEpisodeCount,
    moderateSpeedingEpisodeCount,
    harshSpeedingEpisodeCount,

    lightSpeedingSeconds,
    moderateSpeedingSeconds,
    harshSpeedingSeconds,
  };
};
