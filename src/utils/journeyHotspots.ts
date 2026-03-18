import type { Event, HotspotFamilyBreakdown, HotspotMarker } from '@types';
import { EventType } from '@types';

interface BuildJourneyHotspotMarkersArgs {
  routeEvents: Event[];
  candidateEvents: Event[];
  bucketRadiusMeters?: number;
  routeProximityMeters?: number;
  minimumEventCount?: number;
  excludedJourneyId?: number;
}

interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

interface HotspotBucket {
  id: string;
  eventCount: number;
  latitudeSum: number;
  longitudeSum: number;
  familyBreakdown: HotspotFamilyBreakdown;
  journeyIds: Set<number>;
}

const DEFAULT_BUCKET_RADIUS_METERS = 75;
const DEFAULT_ROUTE_PROXIMITY_METERS = 150;
const DEFAULT_MINIMUM_EVENT_COUNT = 2;
const EARTH_RADIUS_METERS = 6371000;

const EMPTY_FAMILY_BREAKDOWN: HotspotFamilyBreakdown = {
  braking: 0,
  acceleration: 0,
  cornering: 0,
  oscillation: 0,
  stopAndGo: 0,
};

const isValidCoordinate = (latitude: number, longitude: number): boolean => {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
};

const isRouteEvent = (event: Event): boolean => {
  return event.type === EventType.LocationUpdate || event.type === EventType.JourneyStart || event.type === EventType.JourneyEnd;
};

const getHotspotFamily = (event: Event): keyof HotspotFamilyBreakdown | null => {
  if (event.type === EventType.StopAndGo) {
    return 'stopAndGo';
  }

  if (event.type !== EventType.DrivingEvent) {
    return null;
  }

  if (event.family === 'braking' || event.family === 'acceleration' || event.family === 'cornering' || event.family === 'oscillation') {
    return event.family;
  }

  return null;
};

const toBucketKey = (latitude: number, longitude: number, bucketRadiusMeters: number): string => {
  const latRadians = (latitude * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, Math.cos(latRadians) * 111320);
  const latBucket = Math.round((latitude * metersPerDegreeLat) / bucketRadiusMeters);
  const lngBucket = Math.round((longitude * metersPerDegreeLng) / bucketRadiusMeters);
  return `${latBucket}:${lngBucket}`;
};

const haversineDistanceMeters = (a: RouteCoordinate, b: RouteCoordinate): number => {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLng = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const isNearRoute = (coordinate: RouteCoordinate, routeCoordinates: RouteCoordinate[], routeProximityMeters: number): boolean => {
  return routeCoordinates.some((routeCoordinate) => haversineDistanceMeters(coordinate, routeCoordinate) <= routeProximityMeters);
};

const getDominantFamily = (familyBreakdown: HotspotFamilyBreakdown): keyof HotspotFamilyBreakdown | null => {
  const entries = Object.entries(familyBreakdown) as Array<[keyof HotspotFamilyBreakdown, number]>;
  const nonZeroEntries = entries.filter(([, count]) => count > 0);

  if (nonZeroEntries.length === 0) {
    return null;
  }

  nonZeroEntries.sort((a, b) => b[1] - a[1]);
  return nonZeroEntries[0]?.[0] ?? null;
};

export const buildJourneyHotspotMarkers = (args: BuildJourneyHotspotMarkersArgs): HotspotMarker[] => {
  const {
    routeEvents,
    candidateEvents,
    bucketRadiusMeters = DEFAULT_BUCKET_RADIUS_METERS,
    routeProximityMeters = DEFAULT_ROUTE_PROXIMITY_METERS,
    minimumEventCount = DEFAULT_MINIMUM_EVENT_COUNT,
    excludedJourneyId,
  } = args;

  const routeCoordinates = routeEvents
    .filter((event) => isRouteEvent(event) && isValidCoordinate(event.latitude, event.longitude))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => ({
      latitude: event.latitude,
      longitude: event.longitude,
    }));

  if (routeCoordinates.length === 0) {
    return [];
  }

  const buckets = new Map<string, HotspotBucket>();

  for (const event of candidateEvents) {
    if (!isValidCoordinate(event.latitude, event.longitude)) {
      continue;
    }

    if (typeof excludedJourneyId === 'number' && event.journeyId === excludedJourneyId) {
      continue;
    }

    const family = getHotspotFamily(event);
    if (!family) {
      continue;
    }

    const coordinate = { latitude: event.latitude, longitude: event.longitude };
    if (!isNearRoute(coordinate, routeCoordinates, routeProximityMeters)) {
      continue;
    }

    const bucketId = toBucketKey(event.latitude, event.longitude, bucketRadiusMeters);
    const bucket = buckets.get(bucketId) ?? {
      id: bucketId,
      eventCount: 0,
      latitudeSum: 0,
      longitudeSum: 0,
      familyBreakdown: { ...EMPTY_FAMILY_BREAKDOWN },
      journeyIds: new Set<number>(),
    };

    bucket.eventCount += 1;
    bucket.latitudeSum += event.latitude;
    bucket.longitudeSum += event.longitude;
    bucket.familyBreakdown[family] += 1;
    bucket.journeyIds.add(event.journeyId);
    buckets.set(bucketId, bucket);
  }

  return Array.from(buckets.values())
    .filter((bucket) => bucket.eventCount >= minimumEventCount)
    .map((bucket) => ({
      id: `hotspot-${bucket.id}`,
      kind: 'hotspot' as const,
      latitude: bucket.latitudeSum / bucket.eventCount,
      longitude: bucket.longitudeSum / bucket.eventCount,
      count: bucket.eventCount,
      journeyCount: bucket.journeyIds.size,
      dominantFamily: getDominantFamily(bucket.familyBreakdown),
      familyBreakdown: bucket.familyBreakdown,
    }))
    .sort((a, b) => b.count - a.count);
};
