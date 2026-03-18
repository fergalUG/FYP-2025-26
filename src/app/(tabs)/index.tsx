import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useAppSettings, useBackgroundService, useDriverProfile, useJourneys, useTheme } from '@hooks';

import { HomeHeroCard, HomeWeekSummary, HomeLastDriveCard } from '@components';

import { createLogger, LogModule } from '@utils/logger';
import { buildJourneyPeriodSummary, isCompletedJourney } from '@utils/journeyInsights';
import { createContentContainerStyle, createScreenStyle } from '@utils/themeStyles';

const logger = createLogger(LogModule.Component);

export default function Page() {
  const router = useRouter();
  const backgroundService = useBackgroundService();
  const { settings, setSummaryRange } = useAppSettings();
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
    return journeys.filter(isCompletedJourney);
  }, [journeys]);

  const lastJourney = completedJourneys[0] ?? null;
  const summary = useMemo(
    () => buildJourneyPeriodSummary(completedJourneys, settings.summaryRange, Date.now()),
    [completedJourneys, settings.summaryRange]
  );

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
        serviceState={backgroundService.serviceState}
        trackingEnabled={trackingEnabled}
        onOpenSettings={handleOpenSettings}
        onPressJourneys={() => router.push('/journeys')}
      />

      <HomeWeekSummary summary={summary} summaryRange={settings.summaryRange} onChangeRange={setSummaryRange} />

      <HomeLastDriveCard
        lastJourney={lastJourney}
        loading={journeysLoading}
        error={journeysError}
        onRefresh={refetchJourneys}
        onPressJourney={(journeyId) => router.push({ pathname: '/journey/[journeyId]', params: { journeyId } })}
      />
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    screen: createScreenStyle(theme),
    content: createContentContainerStyle(theme, { constrainWidth: true }),
  });
