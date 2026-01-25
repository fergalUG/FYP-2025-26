import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Theme, ThemeMode } from '@theme';
import { getTheme, lightTheme } from '@theme';

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
  const theme = useMemo(() => getTheme(mode), [mode]);
  const toggleMode = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, mode, setMode, toggleMode }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
