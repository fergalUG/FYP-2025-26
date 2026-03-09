import { createRoadSpeedLimitServiceController } from '@services/RoadSpeedLimitService';
import type { RoadSpeedLimitCacheStore } from '@types';

describe('RoadSpeedLimitService', () => {
  let nowMs = 1000;
  const now = () => nowMs;

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const createService = (fetchFn: typeof fetch) =>
    createRoadSpeedLimitServiceController({
      fetchFn,
      now,
      logger,
      overpassUrl: 'https://example.com/overpass',
    });

  const createCacheStore = (): RoadSpeedLimitCacheStore => ({
    getByKey: jest.fn(),
    upsert: jest.fn(),
    deleteByKey: jest.fn(),
    deleteExpired: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 1000;
  });

  it('resolves and caches a speed limit from Overpass', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          {
            id: 123,
            tags: { maxspeed: '80' },
            center: { lat: 53.3498, lon: -6.2603 },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = createService(fetchFn);
    const first = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });
    const second = await service.getSpeedLimit({ latitude: 53.34982, longitude: -6.26028 });

    expect(first).toEqual(
      expect.objectContaining({
        speedLimitKmh: 80,
        source: 'overpass',
        wayId: 123,
        rawMaxspeed: '80',
        fromCache: false,
      })
    );
    expect(second).toEqual(
      expect.objectContaining({
        speedLimitKmh: 80,
        fromCache: true,
      })
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses miss cache when no parseable maxspeed exists', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          {
            id: 321,
            tags: { maxspeed: 'signals' },
            center: { lat: 53.3498, lon: -6.2603 },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = createService(fetchFn);
    const first = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });
    const second = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reuses nearby cached hit across different cache cells', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          {
            id: 456,
            tags: { maxspeed: '50 mph' },
            center: { lat: 53.3498, lon: -6.2603 },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = createService(fetchFn);
    const first = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });
    const second = await service.getSpeedLimit({ latitude: 53.3507, longitude: -6.2603 });

    expect(first?.speedLimitKmh).toBe(80.5);
    expect(second).toEqual(
      expect.objectContaining({
        speedLimitKmh: 80.5,
        fromCache: true,
      })
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('resets cached values', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          {
            id: 789,
            tags: { maxspeed: '100' },
            center: { lat: 53.3498, lon: -6.2603 },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = createService(fetchFn);

    await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });
    service.reset();
    await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('hydrates from persisted cache before calling Overpass', async () => {
    const fetchFn = jest.fn() as unknown as typeof fetch;
    const cacheStore = createCacheStore();
    (cacheStore.getByKey as jest.Mock).mockResolvedValue({
      key: '53.350,-6.260',
      kind: 'hit',
      latitude: 53.3498,
      longitude: -6.2603,
      speedLimitKmh: 80,
      source: 'overpass',
      wayId: 222,
      rawMaxspeed: '80',
      expiresAtMs: nowMs + 60_000,
      updatedAtMs: nowMs,
    });

    const service = createRoadSpeedLimitServiceController({
      fetchFn,
      now,
      logger,
      overpassUrl: 'https://example.com/overpass',
      cacheStore,
    });

    const result = await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });

    expect(result).toEqual(
      expect.objectContaining({
        speedLimitKmh: 80,
        fromCache: true,
      })
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('persists fetched hit entries into cache store', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          {
            id: 123,
            tags: { maxspeed: '80' },
            center: { lat: 53.3498, lon: -6.2603 },
          },
        ],
      }),
    }) as unknown as typeof fetch;
    const cacheStore = createCacheStore();
    (cacheStore.getByKey as jest.Mock).mockResolvedValue(null);

    const service = createRoadSpeedLimitServiceController({
      fetchFn,
      now,
      logger,
      overpassUrl: 'https://example.com/overpass',
      cacheStore,
    });

    await service.getSpeedLimit({ latitude: 53.3498, longitude: -6.2603 });

    expect(cacheStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'hit',
        speedLimitKmh: 80,
      })
    );
  });
});
