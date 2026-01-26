import * as JourneyService from '@services/JourneyService';
import * as SettingsService from '@services/SettingsService';
import { DEFAULT_DRIVER_NAME } from '@constants/defaults';

const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

describe('SettingsService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await JourneyService.initDatabase();
  });

  describe('getDriverName', () => {
    it('returns default when DB has no value', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const name = await SettingsService.getDriverName();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('SELECT value FROM settings WHERE key = ?;', ['driverName']);
      expect(name).toBe(DEFAULT_DRIVER_NAME);
    });

    it('trims and returns stored value', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ value: '  Alex  ' });

      const name = await SettingsService.getDriverName();

      expect(name).toBe('Alex');
    });

    it('returns default when stored value is empty string', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ value: '   ' });

      const name = await SettingsService.getDriverName();

      expect(name).toBe(DEFAULT_DRIVER_NAME);
    });

    it('returns default on query error', async () => {
      mockDb.getFirstAsync.mockRejectedValueOnce(new Error('DB error'));

      const name = await SettingsService.getDriverName();

      expect(name).toBe(DEFAULT_DRIVER_NAME);
    });
  });

  describe('setDriverName', () => {
    it('upserts trimmed value', async () => {
      mockDb.runAsync.mockResolvedValueOnce({});

      const ok = await SettingsService.setDriverName('  Sam  ');

      expect(ok).toBe(true);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
        ['driverName', 'Sam']
      );
    });

    it('persists default when given blank name', async () => {
      mockDb.runAsync.mockResolvedValueOnce({});

      const ok = await SettingsService.setDriverName('   ');

      expect(ok).toBe(true);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
        ['driverName', DEFAULT_DRIVER_NAME]
      );
    });

    it('returns false on upsert error', async () => {
      mockDb.runAsync.mockRejectedValueOnce(new Error('DB error'));

      const ok = await SettingsService.setDriverName('Jordan');

      expect(ok).toBe(false);
    });
  });

  it('initializes DB via JourneyService when needed', async () => {
    jest.resetModules();

    const SQL2 = await import('expo-sqlite');
    const JourneyService2 = await import('../../src/services/JourneyService');
    const SettingsService2 = await import('../../src/services/SettingsService');

    const db2 = {
      execAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({}),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    };
    (SQL2.openDatabaseAsync as unknown as jest.Mock).mockResolvedValueOnce(db2);

    const name = await SettingsService2.getDriverName();

    expect(JourneyService2.getDatabase()).not.toBeNull();
    expect(name).toBe(DEFAULT_DRIVER_NAME);
  });
});
