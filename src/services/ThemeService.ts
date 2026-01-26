import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '@theme';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.ThemeService);

const THEME_MODE_KEY = 'themeMode';
const DEFAULT_THEME_MODE: ThemeMode = 'light';

export const loadThemeMode = async (): Promise<ThemeMode> => {
  try {
    logger.debug('Loading theme mode from storage');
    const saved = await AsyncStorage.getItem(THEME_MODE_KEY);
    if (saved === 'dark' || saved === 'light') {
      logger.debug('Loaded theme mode:', saved);
      return saved;
    }
    return DEFAULT_THEME_MODE;
  } catch (error) {
    logger.warn('Failed to load theme mode:', error);
    return DEFAULT_THEME_MODE;
  }
};

export const saveThemeMode = async (mode: ThemeMode): Promise<boolean> => {
  try {
    logger.debug('Saving theme mode:', mode);
    await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    return true;
  } catch (error) {
    logger.warn('Failed to save theme mode:', error);
    return false;
  }
};
