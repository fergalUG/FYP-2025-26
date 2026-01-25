import type { Theme } from '@theme';

export const appHeaderOptions = (theme: Theme) => ({
  headerStyle: {
    backgroundColor: theme.colors.surface,
  },
  headerTitleStyle: {
    color: theme.colors.onSurface,
  },
  headerTintColor: theme.colors.onSurface,
});
