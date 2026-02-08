import { Dimensions } from 'react-native';

const MAX_WIDTH = Dimensions.get('window').width >= 1024 ? 960 : Dimensions.get('window').width;
const MAX_HEIGHT = Dimensions.get('window').height;

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
};

const dimensions = {
  deviceMaxWidth: MAX_WIDTH,
  deviceMaxHeight: MAX_HEIGHT,
};

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  disabled: string;
  outline: string;
  onSurface: string;
  onBackground: string;
  shadow: string;
  status: {
    active: string;
    passive: string;
    stopped: string;
  };
  score: {
    excellent: string;
    good: string;
    fair: string;
    poor: string;
  };
  event: {
    brake: string;
    accel: string;
    corner: string;
    moderateSpeeding: string;
    harshSpeeding: string;
    stopAndGo: string;
    start: string;
    end: string;
  };
}

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  dimensions: typeof dimensions;
}

export const lightTheme: Theme = {
  colors: {
    primary: '#339989',
    secondary: '#5BB9AD',
    success: '#2F9C8E',
    warning: '#F2C14E',
    error: '#F2545B',
    background: '#F7F5F2',
    surface: '#ECE8E3',
    text: '#2B2C28',
    textSecondary: '#9B959E',
    border: '#B8B2B8',
    disabled: '#D8D2D6',
    outline: '#B8B2B8',
    onSurface: '#2B2C28',
    onBackground: '#2B2C28',
    shadow: '#000000',
    status: {
      active: '#339989',
      passive: '#F2C14E',
      stopped: '#F2545B',
    },
    score: {
      excellent: '#339989',
      good: '#a3c77c',
      fair: '#F2C14E',
      poor: '#F2545B',
    },
    event: {
      brake: '#F2545B',
      accel: '#F29154',
      corner: '#F2DD54',
      moderateSpeeding: '#F29154',
      harshSpeeding: '#F2545B',
      stopAndGo: '#5C7CFA',
      start: '#339989',
      end: '#5BB9AD',
    },
  },
  spacing,
  radius,
  dimensions,
};

export const darkTheme: Theme = {
  colors: {
    primary: '#339989',
    secondary: '#5BB9AD',
    success: '#3FB6A6',
    warning: '#F2C14E',
    error: '#F2545B',
    background: '#131515',
    surface: '#2B2C28',
    text: '#CAC4CE',
    textSecondary: '#AFA8B2',
    border: '#3A3B37',
    disabled: '#3E3F3B',
    outline: '#3A3B37',
    onSurface: '#CAC4CE',
    onBackground: '#CAC4CE',
    shadow: '#000000',
    status: {
      active: '#339989',
      passive: '#F2C14E',
      stopped: '#F2545B',
    },
    score: {
      excellent: '#339989',
      good: '#a3c77c',
      fair: '#F2C14E',
      poor: '#F2545B',
    },
    event: {
      brake: '#F2545B',
      accel: '#F29154',
      corner: '#F2DD54',
      moderateSpeeding: '#F29154',
      harshSpeeding: '#F2545B',
      stopAndGo: '#748FFC',
      start: '#339989',
      end: '#5BB9AD',
    },
  },
  spacing,
  radius,
  dimensions,
};
export type ThemeMode = 'light' | 'dark';

export const getTheme = (mode: ThemeMode): Theme => (mode === 'dark' ? darkTheme : lightTheme);
