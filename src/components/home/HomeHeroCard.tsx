import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PermissionState } from '@types';

import { useTheme } from '@hooks';

interface HomeHeroCardProps {
  driverName: string;
  permissionState: PermissionState;
  trackingEnabled: boolean;
  isLoading: boolean;
  onEnableTracking: () => void;
  onOpenSettings: () => void;
  onPressJourneys: () => void;
}

export const HomeHeroCard = (props: HomeHeroCardProps) => {
  const { driverName, permissionState, trackingEnabled, isLoading, onEnableTracking, onOpenSettings, onPressJourneys } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const showCta = !trackingEnabled;
  const ctaLabel = permissionState === 'denied' ? 'Open Settings' : permissionState === 'granted' ? 'Turn On Tracking' : 'Enable Location';
  const ctaAction = permissionState === 'denied' ? onOpenSettings : onEnableTracking;

  return (
    <View style={styles.card}>
      <Text style={styles.greeting}>Hi, {driverName}</Text>
      <Text style={styles.title}>VeloMetry</Text>
      <Text style={styles.subtitle}>Drive smarter. Build better habits.</Text>

      {showCta ? (
        <View style={styles.permissionWrap}>
          <Text style={styles.permissionText}>
            {permissionState === 'granted'
              ? 'Turn on background tracking so VeloMetry can detect drives automatically.'
              : 'Location access is required to detect drives automatically.'}{' '}
            {permissionState === 'denied' ? 'Enable it in Settings.' : ''}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={ctaAction}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>{isLoading ? 'Working…' : ctaLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.readyText}>All set. Your drives will appear here after you finish one.</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
        onPress={onPressJourneys}
      >
        <Text style={styles.secondaryButtonText}>View Journeys</Text>
      </Pressable>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    greeting: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    title: {
      fontSize: 30,
      fontWeight: '900',
      color: theme.colors.onBackground,
      letterSpacing: 0.2,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    permissionWrap: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    permissionText: {
      fontSize: 14,
      color: theme.colors.onSurface,
      opacity: 0.8,
      lineHeight: 20,
    },
    readyText: {
      fontSize: 14,
      color: theme.colors.onSurface,
      opacity: 0.8,
      lineHeight: 20,
      marginTop: theme.spacing.xs,
    },
    button: {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
      width: '100%',
    },
    buttonPressed: {
      opacity: 0.9,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
    },
    secondaryButton: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    buttonText: {
      color: theme.colors.background,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButtonText: {
      color: theme.colors.onBackground,
      fontSize: 16,
      fontWeight: '700',
    },
  });
