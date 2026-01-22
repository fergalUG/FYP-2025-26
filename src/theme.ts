import { Dimensions } from 'react-native';

const MAX_WIDTH = Dimensions.get('window').width >= 1024 ? 960 : Dimensions.get('window').width;
const MAX_HEIGHT = Dimensions.get('window').height;

export const lightTheme = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#000000',
    textSecondary: '#8E8E93',
    border: '#C6C6C8',
    disabled: '#E5E5EA',
    outline: '#C6C6C8',
    onSurface: '#000000',
    onBackground: '#000000',
    shadow: '#000000',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
  dimensions: {
    deviceMaxWidth: MAX_WIDTH,
    deviceMaxHeight: MAX_HEIGHT,
  },
} as const;

export const theme = lightTheme;
