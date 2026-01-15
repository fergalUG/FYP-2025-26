import React, { useState } from 'react';
import { StyleSheet, View, StatusBar, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import colours from './colours';
import TitleBar from './TitleBar';
import CalibrationTest from './CalibrationTest';
import LandingPageView from './LandingPageView';
import JourneyView from './JourneyView';
import HoverButton from './HoverButton';

export default function App() {
  const [currentView, setCurrentView] = useState<
    'landing' | 'journey' | 'calibration'
  >('landing');

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <TitleBar onPress={() => setCurrentView('landing')} />

        {currentView === 'landing' && <LandingPageView />}
        {currentView === 'journey' && <JourneyView />}
        {currentView === 'calibration' && <CalibrationTest />}

        <HoverButton
          text="TEST"
          onPress={() => setCurrentView('calibration')}
          bottom={30}
          left={30}
        />
        <HoverButton
          text="GO"
          onPress={() => setCurrentView('journey')}
          bottom={30}
          right={30}
        />
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
