import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button } from 'react-native';
import { useEffect, useState } from 'react';
import VehicleMotion from './modules/vehicle-motion';
import type { MotionData } from './modules/vehicle-motion/src/VehicleMotion.types';

export default function App() {
  const [motionData, setMotionData] = useState<MotionData | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    const subscription = VehicleMotion.addListener('onMotionUpdate', (data: MotionData) => {
      setMotionData(data);
    });

    return () => {
      subscription.remove();
      VehicleMotion.stopTracking();
    };
  }, []);

  const toggleTracking = () => {
    if (isTracking) {
      VehicleMotion.stopTracking();
    } else {
      VehicleMotion.startTracking();
    }
    setIsTracking(!isTracking);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vehicle Motion Tracker</Text>
      
      <Button 
        title={isTracking ? 'Stop Tracking' : 'Start Tracking'} 
        onPress={toggleTracking} 
      />

      {motionData && (
        <View style={styles.dataContainer}>
          <Text style={styles.dataText}>X: {motionData.x.toFixed(3)}</Text>
          <Text style={styles.dataText}>Y: {motionData.y.toFixed(3)}</Text>
          <Text style={styles.dataText}>Z: {motionData.z.toFixed(3)}</Text>
          <Text style={styles.dataText}>Pitch: {motionData.pitch.toFixed(3)}</Text>
          <Text style={styles.dataText}>Roll: {motionData.roll.toFixed(3)}</Text>
        </View>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  dataContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  dataText: {
    fontSize: 18,
    marginVertical: 5,
    fontFamily: 'monospace',
  },
});
