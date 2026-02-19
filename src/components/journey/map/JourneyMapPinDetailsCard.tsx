import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks/useTheme';

import type { PinDetails } from '@components/journey/map/types';

interface JourneyMapPinDetailsCardProps {
  interactive: boolean;
  details: PinDetails | null;
  selectedPinId: string | null;
}

export const JourneyMapPinDetailsCard = (props: JourneyMapPinDetailsCardProps) => {
  const { interactive, details, selectedPinId } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  if (!interactive || !details) {
    return null;
  }

  return (
    <View style={styles.pinDetailsCard}>
      <Text style={styles.pinDetailsTitle}>{details.title}</Text>
      <Text style={styles.pinDetailsSubtitle}>{details.subtitle}</Text>
      {details.rows.map((row, index) => (
        <View key={`${selectedPinId}-${row.label}-${index}`} style={styles.pinDetailsRow}>
          <Text style={styles.pinDetailsLabel}>{row.label}</Text>
          <Text style={styles.pinDetailsValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    pinDetailsCard: {
      position: 'absolute',
      left: theme.spacing.sm,
      right: theme.spacing.sm,
      bottom: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      padding: theme.spacing.sm,
      gap: theme.spacing.xs,
      opacity: 0.95,
    },
    pinDetailsTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    pinDetailsSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 2,
    },
    pinDetailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    pinDetailsLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    pinDetailsValue: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flexShrink: 1,
      textAlign: 'right',
    },
  });
