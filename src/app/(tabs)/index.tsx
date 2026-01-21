import { Text, View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../theme';
import { useBackgroundService } from '../../hooks/useBackgroundService';
import { getServiceStatusText, getServiceStatusColor, getPermissionStatusText, getLoadingText } from '../../utils/service';
import { showSuccessAlert, showErrorAlert } from '../../utils/alert';

export default function Page() {
  const { serviceState, permissionState, isLoading, startActiveTracking, stopActiveTracking, setupService } = useBackgroundService();

  const handleSetupService = async (): Promise<void> => {
    const success = await setupService();
    if (success) {
      showSuccessAlert('Success', 'VeloMetry is now set up and monitoring your location in the background.');
    } else {
      showErrorAlert('Setup Failed', 'Unable to set up VeloMetry. Please ensure location permissions are granted.');
    }
  };

  const isServiceSetup = permissionState === 'granted' && serviceState !== 'stopped';

  const handleStartActive = async (): Promise<void> => {
    const success = await startActiveTracking();
    if (success) {
      showSuccessAlert('Success', 'Active tracking started');
    }
  };

  const handleStopActive = async (): Promise<void> => {
    const success = await stopActiveTracking();
    if (success) {
      showSuccessAlert('Success', 'Active tracking stopped');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        <Text style={styles.title}>VeloMetry</Text>
        <Text style={styles.subtitle}>Track your driving behavior</Text>

        {!isServiceSetup ? (
          <View style={styles.setupContainer}>
            <Text style={styles.setupTitle}>Get Started</Text>
            <Text style={styles.setupDescription}>
              VeloMetry runs in the background to automatically track your driving behavior. To get started, we need location permissions.
            </Text>

            <View style={styles.statusContainer}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={[styles.statusText, { color: getServiceStatusColor(serviceState) }]}>{getServiceStatusText(serviceState)}</Text>
            </View>

            <Text style={styles.permissionText}>Permissions: {getPermissionStatusText(permissionState)}</Text>

            <Pressable style={[styles.button, styles.primaryButton]} onPress={handleSetupService} disabled={isLoading}>
              <Text style={styles.buttonText}>{getLoadingText(isLoading, 'Set Up VeloMetry', 'Setting up...')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.runningContainer}>
            <View style={styles.testingSection}>
              <Text style={styles.testingTitle}>Testing Controls</Text>

              {serviceState === 'passive' && (
                <Pressable style={[styles.button, styles.activeButton]} onPress={handleStartActive} disabled={isLoading}>
                  <Text style={styles.buttonText}>{getLoadingText(isLoading, 'Test Active Tracking', 'Starting...')}</Text>
                </Pressable>
              )}

              {serviceState === 'active' && (
                <Pressable style={[styles.button, styles.secondaryButton]} onPress={handleStopActive} disabled={isLoading}>
                  <Text style={styles.buttonText}>{getLoadingText(isLoading, 'Stop Test Tracking', 'Stopping...')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 960,
    gap: theme.spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: theme.colors.onSurface,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: theme.spacing.lg,
  },
  setupContainer: {
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: 400,
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  setupDescription: {
    fontSize: 16,
    color: theme.colors.onSurface,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 24,
  },
  runningContainer: {
    alignItems: 'center',
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  runningDescription: {
    fontSize: 16,
    color: theme.colors.onSurface,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 24,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  currentStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  statusLabel: {
    fontSize: 16,
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionText: {
    fontSize: 14,
    color: theme.colors.onSurface,
    opacity: 0.8,
  },
  testingSection: {
    width: '100%',
    gap: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  testingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
    opacity: 0.8,
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
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.secondary || '#666666',
  },
  activeButton: {
    backgroundColor: theme.colors.success || '#00aa44',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
