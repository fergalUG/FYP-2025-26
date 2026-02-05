import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks/useTheme';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastProps {
  title: string;
  message?: string;
  variant?: ToastVariant;
}

const getVariantColor = (variant: ToastVariant, theme: ReturnType<typeof useTheme>['theme']): string => {
  switch (variant) {
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.warning;
    case 'error':
      return theme.colors.error;
    default:
      return theme.colors.primary;
  }
};

export const Toast = (props: ToastProps) => {
  const { title, message, variant = 'info' } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const accentColor = getVariantColor(variant, theme);

  return (
    <View style={styles.container}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 4,
    },
    accent: {
      width: 4,
      borderRadius: 4,
      alignSelf: 'stretch',
    },
    content: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    message: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
  });
