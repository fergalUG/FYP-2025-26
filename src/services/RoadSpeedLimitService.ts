import type { RoadSpeedLimitServiceController, RoadSpeedLimitServiceDeps, RoadSpeedLimitLookupArgs, RoadSpeedLimitValue } from '@/types';
import { createLogger, LogModule } from '@utils/logger';
import { calculateDistanceKm } from '@utils/gpsValidation';

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_QUERY_RADIUS_METERS = 60;
const CACHE_CELL_PRECISION = 3;
const HIT_CACHE_TTL_MS = 10 * 60 * 1000;
const MISS_CACHE_TTL_MS = 2 * 60 * 1000;
const NEARBY_REUSE_DISTANCE_METERS = 120;
const OVERPASS_TIMEOUT_MS = 2000;

interface OverpassElement {
  id?: number;
  tags?: {
    maxspeed?: string;
  };
  center?: {
    lat?: number;
    lon?: number;
  };
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface CacheHit {
  kind: 'hit';
  value: Omit<RoadSpeedLimitValue, 'fromCache'>;
  latitude: number;
  longitude: number;
  expiresAtMs: number;
}

interface CacheMiss {
  kind: 'miss';
  latitude: number;
  longitude: number;
  expiresAtMs: number;
}

type CacheEntry = CacheHit | CacheMiss;

const isFiniteCoordinate = (value: number): boolean => Number.isFinite(value);

const buildCellKey = (latitude: number, longitude: number): string => {
  return `${latitude.toFixed(CACHE_CELL_PRECISION)},${longitude.toFixed(CACHE_CELL_PRECISION)}`;
};

const calculateDistanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  return calculateDistanceKm(aLat, aLng, bLat, bLng) * 1000;
};

