import AsyncStorage from '@react-native-async-storage/async-storage';

import * as ThemeService from '@services/ThemeService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('ThemeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadThemeMode', () => {
    it('returns saved dark mode', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('dark');

      const mode = await ThemeService.loadThemeMode();

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('themeMode');
      expect(mode).toBe('dark');
    });

    it('returns saved light mode', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('light');

      const mode = await ThemeService.loadThemeMode();

      expect(mode).toBe('light');
    });

    it('defaults to light for unknown value', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('system');

      const mode = await ThemeService.loadThemeMode();

      expect(mode).toBe('light');
    });

    it('defaults to light on storage error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('read error'));

      const mode = await ThemeService.loadThemeMode();

      expect(mode).toBe('light');
    });
  });

  describe('saveThemeMode', () => {
    it('persists theme mode', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValueOnce(undefined);

      const ok = await ThemeService.saveThemeMode('dark');

      expect(ok).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('themeMode', 'dark');
    });

    it('returns false on storage error', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('write error'));

      const ok = await ThemeService.saveThemeMode('light');

      expect(ok).toBe(false);
    });
  });
});
