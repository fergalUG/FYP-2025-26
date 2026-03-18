import * as SQLite from 'expo-sqlite';

import { createLogger, LogModule } from '@utils/logger';
import { roundTo } from '@utils/number';

import type {
  RoadSpeedLimitLookupArgs,
  RoadSpeedLimitServiceController,
  RoadSpeedLimitServiceDeps,
  RoadSpeedLimitValue,
  SpeedLimitPackRef,
} from '@/types';

const CELL_SIZE_DEGREES = 0.002;
const MATCH_DISTANCE_THRESHOLD_METERS = 40;
const AMBIGUOUS_DISTANCE_DELTA_METERS = 8;
const MAX_CELL_CACHE_SIZE = 250;

interface SegmentRow {
  id: number;
  wayId: number;
  speedLimitKmh: number;
  rawSpeedTag: string | null;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}

interface CandidateCacheEntry {
  rows: SegmentRow[];
}

interface Point {
  x: number;
  y: number;
}

const logger = createLogger(LogModule.RoadSpeedLimitService);

const toCellIndex = (coordinate: number): number => Math.floor(coordinate / CELL_SIZE_DEGREES);

const buildCellKey = (latitude: number, longitude: number): string => `${toCellIndex(latitude)}:${toCellIndex(longitude)}`;

const buildNeighborCellKeys = (latitude: number, longitude: number): string[] => {
  const latIndex = toCellIndex(latitude);
  const lonIndex = toCellIndex(longitude);
  const keys: string[] = [];

  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lonOffset = -1; lonOffset <= 1; lonOffset += 1) {
      keys.push(`${latIndex + latOffset}:${lonIndex + lonOffset}`);
    }
  }

  return keys;
};

const toProjectedPoint = (latitude: number, longitude: number, referenceLatitude: number): Point => {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.cos((referenceLatitude * Math.PI) / 180) * 111_320;

  return {
    x: longitude * metersPerDegreeLon,
    y: latitude * metersPerDegreeLat,
  };
};

const distancePointToSegmentMeters = (
  latitude: number,
  longitude: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): number => {
  const referenceLatitude = (latitude + startLat + endLat) / 3;
  const point = toProjectedPoint(latitude, longitude, referenceLatitude);
  const start = toProjectedPoint(startLat, startLon, referenceLatitude);
  const end = toProjectedPoint(endLat, endLon, referenceLatitude);

  const segmentDx = end.x - start.x;
  const segmentDy = end.y - start.y;
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;

  if (segmentLengthSquared <= 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * segmentDx + (point.y - start.y) * segmentDy) / segmentLengthSquared));
  const projectionX = start.x + t * segmentDx;
  const projectionY = start.y + t * segmentDy;

  return Math.hypot(point.x - projectionX, point.y - projectionY);
};

const parsePackPath = (filePath: string): { databaseName: string; directory: string } | null => {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0 || lastSlash === filePath.length - 1) {
    return null;
  }

  return {
    databaseName: filePath.slice(lastSlash + 1),
    directory: filePath.slice(0, lastSlash),
  };
};

const trimCellCache = (cache: Map<string, CandidateCacheEntry>): void => {
  while (cache.size > MAX_CELL_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    cache.delete(oldestKey);
  }
};

