import { db, ensureRoadSpeedLimitCacheTable } from '@db/client';
import { roadSpeedLimitCache } from '@db/schema';
import { calculateDistanceKm } from '@utils/gpsValidation';
import { createLogger, LogModule } from '@utils/logger';
import { eq, lte } from 'drizzle-orm';

import type {
  RoadSpeedLimitCacheStore,
  RoadSpeedLimitCacheStoreEntry,
  RoadSpeedLimitLookupArgs,
  RoadSpeedLimitServiceController,
  RoadSpeedLimitServiceDeps,
  RoadSpeedLimitValue,
} from '@/types';

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_QUERY_RADIUS_METERS = 60;
const CACHE_CELL_PRECISION = 3;
const MEMORY_HIT_CACHE_TTL_MS = 10 * 60 * 1000;
const MEMORY_MISS_CACHE_TTL_MS = 2 * 60 * 1000;
const PERSISTED_HIT_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const PERSISTED_MISS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PERSISTED_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
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

const toPersistentEntry = (key: string, entry: CacheEntry, nowMs: number): RoadSpeedLimitCacheStoreEntry => {
  if (entry.kind === 'miss') {
    return {
      key,
      kind: 'miss',
      latitude: entry.latitude,
      longitude: entry.longitude,
      speedLimitKmh: null,
      source: null,
      wayId: null,
      rawMaxspeed: null,
      expiresAtMs: nowMs + PERSISTED_MISS_CACHE_TTL_MS,
      updatedAtMs: nowMs,
    };
  }

  return {
    key,
    kind: 'hit',
    latitude: entry.latitude,
    longitude: entry.longitude,
    speedLimitKmh: entry.value.speedLimitKmh,
    source: entry.value.source,
    wayId: typeof entry.value.wayId === 'number' ? entry.value.wayId : null,
    rawMaxspeed: entry.value.rawMaxspeed ?? null,
    expiresAtMs: nowMs + PERSISTED_HIT_CACHE_TTL_MS,
    updatedAtMs: nowMs,
  };
};

const fromPersistentEntry = (entry: RoadSpeedLimitCacheStoreEntry): CacheEntry | null => {
  if (entry.kind === 'miss') {
    return {
      kind: 'miss',
      latitude: entry.latitude,
      longitude: entry.longitude,
      expiresAtMs: entry.expiresAtMs,
    };
  }

  if (entry.speedLimitKmh === null || entry.source === null) {
    return null;
  }

  return {
    kind: 'hit',
    latitude: entry.latitude,
    longitude: entry.longitude,
    expiresAtMs: entry.expiresAtMs,
    value: {
      speedLimitKmh: entry.speedLimitKmh,
      source: entry.source,
      ...(typeof entry.wayId === 'number' ? { wayId: entry.wayId } : {}),
      ...(entry.rawMaxspeed ? { rawMaxspeed: entry.rawMaxspeed } : {}),
    },
  };
};

const createRoadSpeedLimitDbCacheStore = (): RoadSpeedLimitCacheStore => {
  return {
    getByKey: async (key: string) => {
      const result = await db.select().from(roadSpeedLimitCache).where(eq(roadSpeedLimitCache.key, key)).limit(1);
      return result[0] ?? null;
    },
    upsert: async (entry: RoadSpeedLimitCacheStoreEntry) => {
      await db
        .insert(roadSpeedLimitCache)
        .values(entry)
        .onConflictDoUpdate({
          target: roadSpeedLimitCache.key,
          set: {
            kind: entry.kind,
            latitude: entry.latitude,
            longitude: entry.longitude,
            speedLimitKmh: entry.speedLimitKmh,
            source: entry.source,
            wayId: entry.wayId,
            rawMaxspeed: entry.rawMaxspeed,
            expiresAtMs: entry.expiresAtMs,
            updatedAtMs: entry.updatedAtMs,
          },
        });
    },
    deleteByKey: async (key: string) => {
      await db.delete(roadSpeedLimitCache).where(eq(roadSpeedLimitCache.key, key));
    },
    deleteExpired: async (nowMs: number) => {
      await db.delete(roadSpeedLimitCache).where(lte(roadSpeedLimitCache.expiresAtMs, nowMs));
    },
  };
};

