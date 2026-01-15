import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colours from './colours';

export default function JourneyView() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Journey View Coming Soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colours.CardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    color: colours.PrimaryText,
  },
});
