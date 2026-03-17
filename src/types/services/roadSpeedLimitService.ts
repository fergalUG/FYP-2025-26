import type { createLogger } from '@utils/logger';
import type { OfflineSpeedLimitPackSnapshot } from '@/types/services/speedLimitPackService';

export interface RoadSpeedLimitLookupArgs {
  latitude: number;
  longitude: number;
  nowMs?: number;
}

export interface RoadSpeedLimitValue {
  speedLimitKmh: number;
  source: 'offline_osm';
  wayId?: number;
  rawMaxspeed?: string;
  fromCache: boolean;
}

export interface RoadSpeedLimitServiceController {
  getSpeedLimit: (args: RoadSpeedLimitLookupArgs) => Promise<RoadSpeedLimitValue | null>;
  setPackSnapshot: (snapshot: OfflineSpeedLimitPackSnapshot | null) => void;
  reset: () => void;
}

export interface RoadSpeedLimitServiceDeps {
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  openDatabaseSync?: (databaseName: string, options?: object, directory?: string) => {
    getAllSync: <T>(source: string, ...params: Array<string | number>) => T[];
    closeSync?: () => void;
  };
}