export const createRoadSpeedLimitServiceController = (deps: RoadSpeedLimitServiceDeps): RoadSpeedLimitServiceController => {
  const overpassUrl = deps.overpassUrl ?? DEFAULT_OVERPASS_URL;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<RoadSpeedLimitValue | null>>();
  let cacheStoreReady = deps.cacheStore ? false : true;
  let cacheStoreFailed = false;
  let lastPersistentPruneAtMs = 0;

  const ensureCacheStoreReady = async (): Promise<boolean> => {
    if (!deps.cacheStore) {
      return false;
    }
    if (cacheStoreReady) {
      return true;
    }
    if (cacheStoreFailed) {
      return false;
    }

    try {
      if (deps.ensureCacheStoreReady) {
        await deps.ensureCacheStoreReady();
      }
      cacheStoreReady = true;
      return true;
    } catch (error) {
      deps.logger.warn('Road speed limit cache store initialization failed', error);
      cacheStoreFailed = true;
      return false;
    }
  };

  const persistCacheEntry = async (key: string, entry: CacheEntry, nowMs: number): Promise<void> => {
    if (!deps.cacheStore) {
      return;
    }
    const ready = await ensureCacheStoreReady();
    if (!ready) {
      return;
    }

    try {
      await deps.cacheStore.upsert(toPersistentEntry(key, entry, nowMs));
    } catch (error) {
      deps.logger.warn('Failed to persist road speed limit cache entry', error);
    }
  };

  const maybePrunePersistentCache = async (nowMs: number): Promise<void> => {
    if (!deps.cacheStore || nowMs - lastPersistentPruneAtMs < PERSISTED_PRUNE_INTERVAL_MS) {
      return;
    }

    const ready = await ensureCacheStoreReady();
    if (!ready) {
      return;
    }

    lastPersistentPruneAtMs = nowMs;
    try {
      await deps.cacheStore.deleteExpired(nowMs);
    } catch (error) {
      deps.logger.warn('Failed to prune expired road speed limit cache entries', error);
    }
  };

  const readPersistedEntry = async (key: string, nowMs: number): Promise<CacheEntry | null> => {
    if (!deps.cacheStore) {
      return null;
    }

    const ready = await ensureCacheStoreReady();
    if (!ready) {
      return null;
    }

    try {
      const persisted = await deps.cacheStore.getByKey(key);
      if (!persisted) {
        return null;
      }
      if (persisted.expiresAtMs <= nowMs) {
        await deps.cacheStore.deleteByKey(key);
        return null;
      }

      return fromPersistentEntry(persisted);
    } catch (error) {
      deps.logger.warn('Failed reading persisted road speed limit cache entry', error);
      return null;
    }
  };

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

    await maybePrunePersistentCache(nowMs);

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

    const persisted = await readPersistedEntry(key, nowMs);
    if (persisted) {
      cache.set(key, persisted);
      if (persisted.kind === 'miss') {
        return null;
      }

      return {
        ...persisted.value,
        fromCache: true,
      };
    }

    const nearby = resolveNearbyCacheEntry(args.latitude, args.longitude, nowMs);
    if (nearby) {
      if (nearby.kind === 'miss') {
        const missEntry: CacheMiss = {
          kind: 'miss',
          latitude: args.latitude,
          longitude: args.longitude,
          expiresAtMs: nowMs + MEMORY_MISS_CACHE_TTL_MS,
        };
        cache.set(key, missEntry);
        await persistCacheEntry(key, missEntry, nowMs);
        return null;
      }

      const hitEntry: CacheHit = {
        kind: 'hit',
        latitude: args.latitude,
        longitude: args.longitude,
        expiresAtMs: nowMs + MEMORY_HIT_CACHE_TTL_MS,
        value: nearby.value,
      };
      cache.set(key, hitEntry);
      await persistCacheEntry(key, hitEntry, nowMs);
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
        const hitEntry: CacheHit = {
          kind: 'hit',
          latitude: args.latitude,
          longitude: args.longitude,
          expiresAtMs: nowMs + MEMORY_HIT_CACHE_TTL_MS,
          value: {
            speedLimitKmh: resolved.speedLimitKmh,
            source: resolved.source,
            wayId: resolved.wayId,
            rawMaxspeed: resolved.rawMaxspeed,
          },
        };
        cache.set(key, hitEntry);
        await persistCacheEntry(key, hitEntry, nowMs);
        return resolved;
      }

      const missEntry: CacheMiss = {
        kind: 'miss',
        latitude: args.latitude,
        longitude: args.longitude,
        expiresAtMs: nowMs + MEMORY_MISS_CACHE_TTL_MS,
      };
      cache.set(key, missEntry);
      await persistCacheEntry(key, missEntry, nowMs);
      return null;
    })();

    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      inFlight.delete(key);
    }
  };

  const reset = (): void => {
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
  cacheStore: createRoadSpeedLimitDbCacheStore(),
  ensureCacheStoreReady: ensureRoadSpeedLimitCacheTable,
});
