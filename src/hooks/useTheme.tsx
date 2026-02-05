import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Theme, ThemeMode } from '@theme';
import { getTheme, lightTheme } from '@theme';
import * as ThemeService from '@services/ThemeService';
import { Appearance } from 'react-native';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'light',
  setMode: () => undefined,
  toggleMode: () => undefined,
});

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);
  const theme = useMemo(() => getTheme(mode), [mode]);

  useEffect(() => {
    const loadSavedTheme = async () => {
      const savedMode = await ThemeService.loadThemeMode();
      setMode(savedMode);
      setIsLoaded(true);
    };
    loadSavedTheme();
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(mode);
  }, [mode]);

  useEffect(() => {
    if (isLoaded) {
      ThemeService.saveThemeMode(mode);
    }
  }, [mode, isLoaded]);

  const toggleMode = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  if (!isLoaded) return null;

  return <ThemeContext.Provider value={{ theme, mode, setMode, toggleMode }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
