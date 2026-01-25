import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@hooks';

interface DrivingScoreWheelProps {
  score: number;
  size?: number;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
};

const interpolateColor = (color1: string, color2: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const r = r1 + (r2 - r1) * t;
  const g = g1 + (g2 - g1) * t;
  const b = b1 + (b2 - b1) * t;

  return rgbToHex(r, g, b);
};

const getAnimatedColor = (score: number, theme: ReturnType<typeof useTheme>['theme']): string => {
  if (score <= 40) {
    return interpolateColor(theme.colors.score.poor, theme.colors.score.fair, score / 40);
  } else if (score <= 60) {
    return interpolateColor(theme.colors.score.fair, theme.colors.score.good, (score - 40) / 20);
  } else if (score <= 80) {
    return interpolateColor(theme.colors.score.good, theme.colors.score.excellent, (score - 60) / 20);
  } else {
    return theme.colors.score.excellent;
  }
};

export const DrivingScoreWheel = (props: DrivingScoreWheelProps) => {
  const { theme } = useTheme();
  const { score, size = 200 } = props;
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = React.useState(0);
  const [animatedColor, setAnimatedColor] = React.useState(getAnimatedColor(0, theme));

  useEffect(() => {
    const listener = animatedValue.addListener(({ value }) => {
      const currentScore = value * score;
      setDisplayScore(Math.round(currentScore));
      setAnimatedColor(getAnimatedColor(currentScore, theme));
    });

    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    return () => animatedValue.removeListener(listener);
  }, [animatedValue, score, theme]);

  const radius = (size - 20) / 2;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, displayScore)) / 100;

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const centerX = size / 2;
  const centerY = size / 2;

  const styles = createStyles(theme);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={centerX} cy={centerY} r={radius} stroke={theme.colors.disabled} strokeWidth={strokeWidth} fill="none" />

        <Circle
          cx={centerX}
          cy={centerY}
          r={radius}
          stroke={animatedColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${centerX} ${centerY})`}
        />
      </Svg>

      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreText, { color: animatedColor }]}>{displayScore}</Text>
        <Text style={styles.maxScoreText}>/ 100</Text>
        <Text style={[styles.labelText, { color: animatedColor }]}>{getScoreLabel(score)}</Text>
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
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