const parseMaxspeedKmh = (rawValue: string): number | null => {
  const value = rawValue.trim().toLowerCase();
  if (!value) {
    return null;
  }

  const firstSegment = value.split(';')[0]?.trim() ?? value;
  const numericMatch = firstSegment.match(/(\d+(?:\.\d+)?)/);
  if (!numericMatch) {
    return null;
  }

  const parsed = Number.parseFloat(numericMatch[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  if (firstSegment.includes('mph')) {
    return Number((parsed * 1.60934).toFixed(1));
  }

  return Number(parsed.toFixed(1));
};

const createOverpassQuery = (latitude: number, longitude: number): string => {
  return `[out:json][timeout:8];
way(around:${DEFAULT_QUERY_RADIUS_METERS},${latitude.toFixed(6)},${longitude.toFixed(6)})["highway"]["maxspeed"];
out tags center 20;`;
};

export const createRoadSpeedLimitServiceController = (deps: RoadSpeedLimitServiceDeps): RoadSpeedLimitServiceController => {
  const overpassUrl = deps.overpassUrl ?? DEFAULT_OVERPASS_URL;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<RoadSpeedLimitValue | null>>();

  const resolveNearbyCacheEntry = (latitude: number, longitude: number, nowMs: number): CacheEntry | null => {
    let bestEntry: CacheEntry | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entry of cache.values()) {
      if (entry.expiresAtMs <= nowMs) {
        continue;
      }
      const distanceMeters = calculateDistanceMeters(latitude, longitude, entry.latitude, entry.longitude);
      if (distanceMeters <= NEARBY_REUSE_DISTANCE_METERS && distanceMeters < bestDistance) {
        bestDistance = distanceMeters;
        bestEntry = entry;
      }
    }

    return bestEntry;
  };

  const resolveSpeedLimitFromResponse = (
    payload: OverpassResponse,
    latitude: number,
    longitude: number
  ): Omit<RoadSpeedLimitValue, 'fromCache'> | null => {
    const elements = payload.elements ?? [];
    let best: {
      value: Omit<RoadSpeedLimitValue, 'fromCache'>;
      distanceMeters: number;
    } | null = null;

    for (const element of elements) {
      const rawMaxspeed = element.tags?.maxspeed;
      if (!rawMaxspeed) {
        continue;
      }

      const parsedLimit = parseMaxspeedKmh(rawMaxspeed);
      if (parsedLimit === null) {
        continue;
      }

      const centerLat = element.center?.lat;
      const centerLon = element.center?.lon;
      if (!isFiniteCoordinate(centerLat ?? NaN) || !isFiniteCoordinate(centerLon ?? NaN)) {
        continue;
      }

      const distanceMeters = calculateDistanceMeters(latitude, longitude, centerLat as number, centerLon as number);
      if (!best || distanceMeters < best.distanceMeters) {
        best = {
          distanceMeters,
          value: {
            speedLimitKmh: parsedLimit,
            source: 'overpass',
            wayId: element.id,
            rawMaxspeed,
          },
        };
      }
    }

    return best?.value ?? null;
  };

  const fetchSpeedLimit = async (args: RoadSpeedLimitLookupArgs): Promise<RoadSpeedLimitValue | null> => {
    const query = createOverpassQuery(args.latitude, args.longitude);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      controller?.abort();
    }, OVERPASS_TIMEOUT_MS);

    try {
      const response = await deps.fetchFn(overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller?.signal,
      });

      if (!response.ok) {
        deps.logger.warn('Overpass request failed', { status: response.status });
        return null;
      }

      const payload = (await response.json()) as OverpassResponse;
      const resolved = resolveSpeedLimitFromResponse(payload, args.latitude, args.longitude);
      if (!resolved) {
        return null;
      }

      return {
        ...resolved,
        fromCache: false,
      };
    } catch (error) {
      deps.logger.warn('Road speed limit lookup failed', error);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const getSpeedLimit = async (args: RoadSpeedLimitLookupArgs): Promise<RoadSpeedLimitValue | null> => {
    const nowMs = args.nowMs ?? deps.now();
    if (!isFiniteCoordinate(args.latitude) || !isFiniteCoordinate(args.longitude)) {
      return null;
    }

    const key = buildCellKey(args.latitude, args.longitude);
    const cached = cache.get(key);
    if (cached && cached.expiresAtMs > nowMs) {
      if (cached.kind === 'miss') {
        return null;
      }

      return {
        ...cached.value,
        fromCache: true,
      };
    }

    const nearby = resolveNearbyCacheEntry(args.latitude, args.longitude, nowMs);
    if (nearby) {
      if (nearby.kind === 'miss') {
        cache.set(key, {
          kind: 'miss',
          latitude: args.latitude,
          longitude: args.longitude,
          expiresAtMs: nearby.expiresAtMs,
        });
        return null;
      }

      cache.set(key, {
        kind: 'hit',
        latitude: args.latitude,
        longitude: args.longitude,
        expiresAtMs: nearby.expiresAtMs,
        value: nearby.value,
      });
      return {
        ...nearby.value,
        fromCache: true,
      };
    }

    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      const resolved = await fetchSpeedLimit(args);
      if (resolved) {
        cache.set(key, {
          kind: 'hit',
          latitude: args.latitude,
          longitude: args.longitude,
          expiresAtMs: nowMs + HIT_CACHE_TTL_MS,
          value: {
            speedLimitKmh: resolved.speedLimitKmh,
            source: resolved.source,
            wayId: resolved.wayId,
            rawMaxspeed: resolved.rawMaxspeed,
          },
        });
        return resolved;
      }

      cache.set(key, {
        kind: 'miss',
        latitude: args.latitude,
        longitude: args.longitude,
        expiresAtMs: nowMs + MISS_CACHE_TTL_MS,
      });
      return null;
    })();

    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      inFlight.delete(key);
    }
  };

  const reset = () => {
    cache.clear();
    inFlight.clear();
  };

  return {
    getSpeedLimit,
    reset,
  };
};

const logger = createLogger(LogModule.RoadSpeedLimitService);

export const RoadSpeedLimitService = createRoadSpeedLimitServiceController({
  fetchFn: fetch,
  now: () => Date.now(),
  logger,
});
