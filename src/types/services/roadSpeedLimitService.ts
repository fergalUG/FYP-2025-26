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

export interface RoadSpeedLimitServiceDeps {
  fetchFn: typeof fetch;
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  overpassUrl?: string;
}
