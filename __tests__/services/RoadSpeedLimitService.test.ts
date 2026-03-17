import { createRoadSpeedLimitServiceController } from '@services/RoadSpeedLimitService';

describe('RoadSpeedLimitService', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const packSnapshot = {
    regionId: 'ie-ni',
    packVersion: '20260317',
    filePath: 'mock://documents/SpeedLimitPacks/ie-ni.sqlite',
    md5: 'checksum',
    installedAt: 1,
  } as const;

  const createRows = () => [
    {
      id: 1,
      wayId: 1001,
      speedLimitKmh: 50,
      rawSpeedTag: '50',
      startLat: 53.3498,
      startLon: -6.2606,
      endLat: 53.3498,
      endLon: -6.2601,
    },
    {
      id: 2,
      wayId: 1002,
      speedLimitKmh: 80,
      rawSpeedTag: '80',
      startLat: 53.3503,
      startLon: -6.2606,
      endLat: 53.3503,
      endLon: -6.2601,
    },
  ];

  const createService = (rows: ReturnType<typeof createRows>) => {
    const database = {
      getAllSync: jest.fn().mockReturnValue(rows),
      closeSync: jest.fn(),
    };
    const openDatabaseSync = jest.fn().mockReturnValue(database);

    const service = createRoadSpeedLimitServiceController({
      logger,
      openDatabaseSync,
    });

    return { service, database, openDatabaseSync };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no journey pack snapshot is active', async () => {
    const { service, openDatabaseSync } = createService(createRows());

    const result = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });

    expect(result).toBeNull();
    expect(openDatabaseSync).not.toHaveBeenCalled();
  });

  it('matches the nearest offline road segment', async () => {
    const { service, openDatabaseSync } = createService(createRows());
    service.setPackSnapshot(packSnapshot);

    const result = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.26031 });

    expect(openDatabaseSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      speedLimitKmh: 50,
      source: 'offline_osm',
      wayId: 1001,
      rawMaxspeed: '50',
      fromCache: false,
    });
  });

  it('returns null when the nearest candidates are ambiguous', async () => {
    const rows = [
      {
        id: 1,
        wayId: 1001,
        speedLimitKmh: 50,
        rawSpeedTag: '50',
        startLat: 53.3498,
        startLon: -6.26035,
        endLat: 53.3498,
        endLon: -6.26015,
      },
      {
        id: 2,
        wayId: 1002,
        speedLimitKmh: 80,
        rawSpeedTag: '80',
        startLat: 53.34986,
        startLon: -6.26035,
        endLat: 53.34986,
        endLon: -6.26015,
      },
    ];
    const { service } = createService(rows);
    service.setPackSnapshot(packSnapshot);

    const result = await service.getSpeedLimit({ latitude: 53.34983, longitude: -6.26025 });

    expect(result).toBeNull();
  });

  it('reuses cached cell candidates for repeated lookups in the same area', async () => {
    const { service, database } = createService(createRows());
    service.setPackSnapshot(packSnapshot);

    const first = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.26031 });
    const second = await service.getSpeedLimit({ latitude: 53.34981, longitude: -6.26032 });

    expect(database.getAllSync).toHaveBeenCalledTimes(1);
    expect(first?.fromCache).toBe(false);
    expect(second?.fromCache).toBe(true);
  });

  it('clears cached candidates when reset is called', async () => {
    const { service, database } = createService(createRows());
    service.setPackSnapshot(packSnapshot);

    await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.26031 });
    service.reset();
    service.setPackSnapshot(packSnapshot);
    await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.26031 });

    expect(database.getAllSync).toHaveBeenCalledTimes(2);
  });
});
