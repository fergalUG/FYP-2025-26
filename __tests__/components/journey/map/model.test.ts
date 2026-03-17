import { buildPinDetails } from '@components/journey/map/model';
import type { IncidentMarker, OscillationEpisodeMarker, SpeedingEpisodeMarker } from '@components/journey/map/types';
import { EventType, type Event } from '@types';

const buildRowLabels = (labels: string[]) => expect.arrayContaining(labels);

describe('buildPinDetails', () => {
  it('hides speeding debug metadata unless enabled', () => {
    const marker: SpeedingEpisodeMarker = {
      id: 'speeding-1',
      kind: 'speeding_episode',
      severity: 'moderate',
      latitude: 53.3498,
      longitude: -6.2603,
      startTimestamp: 1_000,
      endTimestamp: 9_000,
      representativeSpeedKmh: 78.4,
      representativeSpeedLimitKmh: 50,
      peakOverLimitKmh: 28.4,
      minSpeedLimitKmh: 50,
      maxSpeedLimitKmh: 60,
      speedLimitSourceLabel: 'Offline OSM',
      speedLimitFromCacheLabel: 'Yes',
      speedLimitWayIdLabel: '12345',
      speedLimitRawLabel: '50 mph',
      sampleCount: 14,
    };

    const defaultDetails = buildPinDetails(marker);
    const debugDetails = buildPinDetails(marker, { showDebugMetadata: true });

    expect(defaultDetails.rows.map((row) => row.label)).toEqual(
      expect.not.arrayContaining(['Limit source', 'From cache', 'Way ID', 'Raw maxspeed'])
    );
    expect(defaultDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Peak speed', 'Limit at peak', 'Samples']));

    expect(debugDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Limit source', 'From cache', 'Way ID', 'Raw maxspeed']));
  });

  it('hides oscillation debug metadata unless enabled', () => {
    const event: Event = {
      id: 1,
      journeyId: 99,
      timestamp: 15_000,
      type: EventType.DrivingEvent,
      latitude: 53.3498,
      longitude: -6.2603,
      speed: 13.5,
      family: 'oscillation',
      severity: 'light',
      metadata: {
        episodeDurationMs: 10_000,
        speedStdDevKmh: 7.3,
        signFlipCount: 5,
        forceP90G: 0.245,
        forceMeanG: 0.122,
      },
    };
    const marker: OscillationEpisodeMarker = {
      id: 'oscillation-1',
      kind: 'oscillation_episode',
      event,
      severity: 'light',
      latitude: 53.3498,
      longitude: -6.2603,
      startTimestamp: 10_000,
      endTimestamp: 20_000,
    };

    const defaultDetails = buildPinDetails(marker);
    const debugDetails = buildPinDetails(marker, { showDebugMetadata: true });

    expect(defaultDetails.rows.map((row) => row.label)).toEqual(expect.not.arrayContaining(['Sign flips', 'Force p90', 'Force mean']));
    expect(defaultDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Speed std dev']));

    expect(debugDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Sign flips', 'Force p90', 'Force mean']));
  });

  it('hides stop-and-go debug metadata unless enabled', () => {
    const event: Event = {
      id: 2,
      journeyId: 99,
      timestamp: 25_000,
      type: EventType.StopAndGo,
      latitude: 53.3498,
      longitude: -6.2603,
      speed: 4.2,
      severity: null,
      metadata: {
        cycleCount: 3,
        detectionWindowMs: 12_000,
        stopSpeedThresholdKmh: 5,
        goSpeedThresholdKmh: 12,
      },
    };
    const marker: IncidentMarker = {
      id: 'stopgo-1',
      kind: 'incident',
      event,
      family: null,
      severity: null,
      latitude: 53.3498,
      longitude: -6.2603,
    };

    const defaultDetails = buildPinDetails(marker);
    const debugDetails = buildPinDetails(marker, { showDebugMetadata: true });

    expect(defaultDetails.rows.map((row) => row.label)).toEqual(
      expect.not.arrayContaining(['Cycle count', 'Window', 'Stop threshold', 'Go threshold'])
    );
    expect(defaultDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Time', 'Speed']));

    expect(debugDetails.rows.map((row) => row.label)).toEqual(buildRowLabels(['Cycle count', 'Window', 'Stop threshold', 'Go threshold']));
  });
});
