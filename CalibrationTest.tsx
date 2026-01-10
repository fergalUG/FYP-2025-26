import React, { useEffect, useState } from 'react';
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
  CalibrationResult 
} from './modules/vehicle-motion/src/VehicleMotion.types';

const { width } = Dimensions.get('window');

export default function VehicleMotionTest() {
  const [activeTab, setActiveTab] = useState<'calibration' | 'raw'>('calibration');
  const [isActive, setIsActive] = useState(false);
  const [hasRef, setHasRef] = useState(false);
  const [status, setStatus] = useState<CalibrationStatus>({ status: 'detecting', message: 'Idle' });
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [motion, setMotion] = useState<MotionData | null>(null);

  // Track both Raw and Filtered Envelopes
  const [vibrationStats, setVibrationStats] = useState({
    rawMin: 0, rawMax: 0,
    filtMin: 0, filtMax: 0
  });

  useEffect(() => {
    const subMotion = VehicleMotion.addListener('onMotionUpdate', (data: MotionData) => {
      setMotion(data);
      setHasRef(data.hasReference);

      if (activeTab === 'raw') {
        setVibrationStats(prev => ({
          rawMin: Math.min(prev.rawMin, data.rawZ),
          rawMax: Math.max(prev.rawMax, data.rawZ),
          filtMin: Math.min(prev.filtMin, data.filteredZ || 0), // Handle potential undefined on first render
          filtMax: Math.max(prev.filtMax, data.filteredZ || 0)
        }));
      }
    });

    const subStatus = VehicleMotion.addListener('onCalibrationStatus', (data: CalibrationStatus) => {
      setStatus(data);
    });

    const subComplete = VehicleMotion.addListener('onCalibrationComplete', (data: CalibrationResult) => {
      setResult(data);
      setStatus({ status: 'complete', message: 'Calibration Complete' });
    });

    return () => {
      subMotion.remove();
      subStatus.remove();
      subComplete.remove();
      VehicleMotion.stopTracking();
    };
  }, [activeTab]);

  const handleStartStop = () => {
    if (isActive) {
      VehicleMotion.stopTracking();
      setIsActive(false);
      setResult(null);
      setHasRef(false);
      setStatus({ status: 'detecting', message: 'Stopped' });
    } else {
      VehicleMotion.startTracking();
      setIsActive(true);
      setResult(null);
      resetVibrationStats();
    }
  };

  const handleCaptureReference = () => {
    if (VehicleMotion.captureReference) VehicleMotion.captureReference();
  };

  const resetVibrationStats = () => {
    setVibrationStats({ rawMin: 0, rawMax: 0, filtMin: 0, filtMax: 0 });
  };

  // Helper to calculate ranges
  const rawRange = vibrationStats.rawMax - vibrationStats.rawMin;
  const filtRange = vibrationStats.filtMax - vibrationStats.filtMin;
  const isSafe = filtRange < 0.08;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.mainTitle}>Vehicle Motion</Text>
        <View style={styles.tabs}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'calibration' && styles.activeTab]} 
            onPress={() => setActiveTab('calibration')}
          >
            <Text style={[styles.tabText, activeTab === 'calibration' && styles.activeTabText]}>Calibration</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'raw' && styles.activeTab]} 
            onPress={() => setActiveTab('raw')}
          >
            <Text style={[styles.tabText, activeTab === 'raw' && styles.activeTabText]}>Vibration (Raw)</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: isActive ? '#FF3B30' : '#34C759', marginBottom: 20 }]}
          onPress={handleStartStop}
        >
          <Text style={styles.btnText}>{isActive ? 'STOP SENSORS' : 'START SENSORS'}</Text>
        </TouchableOpacity>

        {activeTab === 'raw' && (
        <View>
          <Text style={styles.sectionHeader}>DSP & Noise Analysis</Text>
          <Text style={styles.desc}>
            Comparing Raw vs Filtered Signal. Target: Filtered Range &lt; 0.08G.
          </Text>

          {/* SIDE-BY-SIDE CARDS */}
          <View style={styles.dspContainer}>
            {/* X Axis */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.axisLabel}>X-Axis</Text>
              </View>
              <View style={styles.row}>
                <View>
                  <Text style={styles.dspLabel}>Raw</Text>
                  <Text style={styles.rawVal}>{motion?.rawX.toFixed(4)}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View>
                  <Text style={styles.dspLabel}>Filtered</Text>
                  <Text style={styles.filteredVal}>{motion?.filteredX?.toFixed(4)}</Text>
                </View>
              </View>
            </View>

            {/* Y Axis */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.axisLabel}>Y-Axis</Text>
              </View>
              <View style={styles.row}>
                <View>
                  <Text style={styles.dspLabel}>Raw</Text>
                  <Text style={styles.rawVal}>{motion?.rawY.toFixed(4)}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View>
                  <Text style={styles.dspLabel}>Filtered</Text>
                  <Text style={styles.filteredVal}>{motion?.filteredY?.toFixed(4)}</Text>
                </View>
              </View>
            </View>

            {/* Z Axis */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.axisLabel}>Z-Axis</Text>
              </View>
              <View style={styles.row}>
                <View>
                  <Text style={styles.dspLabel}>Raw</Text>
                  <Text style={styles.rawVal}>{motion?.rawZ.toFixed(4)}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View>
                  <Text style={styles.dspLabel}>Filtered</Text>
                  <Text style={styles.filteredVal}>{motion?.filteredZ?.toFixed(4)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* VIBRATION STATS */}
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.stepTitle}>Noise Envelope (Z-Axis)</Text>
              <TouchableOpacity onPress={resetVibrationStats}>
                <Text style={styles.link}>Reset</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.label}>Raw Range</Text>
              <Text style={[styles.value, { color: rawRange > 0.08 ? '#FF3B30' : '#8E8E93' }]}>
                {rawRange.toFixed(4)} G
              </Text>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.label}>Filtered Range</Text>
              <Text style={[styles.value, { color: isSafe ? '#34C759' : '#FF9500' }]}>
                {filtRange.toFixed(4)} G
              </Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: isSafe ? '#E8F5E9' : '#FFEBEE' }]}>
               <Text style={[styles.statusTextBadge, { color: isSafe ? '#2E7D32' : '#C62828' }]}>
                 {isSafe ? "✓ CALIBRATION SAFE" : "⚠ NOISE TOO HIGH"}
               </Text>
            </View>
          </View>
        </View>
      )}

        {activeTab === 'calibration' && (
          <View>
            <View style={[styles.card, { opacity: isActive ? 1 : 0.5 }]}>
              <Text style={styles.stepTitle}>Step 1: Reference</Text>
              <Text style={styles.desc}>Align phone and press capture while stationary.</Text>
              <TouchableOpacity 
                style={[styles.btn, { backgroundColor: '#007AFF', paddingVertical: 10 }]}
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
            <Text style={styles.statusText}>Status: {status.status.toUpperCase()}</Text>
            <Text style={styles.desc}>{status.message}</Text>
            
            {status.progress !== undefined && (
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <View style={{ 
                    ...styles.progressBar, 
                    width: `${Math.max(status.progress * 100, 1)}%`,
                    backgroundColor: status.progress > 0 ? '#007AFF' : '#C7C7CC'
                  }} />
                </View>
                <Text style={styles.progressText}>{Math.round(status.progress * 100)}%</Text>
              </View>
            )}
          </View>

            {result && (
              <View style={[styles.card, styles.resultCard]}>
                <Text style={styles.stepTitle}>Calibration Results</Text>
                {result.errors ? (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.label}>Forward Deviation</Text>
                      <Text style={[styles.value, { color: result.errors.forwardError > 5 ? 'red' : 'green' }]}>
                        {result.errors.forwardError.toFixed(2)}°
                      </Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>Vertical Deviation</Text>
                      <Text style={[styles.value, { color: result.errors.verticalError > 5 ? 'red' : 'green' }]}>
                        {result.errors.verticalError.toFixed(2)}°
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.errorText}>No Reference Captured</Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  headerContainer: { padding: 20, paddingBottom: 10, backgroundColor: '#FFF' },
  mainTitle: { fontSize: 24, fontWeight: '800', marginBottom: 15 },
  tabs: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 10, padding: 2 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontWeight: '600', color: '#8E8E93' },
  activeTabText: { color: '#000' },

  scroll: { padding: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  resultCard: { borderLeftWidth: 4, borderLeftColor: '#34C759' },
  stepTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sectionHeader: { fontSize: 20, fontWeight: '700', marginBottom: 10, color: '#333' },
  desc: { color: '#666', marginBottom: 12 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  statusText: { fontSize: 16, fontWeight: '600', color: '#007AFF', marginBottom: 4 },
  
  progressContainer: { marginTop: 10 },
  progressTrack: { height: 10, backgroundColor: '#E5E5EA', borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#007AFF' },
  progressText: { textAlign: 'right', marginTop: 4, color: '#007AFF', fontWeight: 'bold', fontSize: 12 },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  label: { color: '#666', fontSize: 16 },
  value: { fontWeight: '700', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 12 },
  link: { color: '#007AFF', fontWeight: '600' },
  errorText: { color: '#FF3B30', marginTop: 8, fontWeight: '600' },

  dspContainer: { gap: 10 },
  axisLabel: { fontSize: 18, fontWeight: '800', color: '#000' },
  dspLabel: { fontSize: 12, color: '#8E8E93', marginBottom: 2 },
  rawVal: { fontSize: 20, fontWeight: '600', color: '#FF3B30', width: 100 },
  filteredVal: { fontSize: 20, fontWeight: '600', color: '#34C759', width: 100 },
  dividerVertical: { width: 1, backgroundColor: '#E5E5EA', height: '100%', marginHorizontal: 10 },

  statusBadge: { padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  statusTextBadge: { fontWeight: '800', fontSize: 14 }
});