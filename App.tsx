import React, { useState } from 'react';
import { Text, StyleSheet, View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import colours from './colours';
import TitleBar from './TitleBar';

export default function App() {
  const [currentView, setCurrentView] = useState<
    'landing' | 'journey' | 'calibration'
  >('landing');

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <TitleBar onPress={() => setCurrentView('landing')} />
        <Text>Current View: {currentView}</Text>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colours.CardBackground,
  },
});
