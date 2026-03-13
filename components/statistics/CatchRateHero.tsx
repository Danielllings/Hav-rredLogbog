/**
 * CatchRateHero - Stor animeret fangstrate display
 * Enkelt ring med gradient
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
} from "react-native-reanimated";
import { APPLE } from "../../constants/appleTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CatchRateHeroProps {
  rate: number; // 0-100
  totalFish: number;
  totalTrips: number;
  size?: number;
}

export function CatchRateHero({
  rate,
  totalFish,
  totalTrips,
  size = 200,
}: CatchRateHeroProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      300,
      withTiming(Math.min(rate, 100), {
        duration: 1400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );
  }, [rate]);

  const ringAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(
      progress.value,
      [0, 100],
      [circumference, 0]
    ),
  }));

  return (
    <View style={styles.container}>
      {/* Glow bag ringen */}
      <View style={[styles.glow, { width: size - 20, height: size - 20 }]} />

      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="rateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FBBF24" />
            <Stop offset="50%" stopColor="#F59E0B" />
            <Stop offset="100%" stopColor="#D97706" />
          </LinearGradient>
        </Defs>

        {/* Baggrunds-ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={APPLE.gray2}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress ring */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#rateGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={ringAnimatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center content */}
      <View style={[styles.centerContent, { width: size, height: size }]}>
        <View style={styles.rateRow}>
          <Text style={styles.rateValue}>{Math.round(rate)}</Text>
          <Text style={styles.ratePercent}>%</Text>
        </View>
        <Text style={styles.rateLabel}>Fangstrate</Text>
      </View>

      {/* Stats under ringen */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalFish}</Text>
          <Text style={styles.statLabel}>fisk</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalTrips}</Text>
          <Text style={styles.statLabel}>ture</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 8,
  },
  glow: {
    position: "absolute",
    top: 18,
    borderRadius: 999,
    backgroundColor: APPLE.accent,
    opacity: 0.08,
  },
  centerContent: {
    position: "absolute",
    top: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  rateValue: {
    fontSize: 52,
    fontWeight: "700",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: -2,
  },
  ratePercent: {
    fontSize: 24,
    fontWeight: "600",
    color: APPLE.textSecondary,
    marginLeft: 2,
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 3,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: APPLE.glassBorder,
    width: "100%",
    justifyContent: "center",
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 36,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: APPLE.glassBorder,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "700",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 11,
    color: APPLE.textSecondary,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
