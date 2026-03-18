import type { Event } from '@types';
import { EventType } from '@types';

import { buildJourneyMapData, buildPinDetails, findSelectedPinById } from '@components/journey/map/model';

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

describe('journey map model', () => {
  it('keeps journey map selection focused on route incidents and episode markers', () => {
    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart, latitude: 53.0, longitude: -6.0 }),
      makeEvent({
        id: 2,
        timestamp: 1000,
        type: EventType.DrivingEvent,
        family: 'braking',
        severity: 'moderate',
        latitude: 53.0002,
        longitude: -6.0002,
      }),
      makeEvent({ id: 3, timestamp: 2000, type: EventType.LocationUpdate, latitude: 53.0005, longitude: -6.0005 }),
      makeEvent({ id: 4, timestamp: 3000, type: EventType.JourneyEnd, latitude: 53.001, longitude: -6.001 }),
    ];

    const data = buildJourneyMapData(events);
    const selectedPin = findSelectedPinById(data, 'incident-2');
    const details = selectedPin ? buildPinDetails(selectedPin) : null;

    expect(data.incidentMarkers).toHaveLength(1);
    expect(data.legendFlags.hasBraking).toBe(true);
    expect(selectedPin).toEqual(expect.objectContaining({ id: 'incident-2', kind: 'incident' }));
    expect(details).toEqual(
      expect.objectContaining({
        title: 'Moderate Braking',
        subtitle: 'Moderate incident',
      })
    );
  });
});
