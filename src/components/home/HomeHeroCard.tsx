import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { ServiceStatusIndicator } from '@/components/ServiceStatusIndicator';
import type { PermissionState, ServiceState } from '@types';
import { useTheme } from '@hooks/useTheme';
import { getServiceStatusText } from '@utils/service';

interface HomeHeroCardProps {
  driverName: string;
  permissionState: PermissionState;
  serviceState: ServiceState;
  trackingEnabled: boolean;
  onOpenSettings: () => void;
  onPressJourneys: () => void;
  isLoading?: boolean;
}

export const HomeHeroCard = (props: HomeHeroCardProps) => {
  const { driverName, permissionState, serviceState, trackingEnabled, onOpenSettings, onPressJourneys, isLoading = false } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const showCta = permissionState !== 'granted';
  const ctaAction = onOpenSettings;
  const ctaLabel = 'Open Settings';
  const statusLabel = permissionState !== 'granted' ? 'Permission required' : getServiceStatusText(serviceState);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.greeting}>Hi, {driverName}</Text>
          <Text style={styles.title}>VeloMetry</Text>
        </View>
        <View style={styles.statusWrap}>
          <View style={styles.statusPill}>
            <ServiceStatusIndicator
              size={8}
              serviceState={serviceState}
              permissionState={permissionState}
              containerStyle={styles.statusDotContainer}
            />
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>
        </View>
      </View>

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
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
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
    statusWrap: {
      position: 'relative',
      alignItems: 'flex-end',
      flexShrink: 1,
      maxWidth: '58%',
    },
    statusPill: {
      minHeight: 30,
      borderRadius: 999,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.sm,
      gap: theme.spacing.xs,
      maxWidth: '100%',
    },
    statusDotContainer: {
      marginRight: 2,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.onBackground,
      flexShrink: 1,
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
