import type { Event } from '@types';
import { EventType } from '@types';

import { buildJourneyHotspotMarkers } from '@utils/journeyHotspots';

const makeEvent = (partial: Partial<Event> & Pick<Event, 'id' | 'timestamp' | 'type'>): Event => ({
  id: partial.id,
  journeyId: partial.journeyId ?? 1,
  timestamp: partial.timestamp,
  type: partial.type,
  latitude: partial.latitude ?? 53,
  longitude: partial.longitude ?? -6,
  speed: partial.speed ?? 0,
  family: partial.family ?? null,
  severity: partial.severity ?? null,
  metadata: partial.metadata ?? null,
});

describe('buildJourneyHotspotMarkers', () => {
  it('aggregates repeated non-speeding point events near the current route', () => {
    const routeEvents = [
      makeEvent({ id: 1, journeyId: 10, timestamp: 0, type: EventType.JourneyStart, latitude: 53.0, longitude: -6.0 }),
      makeEvent({ id: 2, journeyId: 10, timestamp: 1000, type: EventType.LocationUpdate, latitude: 53.0004, longitude: -6.0004 }),
      makeEvent({ id: 3, journeyId: 10, timestamp: 2000, type: EventType.JourneyEnd, latitude: 53.0008, longitude: -6.0008 }),
    ];

    const candidateEvents = [
      makeEvent({
        id: 11,
        journeyId: 20,
        timestamp: 3000,
        type: EventType.DrivingEvent,
        family: 'braking',
        severity: 'moderate',
        latitude: 53.00041,
        longitude: -6.00039,
      }),
      makeEvent({
        id: 12,
        journeyId: 21,
        timestamp: 4000,
        type: EventType.DrivingEvent,
        family: 'braking',
        severity: 'harsh',
        latitude: 53.00043,
        longitude: -6.00037,
      }),
      makeEvent({
        id: 13,
        journeyId: 22,
        timestamp: 5000,
        type: EventType.DrivingEvent,
        family: 'speeding',
        severity: 'moderate',
        latitude: 53.00042,
        longitude: -6.00038,
      }),
      makeEvent({
        id: 14,
        journeyId: 23,
        timestamp: 6000,
        type: EventType.StopAndGo,
        latitude: 53.01,
        longitude: -6.01,
      }),
      makeEvent({
        id: 15,
        journeyId: 10,
        timestamp: 7000,
        type: EventType.DrivingEvent,
        family: 'cornering',
        severity: 'light',
        latitude: 53.00042,
        longitude: -6.00038,
      }),
    ];

    const hotspots = buildJourneyHotspotMarkers({
      routeEvents,
      candidateEvents,
      excludedJourneyId: 10,
    });

    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]).toEqual(
      expect.objectContaining({
        count: 2,
        journeyCount: 2,
        dominantFamily: 'braking',
      })
    );
    expect(hotspots[0]?.familyBreakdown.braking).toBe(2);
    expect(hotspots[0]?.familyBreakdown.stopAndGo).toBe(0);
  });

  it('requires at least two events in the same bucket before creating a hotspot', () => {
    const routeEvents = [
      makeEvent({ id: 1, journeyId: 30, timestamp: 0, type: EventType.JourneyStart }),
      makeEvent({ id: 2, journeyId: 30, timestamp: 1000, type: EventType.JourneyEnd, latitude: 53.0001, longitude: -6.0001 }),
    ];
    const candidateEvents = [
      makeEvent({
        id: 3,
        journeyId: 31,
        timestamp: 2000,
        type: EventType.DrivingEvent,
        family: 'oscillation',
        severity: 'light',
        latitude: 53.00011,
        longitude: -6.00011,
      }),
    ];

    const hotspots = buildJourneyHotspotMarkers({ routeEvents, candidateEvents });

    expect(hotspots).toEqual([]);
  });
});
