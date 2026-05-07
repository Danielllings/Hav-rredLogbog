/**
 * ActivityRings - Apple Fitness style koncentriske animerede ringe
 * Tre ringe: Catch Rate (rød), Fish per Hour (grøn), Success Rate (cyan)
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { APPLE, APPLE_TIMING } from "../../constants/appleTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RingData {
  value: number;      // 0-100 procent
  label: string;
  color: string;
  gradientId: string;
  gradientColors: [string, string];
}

interface ActivityRingsProps {
  catchRate: number;
  fishPerHour: number;
  successRate: number;
  language?: "da" | "en";
  size?: number;
  strokeWidth?: number;
  showLabels?: boolean;
}

// Enkelt ring komponent med gradient
function AnimatedRing({
  progress,
  size,
  strokeWidth,
  radius,
  gradientId,
  gradientColors,
  delay = 0,
}: {
  progress: number;
  size: number;
  strokeWidth: number;
  radius: number;
  gradientId: string;
  gradientColors: [string, string];
  delay?: number;
}) {
  const animatedProgress = useSharedValue(0);
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animatedProgress.value = withDelay(
      delay,
      withTiming(Math.min(progress, 100), {
        duration: 1200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );
  }, [progress]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = interpolate(
      animatedProgress.value,
      [0, 100],
      [circumference, 0]
    );
    return {
      strokeDashoffset,
    };
  });

  return (
    <>
      {/* Baggrunds-ring */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={APPLE.gray1}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Animeret progress-ring med gradient */}
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        animatedProps={animatedProps}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </>
  );
}

export function ActivityRings({
  catchRate,
  fishPerHour,
  successRate,
  size = 200,
  strokeWidth = 14,
  showLabels = true,
  language = "da",
}: ActivityRingsProps) {
  const gap = 6; // Mellemrum mellem ringe

  // Beregn radii for de tre koncentriske ringe
  const outerRadius = (size - strokeWidth) / 2;
  const middleRadius = outerRadius - strokeWidth - gap;
  const innerRadius = middleRadius - strokeWidth - gap;

  // Ring data
  const rings: RingData[] = [
    {
      value: catchRate,
      label: language === "da" ? "Fangst" : "Catch",
      color: APPLE.ringRed,
      gradientId: "gradRed",
      gradientColors: APPLE.gradientRed as [string, string],
    },
    {
      value: Math.min(fishPerHour * 50, 100),
      label: language === "da" ? "Tempo" : "Rate",
      color: APPLE.ringGreen,
      gradientId: "gradGreen",
      gradientColors: APPLE.gradientGreen as [string, string],
    },
    {
      value: successRate,
      label: language === "da" ? "Multi" : "Multi",
      color: APPLE.ringCyan,
      gradientId: "gradCyan",
      gradientColors: APPLE.gradientCyan as [string, string],
    },
  ];

  // Fade-in animation for hele komponenten
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withTiming(1, {
      duration: 600,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    });
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Gradient definitioner */}
          {rings.map((ring) => (
            <LinearGradient
              key={ring.gradientId}
              id={ring.gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop offset="0%" stopColor={ring.gradientColors[0]} />
              <Stop offset="100%" stopColor={ring.gradientColors[1]} />
            </LinearGradient>
          ))}
        </Defs>

        {/* Ydre ring - Catch Rate */}
        <AnimatedRing
          progress={rings[0].value}
          size={size}
          strokeWidth={strokeWidth}
          radius={outerRadius}
          gradientId={rings[0].gradientId}
          gradientColors={rings[0].gradientColors}
          delay={0}
        />

        {/* Midterste ring - Fish per Hour */}
        <AnimatedRing
          progress={rings[1].value}
          size={size}
          strokeWidth={strokeWidth}
          radius={middleRadius}
          gradientId={rings[1].gradientId}
          gradientColors={rings[1].gradientColors}
          delay={150}
        />

        {/* Indre ring - Success Rate */}
        <AnimatedRing
          progress={rings[2].value}
          size={size}
          strokeWidth={strokeWidth}
          radius={innerRadius}
          gradientId={rings[2].gradientId}
          gradientColors={rings[2].gradientColors}
          delay={300}
        />
      </Svg>

      {/* Center labels */}
      {showLabels && (
        <View style={styles.centerLabels}>
          <Text style={styles.mainValue}>{Math.round(catchRate)}%</Text>
          <Text style={styles.mainLabel}>{language === "da" ? "Fangstrate" : "Catch rate"}</Text>
        </View>
      )}

      {/* Ring legend */}
      {showLabels && (
        <View style={styles.legend}>
          {rings.map((ring) => (
            <View key={ring.gradientId} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ring.color }]} />
              <Text style={styles.legendText}>{ring.label}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// Kompakt version til mindre visninger
export function MiniActivityRing({
  progress,
  size = 60,
  strokeWidth = 6,
  color = APPLE.ringCyan,
  label,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
  const animatedProgress = useSharedValue(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animatedProgress.value = withTiming(Math.min(progress, 100), {
      duration: 1000,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(
      animatedProgress.value,
      [0, 100],
      [circumference, 0]
    ),
  }));

  return (
    <View style={styles.miniContainer}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={APPLE.gray1}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[styles.miniCenter, { width: size, height: size }]}>
        <Text style={styles.miniValue}>{Math.round(progress)}%</Text>
      </View>
      {label && <Text style={styles.miniLabel}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  centerLabels: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  mainValue: {
    fontSize: 36,
    fontWeight: "700",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
  },
  mainLabel: {
    fontSize: 12,
    color: APPLE.textSecondary,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: APPLE.textSecondary,
  },
  miniContainer: {
    alignItems: "center",
  },
  miniCenter: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  miniValue: {
    fontSize: 14,
    fontWeight: "600",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
  },
  miniLabel: {
    fontSize: 10,
    color: APPLE.textTertiary,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
