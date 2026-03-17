import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useAppSettings, useDriverProfile, useTheme } from '@hooks';
import { useToast } from '@hooks/ToastProvider';

import { AppButton } from '@components';
import { JourneyService } from '@services/JourneyService';
import { useBackgroundService } from '@hooks';
import { LogService } from '@services/LogService';
import { SpeedLimitPackService } from '@services/SpeedLimitPackService';
import { showConfirmAlert, showSuccessAlert } from '@utils/alert';

import type { SpeedLimitPackStatus } from '@types';

export default function Settings() {
  const { theme, mode, toggleMode } = useTheme();
  const { driverName, loading: profileLoading, setDriverName } = useDriverProfile();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [exportingLogFile, setExportingLogFile] = useState<string | null>(null);
  const [exportingAllLogs, setExportingAllLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [sessionLogName, setSessionLogName] = useState<string | null>(null);
  const [logFiles, setLogFiles] = useState<ReturnType<typeof LogService.listLogFiles>>([]);
  const [loadingLogFiles, setLoadingLogFiles] = useState(false);
  const [packStatus, setPackStatus] = useState<SpeedLimitPackStatus | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const styles = createStyles(theme);

  const { settings, setDebugLogsEnabled, setDebugOverlayEnabled, setMapMarkerDebugMetadataEnabled, setSpeedLimitDetectionEnabled } =
    useAppSettings();

  const backgroundService = useBackgroundService();
  const [startingManualTracking, setStartingManualTracking] = useState(false);
  const [stoppingManualTracking, setStoppingManualTracking] = useState(false);

  useEffect(() => {
    setSessionLogName(LogService.getSessionFileName());
    setLogFiles(LogService.listLogFiles());
  }, []);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = SpeedLimitPackService.addListener((status) => {
      if (!isMounted) {
        return;
      }

      setPackStatus(status);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loadLogFiles = async () => {
    setLoadingLogFiles(true);
    try {
      setLogFiles(LogService.listLogFiles());
    } finally {
      setLoadingLogFiles(false);
    }
  };

  const formattedLogFiles = useMemo(() => {
    return logFiles.map((file) => ({
      ...file,
      sizeLabel: formatBytes(file.size),
      timeLabel: file.modificationTime ? new Date(file.modificationTime).toLocaleString() : 'Unknown time',
    }));
  }, [logFiles]);

  const handleExportDatabase = async () => {
    setExporting(true);
    await JourneyService.exportDatabase();
    setExporting(false);
  };

  const handleExportLogs = async () => {
    setExportingLogs(true);
    await LogService.exportSessionLogs();
    setExportingLogs(false);
    loadLogFiles();
  };

  const handleExportAllLogs = async () => {
    setExportingAllLogs(true);
    await LogService.exportAllLogs();
    setExportingAllLogs(false);
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    await LogService.clearSessionLogs();
    setClearingLogs(false);
    loadLogFiles();
  };

  const executeDeleteOldLogs = async () => {
    setDeletingLogs(true);
    const deletedCount = await LogService.deleteOldLogs();
    setDeletingLogs(false);
    loadLogFiles();
    showSuccessAlert(
      'Old logs deleted',
      deletedCount > 0 ? `Deleted ${deletedCount} old log file${deletedCount === 1 ? '' : 's'}.` : 'No old log files found.'
    );
  };

  const handleDeleteOldLogs = () => {
    showConfirmAlert('Delete old logs?', 'This will remove previous session log files from this device.', executeDeleteOldLogs);
  };

  const handleToastTest = () => {
    showToast({
      title: 'Toast test',
      message: 'This is how in-app toasts will appear.',
      variant: 'success',
    });
  };

  const showSpeedLimitDetectionNextJourneyToast = () => {
    showToast({
      title: 'Applies next journey',
      message: 'Speed limit detection changes will apply the next time a journey starts.',
      variant: 'info',
    });
  };

  const showOfflineRoadDataNextJourneyToast = () => {
    if (backgroundService.mode === 'ACTIVE') {
      showSpeedLimitDetectionNextJourneyToast();
    }
  };

  const persistSpeedLimitDetectionEnabled = async (enabled: boolean) => {
    await setSpeedLimitDetectionEnabled(enabled);
    if (backgroundService.mode === 'ACTIVE') {
      showSpeedLimitDetectionNextJourneyToast();
    }
  };

  const handleSpeedLimitDetectionToggle = (enabled: boolean) => {
    if (!enabled) {
      void persistSpeedLimitDetectionEnabled(false);
      return;
    }

    showConfirmAlert(
      'Enable Speed Limit Detection?',
      'Turning this on uses offline road data stored on your device for speeding detection. You will need to download the Ireland + Northern Ireland road data pack. Continue?',
      () => {
        void persistSpeedLimitDetectionEnabled(true);
      }
    );
  };

  const handleCheckSpeedLimitPackUpdate = async () => {
    const status = await SpeedLimitPackService.checkForUpdate();
    setPackStatus(status);

    if (status.phase === 'error') {
      showToast({
        title: 'Road data check failed',
        message: status.errorMessage ?? 'Could not check for offline road data updates.',
        variant: 'error',
      });
      return;
    }

    showToast({
      title:
        status.installState !== 'installed'
          ? 'Road data available'
          : status.updateAvailable
            ? 'Road data update available'
            : 'Road data up to date',
      message:
        status.installState !== 'installed'
          ? `Version ${status.latestManifest?.packVersion ?? 'unknown'} is ready to download.`
          : status.updateAvailable
            ? `Version ${status.latestManifest?.packVersion ?? 'unknown'} is ready to download.`
            : 'You already have the latest offline road data.',
      variant: status.installState !== 'installed' || status.updateAvailable ? 'info' : 'success',
    });
  };

  const handleDownloadSpeedLimitPack = async () => {
    const success = await SpeedLimitPackService.downloadPack('ie-ni');
    if (!success) {
      const latestStatus = await SpeedLimitPackService.getLocalStatus();
      setPackStatus(latestStatus);
      showToast({
        title: 'Road data download failed',
        message: latestStatus.errorMessage ?? 'Could not install the offline road data pack.',
        variant: 'error',
      });
      return;
    }

    showToast({
      title: 'Road data ready',
      message: 'Offline speed limit data is installed on this device.',
      variant: 'success',
    });
    showOfflineRoadDataNextJourneyToast();
  };

  const executeRemoveSpeedLimitPack = async () => {
    const success = await SpeedLimitPackService.removePack('ie-ni');
    if (!success) {
      const latestStatus = await SpeedLimitPackService.getLocalStatus();
      setPackStatus(latestStatus);
      showToast({
        title: 'Could not remove road data',
        message: latestStatus.errorMessage ?? 'Offline road data could not be removed.',
        variant: 'error',
      });
      return;
    }

    showToast({
      title: 'Road data removed',
      message: 'Offline speed limit data has been removed from this device.',
      variant: 'success',
    });
    showOfflineRoadDataNextJourneyToast();
  };

  const handleRemoveSpeedLimitPack = () => {
    showConfirmAlert(
      'Remove Offline Road Data?',
      'This will delete the installed Ireland + Northern Ireland road data pack from this device.',
      () => {
        void executeRemoveSpeedLimitPack();
      }
    );
  };

  const installedPack = packStatus?.installedPack ?? null;
  const latestManifest = packStatus?.latestManifest ?? null;
  const packSizeLabel = formatBytes(latestManifest?.sizeBytes ?? installedPack?.sizeBytes ?? null);
  const installedPackDateLabel = installedPack ? new Date(installedPack.installedAt).toLocaleDateString() : null;
  const packBusyLabel =
    packStatus?.phase === 'downloading'
      ? `Downloading${typeof packStatus.progressFraction === 'number' ? ` ${Math.round(packStatus.progressFraction * 100)}%` : '...'}`
      : packStatus?.phase === 'installing'
        ? 'Installing...'
        : packStatus?.phase === 'checking'
          ? 'Checking for updates...'
          : packStatus?.phase === 'removing'
            ? 'Removing...'
            : null;

  const handleManualStartActiveTracking = async () => {
    setStartingManualTracking(true);
    try {
      await backgroundService.manualStartActiveTracking();
    } catch (error) {
      showToast({
        title: 'Error',
        message: 'Failed to start active tracking: ' + (error instanceof Error ? error.message : String(error)),
        variant: 'error',
      });
    } finally {
      setStartingManualTracking(false);
    }
  };

  const handleManualStopActiveTracking = async () => {
    setStoppingManualTracking(true);
    try {
      await backgroundService.manualStopActiveTracking();
    } catch (error) {
      showToast({
        title: 'Error',
        message: 'Failed to stop active tracking: ' + (error instanceof Error ? error.message : String(error)),
        variant: 'error',
      });
    } finally {
      setStoppingManualTracking(false);
    }
  };

  const handleStartEditName = () => {
    setDraftName(driverName);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setDraftName(driverName);
  };

  const handleSaveName = async () => {
    const success = await setDriverName(draftName);
    if (success) {
      setIsEditingName(false);
    }
  };

  const handleExportLogFile = async (fileName: string) => {
    setExportingLogFile(fileName);
    await LogService.exportLogFile(fileName);
    setExportingLogFile(null);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          <MaterialIcons name="account-circle" size={64} color={theme.colors.primary} />
        </View>
        <View style={styles.profileText}>
          {!isEditingName ? (
            <Pressable onPress={handleStartEditName} disabled={profileLoading}>
              <Text style={styles.profileName}>{profileLoading ? 'Loading…' : driverName}</Text>
              <Text style={styles.profileSubtitle}>Tap to edit</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.profileSubtitle}>Driver name</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Driver"
                placeholderTextColor={theme.colors.textSecondary}
                style={styles.nameInput}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                maxLength={40}
              />
              <View style={styles.nameActionsRow}>
                <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={handleCancelEditName}>
                  <Text style={styles.actionButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.actionButtonPrimary]} onPress={handleSaveName}>
                  <Text style={styles.actionButtonPrimaryText}>Save</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Dark Theme</Text>
              <Text style={styles.itemSubtitle}>Use the dark theme palette.</Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleMode}
              trackColor={{ false: theme.colors.error, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.outline, marginVertical: theme.spacing.sm }} />

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Enable Speed Limit Detection</Text>
              <Text style={styles.itemSubtitle}>Uses offline road data stored on this device for private speeding detection.</Text>
            </View>
            <Switch
              value={settings.speedLimitDetectionEnabled}
              onValueChange={handleSpeedLimitDetectionToggle}
              trackColor={{ false: theme.colors.onSurface, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

          {settings.speedLimitDetectionEnabled && packStatus?.installState !== 'installed' ? (
            <Text style={styles.emptyText}>Speeding detection is unavailable until offline road data is downloaded.</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.itemTitle}>Offline Road Data</Text>
          <Text style={styles.itemSubtitle}>
            OpenStreetMap speed limit data stored on-device. (Currently only supported: Ireland + Northern Ireland)
          </Text>
          <Text style={styles.logFileName}>
            {installedPack
              ? `Installed ${installedPack.packVersion}${installedPackDateLabel ? ` • ${installedPackDateLabel}` : ''} • ${packSizeLabel}`
              : latestManifest
                ? `Not installed • ${latestManifest.packVersion} • ${packSizeLabel}`
                : 'Not installed • Check for updates to load the latest pack details.'}
          </Text>
          {packBusyLabel ? <Text style={styles.itemSubtitle}>{packBusyLabel}</Text> : null}
          {packStatus?.errorMessage ? <Text style={styles.errorText}>{packStatus.errorMessage}</Text> : null}
          <View style={styles.packActionRow}>
            <AppButton
              variant="secondary"
              style={styles.secondaryActionButton}
              onPress={handleCheckSpeedLimitPackUpdate}
              disabled={!!packStatus?.isBusy}
            >
              <Text style={styles.secondaryActionButtonText}>Check for Update</Text>
            </AppButton>

            {packStatus?.installState === 'installed' ? (
              <>
                {packStatus.updateAvailable ? (
                  <AppButton style={styles.secondaryActionButton} onPress={handleDownloadSpeedLimitPack} disabled={!!packStatus?.isBusy}>
                    <Text style={styles.exportButtonText}>Update</Text>
                  </AppButton>
                ) : null}
                <AppButton
                  variant="secondary"
                  style={styles.secondaryActionButton}
                  onPress={handleRemoveSpeedLimitPack}
                  disabled={!!packStatus?.isBusy}
                >
                  <Text style={styles.secondaryActionButtonText}>Remove</Text>
                </AppButton>
              </>
            ) : (
              <AppButton style={styles.secondaryActionButton} onPress={handleDownloadSpeedLimitPack} disabled={!!packStatus?.isBusy}>
                <Text style={styles.exportButtonText}>Download</Text>
              </AppButton>
            )}
          </View>
          <Text style={styles.attributionText}>Contains OpenStreetMap data © OpenStreetMap contributors (ODbL).</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Show Debug Overlay</Text>
              <Text style={styles.itemSubtitle}>Show logs on screen.</Text>
            </View>
            <Switch
              value={settings.debugOverlayEnabled}
              onValueChange={setDebugOverlayEnabled}
              trackColor={{ false: theme.colors.onSurface, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Toggle Debug Logs</Text>
              <Text style={styles.itemSubtitle}>Enable 'DEBUG' level logs.</Text>
            </View>
            <Switch
              value={settings.debugLogsEnabled}
              onValueChange={setDebugLogsEnabled}
              trackColor={{ false: theme.colors.onSurface, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Show Debug Metadata on Map Markers</Text>
              <Text style={styles.itemSubtitle}>Include detector internals in map marker details.</Text>
            </View>
            <Switch
              value={settings.mapMarkerDebugMetadataEnabled}
              onValueChange={setMapMarkerDebugMetadataEnabled}
              trackColor={{ false: theme.colors.onSurface, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.outline, marginVertical: theme.spacing.sm }} />

          <Text style={styles.itemTitle}>Start active tracking</Text>
          <Text style={styles.itemSubtitle}>Manually start active tracking.</Text>
          <AppButton
            style={[styles.exportButton, startingManualTracking && styles.exportButtonDisabled]}
            onPress={handleManualStartActiveTracking}
            disabled={startingManualTracking}
          >
            {startingManualTracking ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Starting...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Start Active Tracking</Text>
            )}
          </AppButton>

          <Text style={styles.itemTitle}>Stop active tracking</Text>
          <Text style={styles.itemSubtitle}>Manually stop active tracking.</Text>
          <AppButton
            style={[styles.exportButton, stoppingManualTracking && styles.exportButtonDisabled]}
            onPress={handleManualStopActiveTracking}
            disabled={stoppingManualTracking}
          >
            {stoppingManualTracking ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Stopping...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Stop Active Tracking</Text>
            )}
          </AppButton>

          <View style={{ height: 1, backgroundColor: theme.colors.outline, marginVertical: theme.spacing.sm }} />

          <Text style={styles.itemTitle}>Export Session Logs</Text>
          <Text style={styles.itemSubtitle}>Download logs recorded since app start.</Text>
          {sessionLogName ? <Text style={styles.logFileName}>Session file: {sessionLogName}</Text> : null}
          <AppButton
            style={[styles.exportButton, exportingLogs && styles.exportButtonDisabled]}
            onPress={handleExportLogs}
            disabled={exportingLogs}
          >
            {exportingLogs ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Exporting...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Export Logs</Text>
            )}
          </AppButton>
          <Text style={styles.itemTitle}>Export All Logs</Text>
          <Text style={styles.itemSubtitle}>Combine every saved log file (all sessions) into one export.</Text>
          <AppButton
            style={[styles.exportButton, exportingAllLogs && styles.exportButtonDisabled]}
            onPress={handleExportAllLogs}
            disabled={exportingAllLogs}
          >
            {exportingAllLogs ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Exporting...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Export All Logs</Text>
            )}
          </AppButton>
          <Text style={styles.itemTitle}>Clear Session Logs</Text>
          <Text style={styles.itemSubtitle}>Remove current session log content without deleting the file.</Text>
          <AppButton
            style={[styles.exportButton, clearingLogs && styles.exportButtonDisabled]}
            onPress={handleClearLogs}
            disabled={clearingLogs}
          >
            {clearingLogs ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Clearing...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Clear Session Logs</Text>
            )}
          </AppButton>
          <Text style={styles.itemTitle}>Delete Old Logs</Text>
          <Text style={styles.itemSubtitle}>Remove previous session log files from device storage.</Text>
          <AppButton
            style={[styles.exportButton, deletingLogs && styles.exportButtonDisabled]}
            onPress={handleDeleteOldLogs}
            disabled={deletingLogs}
          >
            {deletingLogs ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Deleting...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Delete Old Logs</Text>
            )}
          </AppButton>

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.itemTitle}>Stored Log Files</Text>
              <Text style={styles.itemSubtitle}>Export any previous session file.</Text>
            </View>
            <Pressable style={styles.refreshButton} onPress={loadLogFiles} disabled={loadingLogFiles}>
              <Text style={styles.refreshButtonText}>{loadingLogFiles ? 'Loading...' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {formattedLogFiles.length === 0 ? (
            <Text style={styles.emptyText}>No log files found.</Text>
          ) : (
            formattedLogFiles.map((file) => (
              <View key={file.name} style={styles.logFileRow}>
                <View style={styles.logFileMeta}>
                  <Text style={styles.logFileNameText}>
                    {file.name}
                    {file.isCurrentSession ? ' (current)' : ''}
                  </Text>
                  <Text style={styles.logFileDetails}>
                    {file.sizeLabel} • {file.timeLabel}
                  </Text>
                </View>
                <Pressable
                  style={[styles.exportChip, exportingLogFile === file.name && styles.exportChipDisabled]}
                  onPress={() => handleExportLogFile(file.name)}
                  disabled={exportingLogFile === file.name}
                >
                  <Text style={styles.exportChipText}>{exportingLogFile === file.name ? 'Exporting...' : 'Export'}</Text>
                </Pressable>
              </View>
            ))
          )}

          <View style={{ height: 1, backgroundColor: theme.colors.outline, marginVertical: theme.spacing.sm }} />

          <Text style={styles.itemTitle}>Export Database</Text>
          <Text style={styles.itemSubtitle}>Download a copy of journey data.</Text>
          <AppButton
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={handleExportDatabase}
            disabled={exporting}
          >
            {exporting ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator size="small" color={theme.colors.background} />
                <Text style={styles.exportButtonText}>Exporting...</Text>
              </View>
            ) : (
              <Text style={styles.exportButtonText}>Export DB</Text>
            )}
          </AppButton>

          <View style={{ height: 1, backgroundColor: theme.colors.outline, marginVertical: theme.spacing.sm }} />

          <Text style={styles.itemTitle}>Toast Preview</Text>
          <Text style={styles.itemSubtitle}>Show a sample toast notification.</Text>
          <AppButton style={styles.exportButton} onPress={handleToastTest}>
            <Text style={styles.exportButtonText}>Show Toast</Text>
          </AppButton>
        </View>
      </View>
    </ScrollView>
  );
}

const formatBytes = (value: number | null): string => {
  if (!value || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
};

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
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.md,
    },
    avatarWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    profileText: {
      flex: 1,
      gap: 4,
    },
    profileName: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    profileSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurface,
      opacity: 0.7,
    },
    nameInput: {
      marginTop: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      color: theme.colors.onBackground,
      fontSize: 16,
      fontWeight: '600',
    },
    nameActionsRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    actionButton: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonPrimary: {
      backgroundColor: theme.colors.primary,
      flex: 1,
    },
    actionButtonPrimaryText: {
      color: theme.colors.background,
      fontWeight: '700',
    },
    actionButtonSecondary: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      flex: 1,
    },
    actionButtonSecondaryText: {
      color: theme.colors.onBackground,
      fontWeight: '700',
    },
    section: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.onSurface,
      opacity: 0.7,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    card: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      gap: theme.spacing.sm,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    itemSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurface,
      opacity: 0.7,
    },
    logFileName: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    rowText: {
      flex: 1,
      gap: 4,
    },
    refreshButton: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.background,
    },
    refreshButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onBackground,
    },
    logFileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    logFileMeta: {
      flex: 1,
      gap: 2,
    },
    logFileNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    logFileDetails: {
      fontSize: 12,
      color: theme.colors.onSurface,
      opacity: 0.6,
    },
    exportChip: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.primary,
    },
    exportChipDisabled: {
      opacity: 0.6,
    },
    exportChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.background,
    },
    emptyText: {
      fontSize: 12,
      color: theme.colors.onSurface,
      opacity: 0.6,
    },
    errorText: {
      fontSize: 12,
      color: theme.colors.error,
    },
    packActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    exportButton: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
      alignSelf: 'flex-start',
    },
    secondaryActionButton: {
      alignSelf: 'flex-start',
    },
    secondaryActionButtonText: {
      color: theme.colors.onBackground,
      fontWeight: '600',
    },
    exportButtonDisabled: {
      opacity: 0.6,
    },
    exportButtonText: {
      color: theme.colors.background,
      fontWeight: '600',
    },
    exportingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    attributionText: {
      fontSize: 12,
      color: theme.colors.onSurface,
      opacity: 0.6,
    },
  });
