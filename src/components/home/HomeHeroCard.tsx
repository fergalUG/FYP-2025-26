import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import type { PermissionState } from '@types';
import { useTheme } from '@hooks/useTheme';

interface HomeHeroCardProps {
  driverName: string;
  permissionState: PermissionState;
  trackingEnabled: boolean;
  onOpenSettings: () => void;
  onPressJourneys: () => void;
  isLoading?: boolean;
}

export const HomeHeroCard = (props: HomeHeroCardProps) => {
  const { driverName, permissionState, trackingEnabled, onOpenSettings, onPressJourneys, isLoading = false } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const showCta = permissionState !== 'granted';
  const ctaAction = onOpenSettings;
  const ctaLabel = 'Open Settings';

  return (
    <View style={styles.card}>
      <Text style={styles.greeting}>Hi, {driverName}</Text>
      <Text style={styles.title}>VeloMetry</Text>

      {showCta ? (
        <View style={styles.permissionWrap}>
          <Text style={styles.permissionText}>
            {permissionState === 'denied'
              ? 'Location access is required to detect drives automatically. Enable it in Settings.'
              : 'Turn on background tracking so VeloMetry can detect drives automatically.'}
          </Text>
          <AppButton onPress={ctaAction} disabled={isLoading}>
            <Text style={styles.buttonText}>{isLoading ? 'Working…' : ctaLabel}</Text>
          </AppButton>
        </View>
      ) : (
        <Text style={styles.readyText}>
          {trackingEnabled ? 'All set. Your drives will appear here after you finish one.' : 'Initializing tracking...'}
        </Text>
      )}

      <AppButton onPress={onPressJourneys}>
        <Text style={styles.secondaryButtonText}>View Journeys</Text>
      </AppButton>
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
