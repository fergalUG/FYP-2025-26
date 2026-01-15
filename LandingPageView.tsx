import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colours from './colours';

export default function LandingPageView() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Landing Page!</Text>
        <Text style={styles.subtitle}>
          Your recent journeys and stats will appear here soon.
        </Text>
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>TODO: Dashboard Widgets</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  card: {
    backgroundColor: colours.MainBackground,
    borderRadius: 12,
    padding: 24,
    shadowColor: colours.PrimaryText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colours.PrimaryText,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colours.SecondaryText,
    marginBottom: 24,
    lineHeight: 22,
  },
  placeholderBox: {
    height: 150,
    backgroundColor: colours.CardBackground,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#8E8E93',
    fontWeight: '600',
  },
});
