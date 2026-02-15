import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useTheme } from '@hooks/useTheme';

type StatTileVariant = 'large' | 'compact';
type StatTileAlign = 'start' | 'center';

interface StatTileProps {
  label: string;
  value: string;
  valueColor?: string;
  variant?: StatTileVariant;
  align?: StatTileAlign;
  allowValueWrap?: boolean;
  style?: ViewStyle;
}

export const StatTile = (props: StatTileProps) => {
  const { label, value, valueColor, variant = 'large', align = 'start', allowValueWrap = false, style } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const valueStyle = variant === 'compact' ? styles.valueCompact : styles.valueLarge;
  const labelStyle = variant === 'compact' ? styles.labelCompact : styles.labelLarge;
  const alignStyle = align === 'center' ? styles.alignCenter : styles.alignStart;
  const valueWrapStyle = allowValueWrap ? styles.valueWrap : null;
  const valueTextAlignStyle = align === 'center' ? styles.valueTextCenter : styles.valueTextStart;

  return (
    <View style={[styles.container, alignStyle, style]}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={[valueStyle, valueWrapStyle, valueTextAlignStyle, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      padding: theme.spacing.md,
      gap: 8,
    },
    alignStart: {
      alignItems: 'flex-start',
    },
    alignCenter: {
      alignItems: 'center',
    },
    labelLarge: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontWeight: '700',
    },
    labelCompact: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontWeight: '600',
    },
    valueLarge: {
      fontSize: 20,
      fontWeight: '900',
      color: theme.colors.onBackground,
    },
    valueCompact: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    valueWrap: {
      width: '100%',
      flexShrink: 1,
    },
    valueTextStart: {
      textAlign: 'left',
    },
    valueTextCenter: {
      textAlign: 'center',
    },
  });
