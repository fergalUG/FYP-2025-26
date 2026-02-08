import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useDebugLogs, useDebugOverlay, useDriverProfile, useTheme } from '@hooks';
import { useToast } from '@hooks/ToastProvider';

import { AppButton } from '@components';
import { JourneyService } from '@services/JourneyService';
import { LogService } from '@services/LogService';
import { showConfirmAlert, showSuccessAlert } from '@utils/alert';

export default function Settings() {
  const { theme, mode, toggleMode } = useTheme();
  const { driverName, loading: profileLoading, setDriverName } = useDriverProfile();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [sessionLogName, setSessionLogName] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const styles = createStyles(theme);

  //debug stuff
  const { isEnabled: isDebugOverlayEnabled, toggleOverlay } = useDebugOverlay();
  const { isEnabled: isDebugLogsEnabled, toggleDebugLogs } = useDebugLogs();

  useEffect(() => {
    setSessionLogName(LogService.getSessionFileName());
  }, []);

  const handleExportDatabase = async () => {
    setExporting(true);
    await JourneyService.exportDatabase();
    setExporting(false);
  };

  const handleExportLogs = async () => {
    setExportingLogs(true);
    await LogService.exportSessionLogs();
    setExportingLogs(false);
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    await LogService.clearSessionLogs();
    setClearingLogs(false);
  };

  const executeDeleteOldLogs = async () => {
    setDeletingLogs(true);
    const deletedCount = await LogService.deleteOldLogs();
    setDeletingLogs(false);
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
              <Text style={styles.itemSubtitle}>Use the darker palette for low light.</Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleMode}
              trackColor={{ false: theme.colors.error, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>
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
              value={isDebugOverlayEnabled}
              onValueChange={toggleOverlay}
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
              value={isDebugLogsEnabled}
              onValueChange={toggleDebugLogs}
              trackColor={{ false: theme.colors.onSurface, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.onSurface : theme.colors.background}
            />
          </View>

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
    exportButton: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
      alignSelf: 'flex-start',
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
  });
