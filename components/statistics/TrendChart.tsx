/**
 * TrendChart - Smooth bezier kurve graf
 * Apple Health inspireret med gradient fill og animeret tegning
 */

import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  G,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  FadeInDown,
} from "react-native-reanimated";
import { APPLE } from "../../constants/appleTheme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface TrendChartProps {
  data: DataPoint[];
  height?: number;
  showLabels?: boolean;
  showDots?: boolean;
  showGrid?: boolean;
  lineColor?: string;
  fillColor?: string;
  secondaryLineColor?: string;
  animated?: boolean;
}

// Generer smooth bezier kurve path
function generateBezierPath(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  closePath: boolean = false
): string {
  if (points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to Bezier conversion for smooth curves
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  if (closePath) {
    // Luk path for fill
    path += ` L ${points[points.length - 1].x} ${height}`;
    path += ` L ${points[0].x} ${height}`;
    path += " Z";
  }

  return path;
}

export function TrendChart({
  data,
  height = 150,
  showLabels = true,
  showDots = true,
  showGrid = true,
  lineColor = APPLE.accent,
  fillColor,
  secondaryLineColor = APPLE.ringGreen,
  animated = true,
}: TrendChartProps) {
  const { width: screenWidth } = Dimensions.get("window");
  const chartWidth = screenWidth - 72; // Padding
  const chartHeight = height - (showLabels ? 30 : 0);
  const paddingTop = 10;
  const paddingBottom = 10;

  const animationProgress = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      animationProgress.value = withDelay(
        200,
        withTiming(1, {
          duration: 1200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );
    } else {
      animationProgress.value = 1;
    }
  }, [data]);

  // Beregn punkter
  const { points, secondaryPoints, maxValue } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: [], secondaryPoints: [], maxValue: 0 };
    }

    const allValues = data.flatMap((d) =>
      d.secondaryValue !== undefined ? [d.value, d.secondaryValue] : [d.value]
    );
    const max = Math.max(...allValues, 1);
    const effectiveHeight = chartHeight - paddingTop - paddingBottom;

    const pts = data.map((d, i) => ({
      x: (i / Math.max(data.length - 1, 1)) * chartWidth,
      y: paddingTop + effectiveHeight - (d.value / max) * effectiveHeight,
      value: d.value,
      label: d.label,
    }));

    const secPts = data
      .filter((d) => d.secondaryValue !== undefined)
      .map((d, i) => ({
        x: (i / Math.max(data.length - 1, 1)) * chartWidth,
        y:
          paddingTop +
          effectiveHeight -
          ((d.secondaryValue || 0) / max) * effectiveHeight,
        value: d.secondaryValue || 0,
      }));

    return { points: pts, secondaryPoints: secPts, maxValue: max };
  }, [data, chartWidth, chartHeight]);

  // Generer paths
  const linePath = useMemo(
    () => generateBezierPath(points, chartWidth, chartHeight),
    [points, chartWidth, chartHeight]
  );

  const fillPath = useMemo(
    () => generateBezierPath(points, chartWidth, chartHeight, true),
    [points, chartWidth, chartHeight]
  );

  const secondaryLinePath = useMemo(
    () =>
      secondaryPoints.length > 0
        ? generateBezierPath(secondaryPoints, chartWidth, chartHeight)
        : "",
    [secondaryPoints, chartWidth, chartHeight]
  );

  // Animeret stroke drawing
  const animatedLineProps = useAnimatedProps(() => {
    // Estimer path længde (approksimation)
    const pathLength = chartWidth * 1.5;
    return {
      strokeDasharray: pathLength,
      strokeDashoffset: interpolate(
        animationProgress.value,
        [0, 1],
        [pathLength, 0]
      ),
    };
  });

  const animatedFillProps = useAnimatedProps(() => ({
    opacity: interpolate(animationProgress.value, [0, 0.5, 1], [0, 0, 0.3]),
  }));

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>Ingen data</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          {/* Gradient fill */}
          <LinearGradient id="fillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={fillColor || lineColor} stopOpacity="0.4" />
            <Stop offset="100%" stopColor={fillColor || lineColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Grid linjer */}
        {showGrid && (
          <G>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <Line
                key={i}
                x1={0}
                y1={paddingTop + (chartHeight - paddingTop - paddingBottom) * ratio}
                x2={chartWidth}
                y2={paddingTop + (chartHeight - paddingTop - paddingBottom) * ratio}
                stroke={APPLE.chartGrid}
                strokeWidth={1}
              />
            ))}
          </G>
        )}

        {/* Fill area */}
        {fillPath && (
          <AnimatedPath
            d={fillPath}
            fill="url(#fillGradient)"
            animatedProps={animatedFillProps}
          />
        )}

        {/* Secondary line */}
        {secondaryLinePath && (
          <Path
            d={secondaryLinePath}
            stroke={secondaryLineColor}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeOpacity={0.6}
          />
        )}

        {/* Main line */}
        <AnimatedPath
          d={linePath}
          stroke={lineColor}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          animatedProps={animatedLineProps}
        />

        {/* Data punkter */}
        {showDots &&
          points.map((point, i) => (
            <G key={i}>
              {/* Outer glow */}
              <Circle
                cx={point.x}
                cy={point.y}
                r={6}
                fill={lineColor}
                opacity={0.2}
              />
              {/* Inner dot */}
              <Circle
                cx={point.x}
                cy={point.y}
                r={4}
                fill={APPLE.bg}
                stroke={lineColor}
                strokeWidth={2}
              />
            </G>
          ))}
      </Svg>

      {/* X-axis labels */}
      {showLabels && (
        <View style={styles.labelsRow}>
          {data.map((d, i) => (
            <Text key={i} style={styles.label}>
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// Simpel bar chart variant
export function BarChart({
  data,
  height = 120,
  showLabels = true,
  barColor = APPLE.accent,
  secondaryBarColor = APPLE.ringGreen,
}: {
  data: DataPoint[];
  height?: number;
  showLabels?: boolean;
  barColor?: string;
  secondaryBarColor?: string;
}) {
  const maxValue = Math.max(...data.flatMap(d =>
    d.secondaryValue !== undefined ? [d.value, d.secondaryValue] : [d.value]
  ), 1);
  const barHeight = height - (showLabels ? 28 : 0);
  const hasSecondary = data.some(d => d.secondaryValue !== undefined);

  return (
    <View style={[styles.barContainer, { height }]}>
      <View style={styles.barsRow}>
        {data.map((item, i) => {
          const primaryHeight = Math.max((item.value / maxValue) * barHeight, item.value > 0 ? 4 : 0);
          const secondaryHeight = item.secondaryValue !== undefined
            ? Math.max((item.secondaryValue / maxValue) * barHeight, item.secondaryValue > 0 ? 4 : 0)
            : 0;

          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barWrapper}>
                {hasSecondary ? (
                  <View style={styles.dualBarPair}>
                    <Animated.View
                      entering={FadeInDown.delay(i * 50).duration(400)}
                      style={[
                        styles.bar,
                        { height: primaryHeight, backgroundColor: barColor },
                      ]}
                    />
                    <View style={{ opacity: 0.7 }}>
                      <Animated.View
                        entering={FadeInDown.delay(i * 50 + 100).duration(400)}
                        style={[
                          styles.bar,
                          { height: secondaryHeight, backgroundColor: secondaryBarColor },
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <Animated.View
                    entering={FadeInDown.delay(i * 50).duration(400)}
                    style={[
                      styles.bar,
                      { height: primaryHeight, backgroundColor: barColor },
                    ]}
                  />
                )}
              </View>
              {showLabels && (
                <Text style={styles.barLabel}>{item.label}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: APPLE.textTertiary,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
    marginTop: 8,
  },
  label: {
    fontSize: 10,
    color: APPLE.textTertiary,
    textAlign: "center",
  },

  // Bar chart styles
  barContainer: {
    width: "100%",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flex: 1,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
  },
  barWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  dualBarPair: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  bar: {
    width: 8,
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10,
    color: APPLE.textTertiary,
    marginTop: 8,
  },
});
