import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, PanResponder, Animated, Dimensions } from 'react-native';

import { addLogListener } from '@utils/logger';
import { getDebugOverlay, setDebugOverlay as saveSetting } from '@services/SettingsService';

interface DebugContextType {
  isEnabled: boolean;
  toggleOverlay: (value: boolean) => Promise<void>;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = SCREEN_HEIGHT * 0.8;

const DebugContext = createContext<DebugContextType>({
  isEnabled: false,
  toggleOverlay: async () => {},
});

export const useDebugOverlay = () => useContext(DebugContext);

export const DebugOverlayProvider = ({ children }: { children: React.ReactNode }) => {
  const [isEnabled, setIsEnabled] = useState(false);
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
    getDebugOverlay().then(setIsEnabled);
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      setLogs([]);
      return;
    }

    const unsubscribe = addLogListener((msg) => {
      setLogs((prev) => [msg, ...prev].slice(0, 50));
    });

    return unsubscribe;
  }, [isEnabled]);

  const toggleOverlay = async (value: boolean) => {
    setIsEnabled(value);
    await saveSetting(value);
  };

  return (
    <DebugContext.Provider value={{ isEnabled, toggleOverlay }}>
      {children}
      {isEnabled && (
        <View style={styles.overlayContainer} pointerEvents="box-none">
          {/* 3. Wrap the window in Animated.View */}
          <Animated.View style={[styles.logWindow, isMinimized ? styles.minimizedWindow : { height: overlayHeight }]}>
            {/* 4. Attach panHandlers to the header for dragging */}
            <View style={styles.header} {...panResponder.panHandlers}>
              <View style={styles.dragIndicator} />
              <Text style={styles.headerTitle}>Debug Logs</Text>
              <Pressable onPress={() => setIsMinimized(!isMinimized)} style={styles.headerBtn}>
                <Text style={styles.headerBtnText}>{isMinimized ? 'EXPAND' : 'MINIMIZE'}</Text>
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
    </DebugContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999, // ensure it sits on top of everything
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
    alignSelf: 'flex-end',
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
  headerBtn: {
    padding: 4,
    backgroundColor: '#444',
    borderRadius: 4,
  },
  headerBtnText: {
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
