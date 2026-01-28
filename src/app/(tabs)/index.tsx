import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useBackgroundService, useDriverProfile, useJourneys, useTheme } from '@hooks';

import { HomeHeroCard } from '@components';
import { HomeLastDriveCard } from '@components';
import { HomeWeekSummary } from '@components';

import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.Component);

export default function Page() {
  const router = useRouter();
  const backgroundService = useBackgroundService();
  const { theme } = useTheme();
  const { driverName } = useDriverProfile();
  const { journeys, loading: journeysLoading, error: journeysError, refetch: refetchJourneys } = useJourneys();
  const styles = createStyles(theme);

  useEffect(() => {
    const initPermissions = async (): Promise<void> => {
      if (backgroundService.permissionState === 'unknown') {
        await backgroundService.requestLocationPermissions();
        await backgroundService.checkPermissions();
      }
    };

    initPermissions();
  }, []);

  const handleOpenSettings = async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch (error) {
      logger.warn('Failed to open settings:', error);
    }
  };

  const completedJourneys = useMemo(() => {
    return journeys.filter(
      (journey) => typeof journey.endTime === 'number' && journey.endTime > 0 && typeof journey.distanceKm === 'number'
    );
  }, [journeys]);

  const lastJourney = completedJourneys[0] ?? null;

  const totalDistanceKm = useMemo(() => {
    return completedJourneys.reduce((sum, journey) => sum + (journey.distanceKm ?? 0), 0);
  }, [completedJourneys]);

  const weeklyAverage = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = completedJourneys.filter((j) => typeof j.startTime === 'number' && j.startTime >= weekAgo);
    if (recent.length === 0) {
      return null;
    }
    const avg = recent.reduce((sum, j) => sum + (j.score ?? 0), 0) / recent.length;
    return Math.round(avg);
  }, [completedJourneys]);

  const trackingEnabled = backgroundService.permissionState === 'granted' && backgroundService.serviceState !== 'stopped';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <HomeHeroCard
        driverName={driverName}
        permissionState={backgroundService.permissionState}
        trackingEnabled={trackingEnabled}
        onOpenSettings={handleOpenSettings}
        onPressJourneys={() => router.push('/journeys')}
      />

      <HomeWeekSummary weeklyAverage={weeklyAverage} driveCount={completedJourneys.length} distanceKm={totalDistanceKm} />

      <HomeLastDriveCard
        lastJourney={lastJourney}
        loading={journeysLoading}
        error={journeysError}
        onRefresh={refetchJourneys}
        onPressJourney={(journeyId) => router.push(`/journey/${journeyId}`)}
      />
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.lg,
      maxWidth: theme.dimensions.deviceMaxWidth,
      alignSelf: 'center',
      width: '100%',
    },
  });
