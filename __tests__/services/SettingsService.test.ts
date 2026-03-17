import * as SettingsService from '@services/SettingsService';
import { DEFAULT_DRIVER_NAME } from '@constants/defaults';
import { db } from '@/db/client';
import { settings } from '@/db/schema';

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  LogModule: { SettingsService: 'SettingsService' },
}));

const mockQuery = (resolveValue: any = undefined) => {
  const chain: any = {};

  const methods = ['from', 'where', 'values', 'onConflictDoUpdate', 'catch'];

  methods.forEach((method) => {
    chain[method] = jest.fn().mockReturnThis();
  });

  chain.then = (resolve: any, reject: any) => {
    return Promise.resolve(resolveValue).then(resolve, reject);
  };

  return chain;
};

describe('SettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.select as jest.Mock).mockReturnValue(mockQuery([]));
    (db.insert as jest.Mock).mockReturnValue(mockQuery());
    (db.delete as jest.Mock).mockReturnValue(mockQuery());
  });

  describe('getDriverName', () => {
    it('should return the stored driver name if it exists', async () => {
      const mockName = 'Test Driver';
      const chain = mockQuery([{ value: mockName }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getDriverName();

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalledWith(settings);
      expect(chain.where).toHaveBeenCalled();
      expect(result).toBe(mockName);
    });

    it('should return default name if no setting exists', async () => {
      const chain = mockQuery([]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getDriverName();

      expect(result).toBe(DEFAULT_DRIVER_NAME);
    });

    it('should return default name if stored value is empty', async () => {
      const chain = mockQuery([{ value: '' }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getDriverName();

      expect(result).toBe(DEFAULT_DRIVER_NAME);
    });
  });

  describe('setDriverName', () => {
    it('should upsert the driver name', async () => {
      const newName = 'New Driver';
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.setDriverName(newName);

      expect(db.insert).toHaveBeenCalledWith(settings);
      expect(chain.values).toHaveBeenCalledWith({ key: 'driverName', value: newName });
      expect(chain.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: settings.key,
          set: { value: newName },
        })
      );
      expect(success).toBe(true);
    });

    it('should use default name if input is empty', async () => {
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      await SettingsService.setDriverName('   ');

      expect(chain.values).toHaveBeenCalledWith({
        key: 'driverName',
        value: DEFAULT_DRIVER_NAME,
      });
    });

    it('should return false on database error', async () => {
      const chain = mockQuery();

      chain.then = (_: any, reject: any) => {
        reject(new Error('DB Error'));
      };

      (db.insert as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.setDriverName('Valid Name');

      expect(success).toBe(false);
    });
  });

  describe('getMapMarkerDebugMetadataEnabled', () => {
    it('should return false if no setting exists', async () => {
      const chain = mockQuery([]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getMapMarkerDebugMetadataEnabled();

      expect(result).toBe(false);
    });

    it('should return the stored boolean value', async () => {
      const chain = mockQuery([{ value: 'true' }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getMapMarkerDebugMetadataEnabled();

      expect(result).toBe(true);
    });
  });

  describe('setMapMarkerDebugMetadataEnabled', () => {
    it('should upsert the map marker debug metadata setting', async () => {
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.setMapMarkerDebugMetadataEnabled(true);

      expect(db.insert).toHaveBeenCalledWith(settings);
      expect(chain.values).toHaveBeenCalledWith({ key: 'mapMarkerDebugMetadata', value: 'true' });
      expect(chain.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: settings.key,
          set: { value: 'true' },
        })
      );
      expect(success).toBe(true);
    });
  });

  describe('getSpeedLimitDetectionEnabled', () => {
    it('should return false if no setting exists', async () => {
      const chain = mockQuery([]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getSpeedLimitDetectionEnabled();

      expect(result).toBe(false);
    });

    it('should return the stored boolean value', async () => {
      const chain = mockQuery([{ value: 'true' }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getSpeedLimitDetectionEnabled();

      expect(result).toBe(true);
    });
  });

  describe('setSpeedLimitDetectionEnabled', () => {
    it('should upsert the speed limit detection setting', async () => {
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.setSpeedLimitDetectionEnabled(false);

      expect(db.insert).toHaveBeenCalledWith(settings);
      expect(chain.values).toHaveBeenCalledWith({ key: 'speedLimitDetectionEnabled', value: 'false' });
      expect(chain.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: settings.key,
          set: { value: 'false' },
        })
      );
      expect(success).toBe(true);
    });
  });

  describe('installed speed limit pack metadata', () => {
    const metadata = {
      regionId: 'ie-ni',
      regionName: 'Ireland + Northern Ireland',
      packVersion: '20260317',
      sha256: 'abc123',
      sizeBytes: 123,
      sourceTimestamp: '2026-03-17T00:00:00Z',
      installedAt: 123456,
      fileName: 'ie-ni.sqlite',
      filePath: '/tmp/ie-ni.sqlite',
      osmAttribution: 'OpenStreetMap contributors',
    };

    it('loads stored installed speed limit pack metadata', async () => {
      const chain = mockQuery([{ value: JSON.stringify(metadata) }]);
      (db.select as jest.Mock).mockReturnValue(chain);

      const result = await SettingsService.getInstalledSpeedLimitPackMetadata();

      expect(result).toEqual(metadata);
    });

    it('persists installed speed limit pack metadata', async () => {
      const chain = mockQuery();
      (db.insert as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.setInstalledSpeedLimitPackMetadata(metadata);

      expect(success).toBe(true);
      expect(chain.values).toHaveBeenCalledWith({
        key: 'installedSpeedLimitPackMetadata',
        value: JSON.stringify(metadata),
      });
    });

    it('clears installed speed limit pack metadata', async () => {
      const chain = mockQuery();
      (db.delete as jest.Mock).mockReturnValue(chain);

      const success = await SettingsService.clearInstalledSpeedLimitPackMetadata();

      expect(success).toBe(true);
      expect(db.delete).toHaveBeenCalledWith(settings);
      expect(chain.where).toHaveBeenCalled();
    });
  });
});
