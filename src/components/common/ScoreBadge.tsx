import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks';

interface ScoreBadgeProps {
  score: number;
  color: string;
  size?: number;
  label?: string;
}

export const ScoreBadge = (props: ScoreBadgeProps) => {
  const { score, color, size = 72, label = 'Score' } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const radius = Math.round(size * 0.25);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <Text style={styles.scoreValue}>{Math.round(score)}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreValue: {
      fontSize: 24,
      fontWeight: '900',
      color: theme.colors.background,
    },
    scoreLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.background,
      opacity: 0.9,
    },
  });
