import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@hooks';
import * as JourneyService from '@services/JourneyService';

export default function Settings() {
  const { theme, mode, toggleMode } = useTheme();
  const [exporting, setExporting] = useState(false);
  const styles = createStyles(theme);

  const handleExportDatabase = async () => {
    setExporting(true);
    await JourneyService.exportDatabase();
    setExporting(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          <MaterialIcons name="account-circle" size={64} color={theme.colors.primary} />
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>Driver Profile</Text>
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
              trackColor={{ false: theme.colors.outline, true: theme.colors.primary }}
              thumbColor={mode === 'dark' ? theme.colors.surface : theme.colors.background}
            />
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug</Text>
        <View style={styles.card}>
          <Text style={styles.itemTitle}>Export Database</Text>
          <Text style={styles.itemSubtitle}>Download a copy of journey data.</Text>
          <Pressable
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
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      padding: theme.spacing.lg,
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
