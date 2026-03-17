import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getDebugLogsEnabled,
  getDebugOverlay,
  getMapMarkerDebugMetadataEnabled,
  getSpeedLimitDetectionEnabled,
  setDebugLogsEnabled as saveDebugLogsEnabled,
  setDebugOverlay as saveDebugOverlayEnabled,
  setMapMarkerDebugMetadataEnabled as saveMapMarkerDebugMetadataEnabled,
  setSpeedLimitDetectionEnabled as saveSpeedLimitDetectionEnabled,
} from '@services/SettingsService';
import { addLogListener, createLogger, LogModule, setDebugEnabled } from '@utils/logger';

interface AppSettingsState {
  debugOverlayEnabled: boolean;
  debugLogsEnabled: boolean;
  mapMarkerDebugMetadataEnabled: boolean;
  speedLimitDetectionEnabled: boolean;
}

interface AppSettingsContextType {
  settings: AppSettingsState;
  setDebugOverlayEnabled: (enabled: boolean) => Promise<void>;
  setDebugLogsEnabled: (enabled: boolean) => Promise<void>;
  setMapMarkerDebugMetadataEnabled: (enabled: boolean) => Promise<void>;
  setSpeedLimitDetectionEnabled: (enabled: boolean) => Promise<void>;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = SCREEN_HEIGHT * 0.8;
const MAX_LOG_LINES = 100;

const logger = createLogger(LogModule.Hooks);

const defaultSettings: AppSettingsState = {
  debugOverlayEnabled: false,
  debugLogsEnabled: true,
  mapMarkerDebugMetadataEnabled: false,
  speedLimitDetectionEnabled: false,
};

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: defaultSettings,
  setDebugOverlayEnabled: async () => {},
  setDebugLogsEnabled: async () => {},
  setMapMarkerDebugMetadataEnabled: async () => {},
  setSpeedLimitDetectionEnabled: async () => {},
});

export const useAppSettings = () => useContext(AppSettingsContext);

export const AppSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<AppSettingsState>(defaultSettings);
  const [logs, setLogs] = useState<string[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const overlayHeight = useRef(new Animated.Value(200)).current;
  const lastHeight = useRef(200);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newHeight = lastHeight.current - gestureState.dy;

        if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT) {
          overlayHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        lastHeight.current = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, lastHeight.current - gestureState.dy));
      },
    })
  ).current;

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const [debugOverlayEnabled, debugLogsEnabled, mapMarkerDebugMetadataEnabled, speedLimitDetectionEnabled] = await Promise.all([
          getDebugOverlay(),
          getDebugLogsEnabled(),
          getMapMarkerDebugMetadataEnabled(),
          getSpeedLimitDetectionEnabled(),
        ]);

        if (!isMounted) {
          return;
        }

        setSettings({
          debugOverlayEnabled,
          debugLogsEnabled,
          mapMarkerDebugMetadataEnabled,
          speedLimitDetectionEnabled,
        });
        setDebugEnabled(debugLogsEnabled);
      } catch (error) {
        logger.warn('Failed to load app settings:', error);
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settings.debugOverlayEnabled) {
      setLogs([]);
      return;
    }

    const unsubscribe = addLogListener((message) => {
      setLogs((previous) => [message, ...previous].slice(0, MAX_LOG_LINES));
    });

    return unsubscribe;
  }, [settings.debugOverlayEnabled]);

  const setDebugOverlayEnabled = async (enabled: boolean) => {
    setSettings((previous) => ({ ...previous, debugOverlayEnabled: enabled }));
    await saveDebugOverlayEnabled(enabled);
  };

  const setDebugLogsEnabled = async (enabled: boolean) => {
    setSettings((previous) => ({ ...previous, debugLogsEnabled: enabled }));
    setDebugEnabled(enabled);
    await saveDebugLogsEnabled(enabled);
  };

  const setMapMarkerDebugMetadataEnabled = async (enabled: boolean) => {
    setSettings((previous) => ({ ...previous, mapMarkerDebugMetadataEnabled: enabled }));
    await saveMapMarkerDebugMetadataEnabled(enabled);
  };

  const setSpeedLimitDetectionEnabled = async (enabled: boolean) => {
    setSettings((previous) => ({ ...previous, speedLimitDetectionEnabled: enabled }));
    await saveSpeedLimitDetectionEnabled(enabled);
  };

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        setDebugOverlayEnabled,
        setDebugLogsEnabled,
        setMapMarkerDebugMetadataEnabled,
        setSpeedLimitDetectionEnabled,
      }}
    >
      {children}
      {settings.debugOverlayEnabled && (
        <View style={styles.overlayContainer} pointerEvents="box-none">
          <Animated.View style={[styles.logWindow, isMinimized ? styles.minimizedWindow : { height: overlayHeight }]}>
            <View style={styles.header} {...panResponder.panHandlers}>
              <View style={styles.dragIndicator} />
              <Text style={styles.headerTitle}>Debug Logs</Text>
              <Pressable onPress={() => setIsMinimized((previous) => !previous)} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>{isMinimized ? 'EXPAND' : 'MINIMIZE'}</Text>
              </Pressable>
            </View>

            {!isMinimized && (
              <ScrollView style={styles.scrollArea}>
                {logs.map((log, index) => (
                  <Text key={index} style={styles.logText}>
                    {log}
                  </Text>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}
    </AppSettingsContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-end',
    paddingBottom: 40,
    pointerEvents: 'box-none',
  },
  logWindow: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    marginHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
    overflow: 'hidden',
  },
  minimizedWindow: {
    height: 40,
    width: 150,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  headerButton: {
    padding: 4,
    backgroundColor: '#444',
    borderRadius: 4,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 10,
  },
  scrollArea: {
    padding: 8,
  },
  logText: {
    color: '#00FF00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    marginBottom: 2,
  },
  dragIndicator: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#666',
  },
});
