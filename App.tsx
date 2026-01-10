import React from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import CalibrationTest from './CalibrationTest';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <CalibrationTest />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
});