export const createRoadSpeedLimitServiceController = (deps: RoadSpeedLimitServiceDeps): RoadSpeedLimitServiceController => {
  const openDatabaseSync = deps.openDatabaseSync ?? SQLite.openDatabaseSync;

  let activePackSnapshot: SpeedLimitPackRef | null = null;
  let activeDatabase: ReturnType<NonNullable<RoadSpeedLimitServiceDeps['openDatabaseSync']>> | null = null;
  let activeDatabaseKey: string | null = null;
  const cellCache = new Map<string, CandidateCacheEntry>();

  const clearDatabase = (): void => {
    try {
      activeDatabase?.closeSync?.();
    } catch (error) {
      deps.logger.warn('Failed to close offline speed limit pack database', error);
    } finally {
      activeDatabase = null;
      activeDatabaseKey = null;
    }
  };

  const reset = (): void => {
    cellCache.clear();
    clearDatabase();
  };

  const setPackSnapshot = (snapshot: SpeedLimitPackRef | null): void => {
    const previousKey = activePackSnapshot ? `${activePackSnapshot.filePath}:${activePackSnapshot.md5}` : null;
    const nextKey = snapshot ? `${snapshot.filePath}:${snapshot.md5}` : null;

    activePackSnapshot = snapshot;
    if (previousKey !== nextKey) {
      reset();
      activePackSnapshot = snapshot;
    }
  };

  const ensureDatabase = (): ReturnType<NonNullable<RoadSpeedLimitServiceDeps['openDatabaseSync']>> | null => {
    if (!activePackSnapshot) {
      return null;
    }

    const databaseKey = `${activePackSnapshot.filePath}:${activePackSnapshot.md5}`;
    if (activeDatabase && activeDatabaseKey === databaseKey) {
      return activeDatabase;
    }

    const parsedPath = parsePackPath(activePackSnapshot.filePath);
    if (!parsedPath) {
      deps.logger.warn('Invalid offline speed limit pack path', { filePath: activePackSnapshot.filePath });
      return null;
    }

    try {
      clearDatabase();
      activeDatabase = openDatabaseSync(parsedPath.databaseName, undefined, parsedPath.directory);
      activeDatabaseKey = databaseKey;
      return activeDatabase;
    } catch (error) {
      deps.logger.warn('Failed to open offline speed limit pack database', error);
      activeDatabase = null;
      activeDatabaseKey = null;
      return null;
    }
  };

  const loadCandidateRows = (
    database: NonNullable<typeof activeDatabase>,
    latitude: number,
    longitude: number
  ): { rows: SegmentRow[]; fromCache: boolean } => {
    const cellKey = buildCellKey(latitude, longitude);
    const cached = cellCache.get(cellKey);
    if (cached) {
      return {
        rows: cached.rows,
        fromCache: true,
      };
    }

    const neighborKeys = buildNeighborCellKeys(latitude, longitude);
    const placeholders = neighborKeys.map(() => '?').join(', ');
    const query = `
      SELECT DISTINCT
        road_segments.id AS id,
        road_segments.way_id AS wayId,
        road_segments.speed_limit_kmh AS speedLimitKmh,
        road_segments.raw_speed_tag AS rawSpeedTag,
        road_segments.start_lat AS startLat,
        road_segments.start_lon AS startLon,
        road_segments.end_lat AS endLat,
        road_segments.end_lon AS endLon
      FROM segment_cells
      INNER JOIN road_segments ON road_segments.id = segment_cells.segment_id
      WHERE segment_cells.cell_key IN (${placeholders})
    `;

    const rows = database.getAllSync<SegmentRow>(query, ...neighborKeys);
    cellCache.set(cellKey, { rows });
    trimCellCache(cellCache);

    return {
      rows,
      fromCache: false,
    };
  };

  const getSpeedLimit = async (args: RoadSpeedLimitLookupArgs): Promise<RoadSpeedLimitValue | null> => {
    if (!activePackSnapshot) {
      return null;
    }

    if (!Number.isFinite(args.latitude) || !Number.isFinite(args.longitude)) {
      return null;
    }

    const database = ensureDatabase();
    if (!database) {
      return null;
    }

    try {
      const { rows, fromCache } = loadCandidateRows(database, args.latitude, args.longitude);

      let bestMatch: {
        row: SegmentRow;
        distanceMeters: number;
      } | null = null;
      let secondBest: {
        row: SegmentRow;
        distanceMeters: number;
      } | null = null;

      for (const row of rows) {
        const distanceMeters = distancePointToSegmentMeters(
          args.latitude,
          args.longitude,
          row.startLat,
          row.startLon,
          row.endLat,
          row.endLon
        );

        const candidate = { row, distanceMeters };
        if (!bestMatch || distanceMeters < bestMatch.distanceMeters) {
          secondBest = bestMatch;
          bestMatch = candidate;
        } else if (!secondBest || distanceMeters < secondBest.distanceMeters) {
          secondBest = candidate;
        }
      }

      if (!bestMatch || bestMatch.distanceMeters > MATCH_DISTANCE_THRESHOLD_METERS) {
        return null;
      }

      if (
        secondBest &&
        secondBest.row.speedLimitKmh !== bestMatch.row.speedLimitKmh &&
        secondBest.distanceMeters - bestMatch.distanceMeters <= AMBIGUOUS_DISTANCE_DELTA_METERS
      ) {
        deps.logger.debug('Skipping offline speed limit lookup due to ambiguous nearby road match', {
          latitude: roundTo(args.latitude, 6),
          longitude: roundTo(args.longitude, 6),
          bestWayId: bestMatch.row.wayId,
          secondWayId: secondBest.row.wayId,
        });
        return null;
      }

      return {
        speedLimitKmh: roundTo(bestMatch.row.speedLimitKmh, 1),
        source: 'offline_osm',
        wayId: bestMatch.row.wayId,
        rawMaxspeed: bestMatch.row.rawSpeedTag ?? undefined,
        fromCache,
      };
    } catch (error) {
      deps.logger.warn('Offline road speed limit lookup failed', error);
      return null;
    }
  };

  return {
    getSpeedLimit,
    setPackSnapshot,
    reset,
  };
};

export const RoadSpeedLimitService = createRoadSpeedLimitServiceController({
  logger,
});
