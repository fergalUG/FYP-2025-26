import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../theme';

interface DrivingScoreWheelProps {
  score: number;
  size?: number;
}

export const DrivingScoreWheel: React.FC<DrivingScoreWheelProps> = ({ score, size = 200 }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = React.useState(0);

  useEffect(() => {
    const listener = animatedValue.addListener(({ value }) => {
      setDisplayScore(Math.round(value * score));
    });

    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    return () => animatedValue.removeListener(listener);
  }, [animatedValue, score]);

  const radius = (size - 20) / 2;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;

  const getScoreColor = (score: number): string => {
    if (score >= 80) return theme.colors.score.excellent;
    if (score >= 60) return theme.colors.score.good;
    if (score >= 40) return theme.colors.score.fair;
    return theme.colors.score.poor;
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const scoreColor = getScoreColor(score);
  const centerX = size / 2;
  const centerY = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={centerX} cy={centerY} r={radius} stroke={theme.colors.disabled} strokeWidth={strokeWidth} fill="none" />

        <Circle
          cx={centerX}
          cy={centerY}
          r={radius}
          stroke={scoreColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${centerX} ${centerY})`}
        />
      </Svg>

      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreText, { color: scoreColor }]}>{displayScore}</Text>
        <Text style={styles.maxScoreText}>/ 100</Text>
        <Text style={[styles.labelText, { color: scoreColor }]}>{getScoreLabel(score)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scoreContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 42,
  },
  maxScoreText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: -4,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
