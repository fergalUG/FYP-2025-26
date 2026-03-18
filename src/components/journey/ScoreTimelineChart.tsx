import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@hooks/useTheme';
import type { ScoreTimelinePoint } from '@types';

interface ScoreTimelineChartProps {
  points: ScoreTimelinePoint[];
  height?: number;
}

const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 120;
const CHART_PADDING = {
  top: 12,
  right: 12,
  bottom: 18,
  left: 28,
};

export const ScoreTimelineChart = (props: ScoreTimelineChartProps) => {
  const { points, height = VIEWBOX_HEIGHT } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const chart = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    const maxElapsedMs = points[points.length - 1]?.elapsedMs ?? 0;
    const chartWidth = VIEWBOX_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const chartHeight = VIEWBOX_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    const toX = (elapsedMs: number): number => {
      if (maxElapsedMs <= 0) {
        return CHART_PADDING.left;
      }
      return CHART_PADDING.left + (elapsedMs / maxElapsedMs) * chartWidth;
    };

    const toY = (score: number): number => {
      return CHART_PADDING.top + ((100 - Math.max(0, Math.min(100, score))) / 100) * chartHeight;
    };

    return {
      polylinePoints: points.map((point) => `${toX(point.elapsedMs)},${toY(point.score)}`).join(' '),
      lastPoint: points[points.length - 1]
        ? {
            cx: toX(points[points.length - 1].elapsedMs),
            cy: toY(points[points.length - 1].score),
          }
        : null,
    };
  }, [points]);

  if (!chart) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No score timeline available</Text>
      </View>
    );
  }

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
      {[0, 50, 100].map((score) => {
        const y = CHART_PADDING.top + ((100 - score) / 100) * (VIEWBOX_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom);

        return (
          <React.Fragment key={score}>
            <Line
              x1={CHART_PADDING.left}
              y1={y}
              x2={VIEWBOX_WIDTH - CHART_PADDING.right}
              y2={y}
              stroke={theme.colors.outline}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <SvgText x={CHART_PADDING.left - 8} y={y + 4} fontSize="10" fill={theme.colors.textSecondary} textAnchor="end">
              {score}
            </SvgText>
          </React.Fragment>
        );
      })}

      <Polyline
        points={chart.polylinePoints}
        fill="none"
        stroke={theme.colors.primary}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {chart.lastPoint ? <Circle cx={chart.lastPoint.cx} cy={chart.lastPoint.cy} r={4} fill={theme.colors.primary} /> : null}
    </Svg>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
    },
  });
