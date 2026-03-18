import type { Event, HotspotMarker } from '@types';
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
  it('keeps hotspot markers selectable and exposes hotspot details', () => {
    const hotspotMarker: HotspotMarker = {
      id: 'hotspot-1',
      kind: 'hotspot',
      latitude: 53.0002,
      longitude: -6.0002,
      count: 3,
      journeyCount: 2,
      dominantFamily: 'braking',
      familyBreakdown: {
        braking: 2,
        acceleration: 1,
        cornering: 0,
        oscillation: 0,
        stopAndGo: 0,
      },
    };

    const events = [
      makeEvent({ id: 1, timestamp: 0, type: EventType.JourneyStart, latitude: 53.0, longitude: -6.0 }),
      makeEvent({ id: 2, timestamp: 1000, type: EventType.LocationUpdate, latitude: 53.0005, longitude: -6.0005 }),
      makeEvent({ id: 3, timestamp: 2000, type: EventType.JourneyEnd, latitude: 53.001, longitude: -6.001 }),
    ];

    const data = buildJourneyMapData(events, { hotspotMarkers: [hotspotMarker] });
    const selectedPin = findSelectedPinById(data, hotspotMarker.id);
    const details = selectedPin ? buildPinDetails(selectedPin) : null;

    expect(data.hotspotMarkers).toHaveLength(1);
    expect(data.legendFlags.hasHotspots).toBe(true);
    expect(selectedPin).toEqual(hotspotMarker);
    expect(details).toEqual(
      expect.objectContaining({
        title: 'Historical hotspot',
        subtitle: 'Repeated event location near this route',
      })
    );
    expect(details?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Events', value: '3' })]));
  });
});
