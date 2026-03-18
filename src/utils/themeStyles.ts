import type { Theme } from '@theme';
import type { ViewStyle } from 'react-native';

type ThemeSpacingKey = keyof Theme['spacing'];
type ThemeRadiusKey = keyof Theme['radius'];

interface CenteredContentStyleOptions {
  gap?: ThemeSpacingKey | number;
  padding?: ThemeSpacingKey | number;
}

interface ContentContainerStyleOptions extends CenteredContentStyleOptions {
  constrainWidth?: boolean;
  paddingBottom?: ThemeSpacingKey | number;
}

interface SurfaceCardStyleOptions {
  backgroundColor?: string;
  gap?: ThemeSpacingKey | number;
  padding?: ThemeSpacingKey | number;
  radius?: ThemeRadiusKey;
}

const resolveSpacing = (theme: Theme, value: ThemeSpacingKey | number | undefined, fallback: ThemeSpacingKey): number => {
  if (typeof value === 'number') {
    return value;
  }

  return theme.spacing[value ?? fallback];
};

export const createScreenStyle = (theme: Theme): ViewStyle => ({
  flex: 1,
  backgroundColor: theme.colors.background,
});

export const createCenteredContentStyle = (theme: Theme, options: CenteredContentStyleOptions = {}): ViewStyle => ({
  justifyContent: 'center',
  alignItems: 'center',
  padding: resolveSpacing(theme, options.padding, 'lg'),
  ...(options.gap === undefined ? {} : { gap: resolveSpacing(theme, options.gap, 'md') }),
});

export const createContentContainerStyle = (theme: Theme, options: ContentContainerStyleOptions = {}): ViewStyle => ({
  padding: resolveSpacing(theme, options.padding, 'lg'),
  paddingBottom: resolveSpacing(theme, options.paddingBottom, 'xl'),
  gap: resolveSpacing(theme, options.gap, 'lg'),
  ...(options.constrainWidth
    ? {
        maxWidth: theme.dimensions.deviceMaxWidth,
        width: '100%',
        alignSelf: 'center',
      }
    : {}),
});

export const createSurfaceCardStyle = (theme: Theme, options: SurfaceCardStyleOptions = {}): ViewStyle => ({
  padding: resolveSpacing(theme, options.padding, 'md'),
  borderRadius: theme.radius[options.radius ?? 'lg'],
  backgroundColor: options.backgroundColor ?? theme.colors.surface,
  borderWidth: 1,
  borderColor: theme.colors.outline,
  ...(options.gap === undefined ? {} : { gap: resolveSpacing(theme, options.gap, 'sm') }),
});
