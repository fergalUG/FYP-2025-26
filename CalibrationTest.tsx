import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import VehicleMotion from './modules/vehicle-motion';
import {
  MotionData,
  CalibrationStatus,
  CalibrationResult,
  SensorDiagnostics,
} from './modules/vehicle-motion/src/VehicleMotion.types';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import colours from './colours';

const { width } = Dimensions.get('window');

export default function VehicleMotionTest() {
  const [activeTab, setActiveTab] = useState<'calibration' | 'raw' | 'axes'>(
    'calibration'
  );
  const [isActive, setIsActive] = useState(false);
  const [hasRef, setHasRef] = useState(false);
  const [status, setStatus] = useState<CalibrationStatus>({
    status: 'detecting',
    message: 'Idle',
  });
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [motion, setMotion] = useState<MotionData | null>(null);

  // Filter Settings State
  const [alpha, setAlpha] = useState(0.15);
  const [fcMin, setFcMin] = useState(0.2);
  const [fcMax, setFcMax] = useState(2.5);
  const [gyroRef, setGyroRef] = useState(1.5);

  const initialStats = { min: 100, max: -100 }; // Use impossible values to force update on first frame

  const [minMaxX, setMinMaxX] = useState(initialStats);
  const [minMaxY, setMinMaxY] = useState(initialStats);
  const [minMaxZ, setMinMaxZ] = useState(initialStats);
  const [filtMinMaxX, setFiltMinMaxX] = useState(initialStats);
  const [filtMinMaxY, setFiltMinMaxY] = useState(initialStats);
  const [filtMinMaxZ, setFiltMinMaxZ] = useState(initialStats);

  // Sensor diagnostics state
  const [diagnostics, setDiagnostics] = useState<SensorDiagnostics | null>(
    null
  );

  const [isLogging, setIsLogging] = useState(false);
  const isLoggingRef = useRef(false);
  const logBuffer = useRef<string[]>([]);
  const LOG_FILE = new File(Paths.cache, 'motion_logs.csv');

  useEffect(() => {
    isLoggingRef.current = isLogging;
  }, [isLogging]);

  //logging hook
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLogging) {
      if (!LOG_FILE.exists) {
        LOG_FILE.create();
      }
      // Create/Reset file header when starting
      try {
        LOG_FILE.write(
          'timestamp,rawX,rawY,rawZ,filtX,filtY,filtZ,calibratedX,calibratedY,calibratedZ\n'
        );
      } catch (e) {
        console.error('Init log failed', e);
      }

      interval = setInterval(() => {
        if (logBuffer.current.length > 0) {
          const chunk = logBuffer.current.join('');
          logBuffer.current = []; // Clear buffer immediately
          try {
            // Append using FileHandle
            const handle = LOG_FILE.open();
            handle.offset = handle.size; // Seek to end
            // ASCII encoding for CSV
            const bytes = Uint8Array.from(chunk, (c) => c.charCodeAt(0));
            handle.writeBytes(bytes);
            handle.close();
          } catch (e) {
            console.error('Log write failed', e);
          }
        }
      }, 1000); // Write every 1 second
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLogging]);

  const handleToggleLogging = async () => {
    if (isLogging) {
      setIsLogging(false);
      if (logBuffer.current.length > 0) {
        const chunk = logBuffer.current.join('');
        logBuffer.current = [];
        try {
          const handle = LOG_FILE.open();
          handle.offset = handle.size;
          const bytes = Uint8Array.from(chunk, (c) => c.charCodeAt(0));
          handle.writeBytes(bytes);
          handle.close();
        } catch (e) {
          console.error('Final flush failed', e);
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(LOG_FILE.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Motion Logs',
        });
      }
    } else {
      logBuffer.current = [];
      setIsLogging(true);
    }
  };

  // 1. MANAGE LIFECYCLE & LISTENERS
  useEffect(() => {
    let subMotion: any;
    let subStatus: any;
    let subComplete: any;

    if (isActive) {
      // Apply params before starting
      if (VehicleMotion.setFilterAlpha) VehicleMotion.setFilterAlpha(alpha);
      if (VehicleMotion.setFcMin) VehicleMotion.setFcMin(fcMin);
      if (VehicleMotion.setFcMax) VehicleMotion.setFcMax(fcMax);
      if (VehicleMotion.setGyroRef) VehicleMotion.setGyroRef(gyroRef);

      // Start Native Tracking
      VehicleMotion.startTracking();

      // Attach Listeners
      subMotion = VehicleMotion.addListener(
        'onMotionUpdate',
        (data: MotionData) => {
          setMotion(data);
          setHasRef(data.hasReference);

          if (isLoggingRef.current) {
            const line = `${Date.now()},${data.rawX},${data.rawY},${data.rawZ},${data.filteredX},${data.filteredY},${data.filteredZ},${data.x},${data.y},${data.z}\n`;
            logBuffer.current.push(line);
          }

          // Fetch sensor diagnostics on every frame
          if (VehicleMotion.getSensorDiagnostics) {
            const diag = VehicleMotion.getSensorDiagnostics();
            setDiagnostics(diag);
          }

          // Update vibration stats (only if needed, to save renders)
          // We use a functional update to avoid dependency on state
          if (activeTab === 'raw') {
            updateVibrationStats(data);
          }
        }
      );

      subStatus = VehicleMotion.addListener(
        'onCalibrationStatus',
        (data: CalibrationStatus) => {
          setStatus(data);
        }
      );

      subComplete = VehicleMotion.addListener(
        'onCalibrationComplete',
        (data: CalibrationResult) => {
          setResult(data);
          setStatus({ status: 'complete', message: 'Calibration Complete' });
        }
      );
    } else {
      // Ensure stopped if not active
      VehicleMotion.stopTracking();
    }

    // Cleanup
    return () => {
      if (subMotion) subMotion.remove();
      if (subStatus) subStatus.remove();
      if (subComplete) subComplete.remove();

      // Stop tracking when component unmounts or isActive becomes false
      if (isActive) {
        VehicleMotion.stopTracking();
      }
    };
  }, [isActive]); // <--- CRITICAL: Only run this when isActive toggles. Do NOT include 'status'.

  // Helper to extract heavy logic from the effect
  const updateVibrationStats = (data: MotionData) => {
    setMinMaxX((prev) => ({
      min: Math.min(prev.min, data.rawX),
      max: Math.max(prev.max, data.rawX),
    }));
    setMinMaxY((prev) => ({
      min: Math.min(prev.min, data.rawY),
      max: Math.max(prev.max, data.rawY),
    }));
    setMinMaxZ((prev) => ({
      min: Math.min(prev.min, data.rawZ),
      max: Math.max(prev.max, data.rawZ),
    }));
    setFiltMinMaxX((prev) => ({
      min: Math.min(prev.min, data.filteredX),
      max: Math.max(prev.max, data.filteredX),
    }));
    setFiltMinMaxY((prev) => ({
      min: Math.min(prev.min, data.filteredY),
      max: Math.max(prev.max, data.filteredY),
    }));
    setFiltMinMaxZ((prev) => ({
      min: Math.min(prev.min, data.filteredZ),
      max: Math.max(prev.max, data.filteredZ),
    }));
  };

  const handleStartStop = () => {
    // Just toggle state; let useEffect handle the native calls
    if (isActive) {
      setIsActive(false);
      setResult(null);
      setHasRef(false);
      setStatus({ status: 'detecting', message: 'Stopped' });
    } else {
      setIsActive(true);
      setResult(null);
      resetVibrationStats();
    }
  };

  const handleCaptureReference = async () => {
    if (VehicleMotion.captureReference) {
      try {
        await VehicleMotion.captureReference();
        setHasRef(true);
      } catch (error) {
        console.error('Failed to capture reference:', error);
      }
    }
  };

  const updateAlpha = (newVal: number) => {
    const clamped = Math.min(Math.max(newVal, 0.01), 1.0);
    const rounded = Math.round(clamped * 100) / 100;
    setAlpha(rounded);
    if (VehicleMotion.setFilterAlpha) {
      VehicleMotion.setFilterAlpha(rounded);
      resetVibrationStats();
    }
  };

  const resetVibrationStats = () => {
    const resetVal = { min: 100, max: -100 };
    setMinMaxX(resetVal);
    setMinMaxY(resetVal);
    setMinMaxZ(resetVal);
    setFiltMinMaxX(resetVal);
    setFiltMinMaxY(resetVal);
    setFiltMinMaxZ(resetVal);
  };

  // Helper to calculate ranges
  const rawRangeX = minMaxX.max - minMaxX.min;
  const rawRangeY = minMaxY.max - minMaxY.min;
  const rawRangeZ = minMaxZ.max - minMaxZ.min;
  const filtRangeX = filtMinMaxX.max - filtMinMaxX.min;
  const filtRangeY = filtMinMaxY.max - filtMinMaxY.min;
  const filtRangeZ = filtMinMaxZ.max - filtMinMaxZ.min;

  const maxFiltRange = Math.max(filtRangeX, filtRangeY, filtRangeZ);
  const isSafe = maxFiltRange < 0.08;

  function AxisMonitor({
    label,
    value,
    color,
  }: {
    label: string;
    value: number;
    color: string;
  }) {
    const barWidth = Math.min(Math.abs(value) * 100, 100);
    return (
      <View style={{ flex: 1, alignItems: 'center', padding: 10 }}>
        <Text style={styles.diagLabel}>{label}</Text>
        <Text style={[styles.diagValue, { color }]}>{value.toFixed(3)} G</Text>
        <View
          style={{
            height: 4,
            width: '100%',
            backgroundColor: colours.BorderColor,
            borderRadius: 2,
            marginTop: 4,
          }}
        >
          <View
            style={{
              height: 4,
              width: `${barWidth}%`,
              backgroundColor: color,
              alignSelf: value >= 0 ? 'flex-start' : 'flex-end',
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'calibration' && styles.activeTab,
            ]}
            onPress={() => setActiveTab('calibration')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'calibration' && styles.activeTabText,
              ]}
            >
              Calibration
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'axes' && styles.activeTab]}
            onPress={() => setActiveTab('axes')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'axes' && styles.activeTabText,
              ]}
            >
              Axes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'raw' && styles.activeTab]}
            onPress={() => setActiveTab('raw')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'raw' && styles.activeTabText,
              ]}
            >
              Vibration (Raw)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: isActive ? colours.Error : colours.Success,
              marginBottom: 20,
            },
          ]}
          onPress={handleStartStop}
        >
          <TouchableOpacity
            style={[
              styles.btn,
              {
                backgroundColor: isLogging ? colours.Warning : colours.AccentColor,
                marginBottom: 20,
              },
            ]}
            onPress={handleToggleLogging}
          >
            <Text style={styles.btnText}>
              {isLogging ? 'STOP & SHARE LOGS' : 'START DATA LOGGING'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.btnText}>
            {isActive ? 'STOP SENSORS' : 'START SENSORS'}
          </Text>
        </TouchableOpacity>

        {activeTab === 'axes' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Coordinate Transformation</Text>
              <Text style={styles.desc}>
                Compare the Phone's raw movement against the Vehicle's
                calibrated frame. Drive straight: you should see the signal move
                from Raw X/Y into pure Calibrated Y.
              </Text>

              {/* Comparison Table Header */}
              <View style={styles.comparisonHeader}>
                <Text style={styles.columnLabel}>PHONE FRAME (RAW)</Text>
                <View style={{ width: 20 }} />
                <Text style={styles.columnLabel}>VEHICLE FRAME (CAL)</Text>
              </View>

              {/* X-Axis Comparison (Lateral) */}
              <View style={styles.comparisonRow}>
                <AxisMonitor
                  label="Raw X"
                  value={motion?.rawX ?? 0}
                  color={colours.SecondaryText}
                />
                <View style={styles.transformArrow}>
                  <Text>→</Text>
                </View>
                <AxisMonitor
                  label="Lateral (X)"
                  value={motion?.x ?? 0}
                  color={colours.AxisX}
                />
              </View>

              {/* Y-Axis Comparison (Longitudinal) */}
              <View style={styles.comparisonRow}>
                <AxisMonitor
                  label="Raw Y"
                  value={motion?.rawY ?? 0}
                  color={colours.SecondaryText}
                />
                <View style={styles.transformArrow}>
                  <Text>→</Text>
                </View>
                <AxisMonitor
                  label="Forward (Y)"
                  value={motion?.y ?? 0}
                  color={colours.AxisY}
                />
              </View>

              {/* Z-Axis Comparison (Vertical) */}
              <View style={styles.comparisonRow}>
                <AxisMonitor
                  label="Raw Z"
                  value={motion?.rawZ ?? 0}
                  color={colours.SecondaryText}
                />
                <View style={styles.transformArrow}>
                  <Text>→</Text>
                </View>
                <AxisMonitor
                  label="Vertical (Z)"
                  value={motion?.z ?? 0}
                  color={colours.AxisZ}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.stepTitle}>Calibration Integrity</Text>
              <View style={styles.statRow}>
                <Text style={styles.label}>Status:</Text>
                <Text
                  style={[
                    styles.value,
                    { color: motion?.isCalibrated ? colours.Success : colours.Error },
                  ]}
                >
                  {motion?.isCalibrated ? 'ACTIVE' : 'NOT CALIBRATED'}
                </Text>
              </View>
              <Text style={styles.smallDesc}>
                {motion?.isCalibrated
                  ? 'The rotation matrix is currently remapping your sensor data.'
                  : 'Showing raw user acceleration on both sides until calibration completes.'}
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'raw' && (
          <View>
            {/* FILTER TUNER CARD */}
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Gyro-Adaptive Filter</Text>
              <Text style={styles.desc}>
                Uses gyro to adapt cutoff frequency. Lower alpha = more
                vibration attenuation. Higher alpha = more responsive to real
                motion.
              </Text>

              <View style={styles.tunerRow}>
                <TouchableOpacity
                  onPress={() => updateAlpha(alpha - 0.05)}
                  style={styles.tuneBtn}
                >
                  <Text style={styles.tuneBtnText}>-</Text>
                </TouchableOpacity>

                <View style={styles.alphaDisplay}>
                  <Text style={styles.alphaValue}>{alpha.toFixed(2)}</Text>
                  <Text style={styles.alphaLabel}>CURRENT ALPHA</Text>
                </View>

                <TouchableOpacity
                  onPress={() => updateAlpha(alpha + 0.05)}
                  style={styles.tuneBtn}
                >
                  <Text style={styles.tuneBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.presetRow}>
                <TouchableOpacity
                  onPress={() => updateAlpha(0.05)}
                  style={[
                    styles.presetBtn,
                    alpha === 0.05 && styles.presetActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      alpha === 0.05 && styles.presetTextActive,
                    ]}
                  >
                    Smooth (0.05)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateAlpha(0.15)}
                  style={[
                    styles.presetBtn,
                    alpha === 0.15 && styles.presetActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      alpha === 0.15 && styles.presetTextActive,
                    ]}
                  >
                    Balanced (0.15)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateAlpha(0.5)}
                  style={[
                    styles.presetBtn,
                    alpha === 0.5 && styles.presetActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      alpha === 0.5 && styles.presetTextActive,
                    ]}
                  >
                    Reactive (0.50)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ADVANCED TUNABLES CARD */}
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Advanced Tunables</Text>

              {/* fcMin Control */}
              <View style={styles.advancedRow}>
                <View style={styles.advancedLabel}>
                  <Text style={styles.label}>fcMin (Hz)</Text>
                  <Text style={styles.smallDesc}>
                    Cutoff when idle/vibrating
                  </Text>
                </View>
                <View style={styles.advancedControl}>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.max(0.01, fcMin - 0.1);
                      setFcMin(newVal);
                      if (VehicleMotion.setFcMin)
                        VehicleMotion.setFcMin(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.advancedValue}>{fcMin.toFixed(2)}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.min(2.0, fcMin + 0.1);
                      setFcMin(newVal);
                      if (VehicleMotion.setFcMin)
                        VehicleMotion.setFcMin(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* fcMax Control */}
              <View style={styles.advancedRow}>
                <View style={styles.advancedLabel}>
                  <Text style={styles.label}>fcMax (Hz)</Text>
                  <Text style={styles.smallDesc}>Cutoff during motion</Text>
                </View>
                <View style={styles.advancedControl}>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.max(0.5, fcMax - 0.5);
                      setFcMax(newVal);
                      if (VehicleMotion.setFcMax)
                        VehicleMotion.setFcMax(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.advancedValue}>{fcMax.toFixed(2)}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.min(10.0, fcMax + 0.5);
                      setFcMax(newVal);
                      if (VehicleMotion.setFcMax)
                        VehicleMotion.setFcMax(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* gyroRef Control */}
              <View style={styles.advancedRow}>
                <View style={styles.advancedLabel}>
                  <Text style={styles.label}>Gyro Ref (rad/s)</Text>
                  <Text style={styles.smallDesc}>Gyro threshold for fcMax</Text>
                </View>
                <View style={styles.advancedControl}>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.max(0.1, gyroRef - 0.1);
                      setGyroRef(newVal);
                      if (VehicleMotion.setGyroRef)
                        VehicleMotion.setGyroRef(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.advancedValue}>{gyroRef.toFixed(2)}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const newVal = Math.min(5.0, gyroRef + 0.1);
                      setGyroRef(newVal);
                      if (VehicleMotion.setGyroRef)
                        VehicleMotion.setGyroRef(newVal);
                    }}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* NOISE ANALYSIS CARD */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.stepTitle}>Noise Envelope (All Axes)</Text>
                <TouchableOpacity onPress={resetVibrationStats}>
                  <Text style={styles.link}>Reset</Text>
                </TouchableOpacity>
              </View>
              {/* ... stats display code unchanged ... */}
              <View style={styles.statRow}>
                <Text style={styles.label}>Max Range (Any Axis)</Text>
                <Text
                  style={[
                    styles.value,
                    {
                      color: isSafe ? colours.Success : colours.Warning,
                      fontWeight: '800',
                    },
                  ]}
                >
                  {maxFiltRange.toFixed(4)} G
                </Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'calibration' && (
          <View>
            <View style={[styles.card, { opacity: isActive ? 1 : 0.5 }]}>
              <Text style={styles.stepTitle}>Step 1: Reference</Text>
              <Text style={styles.desc}>
                Align phone and press capture while stationary.
              </Text>
              <TouchableOpacity
                style={[
                  styles.btn,
                  { backgroundColor: colours.AccentColor, paddingVertical: 10 },
                ]}
                onPress={handleCaptureReference}
                disabled={!isActive}
              >
                <Text style={styles.btnText}>
                  {hasRef ? '✓ Reference Captured' : 'Capture Manual Reference'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { opacity: hasRef ? 1 : 0.5 }]}>
              <Text style={styles.stepTitle}>Step 2: Drive</Text>
              <Text style={styles.statusText}>
                Status: {status.status.toUpperCase()}
              </Text>
              <Text style={styles.desc}>{status.message}</Text>

              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <View
                    style={{
                      ...styles.progressBar,
                      width: `${Math.max((status.progress ?? 0) * 100, 1)}%`,
                      backgroundColor:
                        (status.progress ?? 0) > 0 ? colours.AccentColor : colours.BorderColor,
                    }}
                  />
                </View>
                <Text style={styles.progressText}>
                  {Math.round((status.progress ?? 0) * 100)}%
                </Text>
              </View>
            </View>

            {/* SENSOR DIAGNOSTICS CARD */}
            {isActive && diagnostics && (
              <View style={styles.card}>
                <Text style={styles.stepTitle}>Sensor Quality</Text>

                <View style={styles.diagRow}>
                  <View style={styles.diagCol}>
                    <Text style={styles.diagLabel}>Accel Magnitude</Text>
                    <Text
                      style={[
                        styles.diagValue,
                        {
                          color: diagnostics.isAccelInRange
                            ? colours.Success
                            : colours.Error,
                        },
                      ]}
                    >
                      {diagnostics.accelMagnitude.toFixed(3)} G
                    </Text>
                  </View>

                  <View style={styles.diagCol}>
                    <Text style={styles.diagLabel}>Accel Stability</Text>
                    <Text
                      style={[
                        styles.diagValue,
                        {
                          color: diagnostics.isAccelStable
                            ? colours.Success
                            : colours.Error,
                        },
                      ]}
                    >
                      {(diagnostics.accelStability * 100).toFixed(1)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.diagCaption}>
                  {diagnostics.rejectionReason === 'accel_low'
                    ? '⚠ Accelerate more'
                    : diagnostics.rejectionReason === 'accel_unstable'
                      ? '⚠ Too bumpy / unstable'
                      : diagnostics.rejectionReason === 'turning'
                        ? '⚠ Drive straight'
                        : '✓ Good Conditions'}
                </Text>
              </View>
            )}

            {result && (
              <View style={[styles.card, styles.resultCard]}>
                <Text style={styles.stepTitle}>Calibration Results</Text>
                {/* Result display code unchanged */}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colours.MainBackground },
  headerContainer: { padding: 20, paddingBottom: 10, backgroundColor: colours.CardBackground },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colours.BorderColor,
    borderRadius: 10,
    padding: 2,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeTab: {
    backgroundColor: colours.CardBackground,
    shadowColor: colours.ShadowColor,
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: { fontWeight: '600', color: colours.SecondaryText },
  activeTabText: { color: colours.PrimaryText },
  scroll: { padding: 20 },
  card: {
    backgroundColor: colours.CardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  resultCard: { borderLeftWidth: 4, borderLeftColor: colours.Success },
  stepTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: colours.PrimaryText },
  desc: { color: colours.SecondaryText, marginBottom: 12 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: colours.AltText, fontWeight: '700', fontSize: 16 },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.AccentColor,
    marginBottom: 4,
  },
  progressContainer: { marginTop: 10 },
  progressTrack: {
    height: 10,
    backgroundColor: colours.BorderColor,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', backgroundColor: colours.AccentColor },
  progressText: {
    textAlign: 'right',
    marginTop: 4,
    color: colours.AccentColor,
    fontWeight: 'bold',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    alignItems: 'center',
  },
  label: { color: colours.SecondaryText, fontSize: 16 },
  value: { fontWeight: '700', fontSize: 16, color: colours.PrimaryText },
  divider: { height: 1, backgroundColor: colours.BorderColor, marginVertical: 12 },
  link: { color: colours.AccentColor, fontWeight: '600' },
  tunerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  tuneBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colours.BorderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuneBtnText: { fontSize: 30, fontWeight: '600', color: colours.AccentColor },
  alphaDisplay: { alignItems: 'center', marginHorizontal: 20, width: 120 },
  alphaValue: { fontSize: 36, fontWeight: '800', color: colours.PrimaryText },
  alphaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colours.SecondaryText,
    letterSpacing: 1,
  },
  presetRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  presetBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colours.MainBackground,
    borderRadius: 8,
    alignItems: 'center',
  },
  presetActive: { backgroundColor: colours.AccentColor },
  presetText: { fontWeight: '600', color: colours.SecondaryText, fontSize: 12 },
  presetTextActive: { color: colours.AltText },
  advancedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  advancedLabel: { flex: 1 },
  smallDesc: { fontSize: 12, color: colours.SecondaryText, marginTop: 2 },
  advancedControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  advancedValue: {
    fontWeight: '700',
    fontSize: 18,
    minWidth: 50,
    textAlign: 'center',
    color: colours.PrimaryText,
  },
  smallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colours.BorderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { fontSize: 20, fontWeight: '600', color: colours.AccentColor },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  diagCol: { flex: 1, marginRight: 8 },
  diagLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colours.SecondaryText,
    marginBottom: 4,
  },
  diagValue: { fontSize: 18, fontWeight: '800', marginBottom: 2, color: colours.PrimaryText },
  diagCaption: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.SecondaryText,
    textAlign: 'center',
    marginTop: 4,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colours.SecondaryText,
    letterSpacing: 1,
    flex: 1,
    textAlign: 'center',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: colours.MainBackground,
    borderRadius: 8,
    padding: 5,
  },
  transformArrow: {
    width: 20,
    alignItems: 'center',
  },
});
