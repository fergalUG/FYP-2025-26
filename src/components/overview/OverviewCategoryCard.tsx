import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@hooks/useTheme';
import type { DrivingOverviewCategorySummary } from '@types';

import { buildOverviewCategoryRows, formatOverviewPrimaryValue, getOverviewPrimaryLabel } from '@components/overview/model';

interface OverviewCategoryCardProps {
  category: DrivingOverviewCategorySummary;
  totalJourneyCount: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const OverviewCategoryCard = (props: OverviewCategoryCardProps) => {
  const { category, totalJourneyCount, compact = false, style } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const rows = useMemo(() => buildOverviewCategoryRows(category, totalJourneyCount), [category, totalJourneyCount]);
  const primaryValue = formatOverviewPrimaryValue(category);
  const primaryLabel = getOverviewPrimaryLabel(category);

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>{category.label}</Text>
        <Text style={[compact ? styles.valueCompact : styles.value, category.availability === 'unavailable' ? styles.valueMuted : null]}>
          {primaryValue}
        </Text>
        <Text style={styles.primaryLabel}>{category.availability === 'unavailable' ? 'Availability' : primaryLabel}</Text>
      </View>

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={`${category.key}-${row.label}`} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    card: {
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    cardCompact: {
      padding: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    header: {
      gap: 2,
    },
    title: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.onBackground,
    },
    value: {
      fontSize: 24,
      fontWeight: '900',
      color: theme.colors.onBackground,
    },
    valueCompact: {
      fontSize: 20,
      fontWeight: '900',
      color: theme.colors.onBackground,
    },
    valueMuted: {
      fontSize: 18,
      color: theme.colors.textSecondary,
    },
    primaryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: theme.colors.textSecondary,
    },
    rows: {
      gap: 6,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: theme.spacing.xs,
    },
    rowLabel: {
      flex: 1,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    rowValue: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.onSurface,
      textAlign: 'right',
    },
  });
