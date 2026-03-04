import type { createLogger } from '@utils/logger';

export interface RoadSpeedLimitLookupArgs {
  latitude: number;
  longitude: number;
  nowMs?: number;
}

export interface RoadSpeedLimitValue {
  speedLimitKmh: number;
  source: 'overpass';
  wayId?: number;
  rawMaxspeed?: string;
  fromCache: boolean;
}

export interface RoadSpeedLimitServiceController {
  getSpeedLimit: (args: RoadSpeedLimitLookupArgs) => Promise<RoadSpeedLimitValue | null>;
  reset: () => void;
}

export interface RoadSpeedLimitCacheStoreEntry {
  key: string;
  kind: 'hit' | 'miss';
  latitude: number;
  longitude: number;
  speedLimitKmh: number | null;
  source: 'overpass' | null;
  wayId: number | null;
  rawMaxspeed: string | null;
  expiresAtMs: number;
  updatedAtMs: number;
}

export interface RoadSpeedLimitCacheStore {
  getByKey: (key: string) => Promise<RoadSpeedLimitCacheStoreEntry | null>;
  upsert: (entry: RoadSpeedLimitCacheStoreEntry) => Promise<void>;
  deleteByKey: (key: string) => Promise<void>;
  deleteExpired: (nowMs: number) => Promise<void>;
}

export interface RoadSpeedLimitServiceDeps {
  fetchFn: typeof fetch;
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  overpassUrl?: string;
  cacheStore?: RoadSpeedLimitCacheStore;
  ensureCacheStoreReady?: () => Promise<void>;
}
