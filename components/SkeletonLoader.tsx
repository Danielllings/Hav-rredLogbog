/**
 * SkeletonLoader - Animated placeholder med shimmer effekt
 * Bruger react-native-reanimated for smooth animation
 */

import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { APPLE } from "../constants/appleTheme";

interface SkeletonLoaderProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({
  width,
  height,
  borderRadius = 8,
  style,
}: SkeletonLoaderProps) {
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    shimmerPosition.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.linear,
      }),
      -1, // Infinite repeat
      false // Don't reverse
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmerPosition.value,
      [0, 1],
      [-150, 150]
    );
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={[
        styles.container,
        {
          width: width as any,
          height,
          borderRadius,
        },
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, animatedStyle]}>
        <LinearGradient
          colors={[
            "transparent",
            "rgba(255, 255, 255, 0.08)",
            "rgba(255, 255, 255, 0.12)",
            "rgba(255, 255, 255, 0.08)",
            "transparent",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

// Preset komponenter for common use cases
export function SkeletonText({
  width = 100,
  lines = 1,
  style,
}: {
  width?: number | string;
  lines?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.textContainer, style]}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLoader
          key={index}
          width={index === lines - 1 && lines > 1 ? "70%" : width}
          height={14}
          borderRadius={4}
          style={index > 0 ? { marginTop: 8 } : undefined}
        />
      ))}
    </View>
  );
}

export function SkeletonStatCell({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.statCell, style]}>
      <SkeletonLoader width={32} height={32} borderRadius={10} />
      <SkeletonLoader width={60} height={10} borderRadius={4} style={{ marginTop: 10 }} />
      <SkeletonLoader width={40} height={20} borderRadius={4} style={{ marginTop: 6 }} />
    </View>
  );
}

export function SkeletonGraph({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.graphContainer, style]}>
      {/* Label row */}
      <View style={styles.graphLabelRow}>
        <SkeletonLoader width={80} height={12} borderRadius={4} />
        <SkeletonLoader width={40} height={12} borderRadius={4} />
      </View>
      {/* Graph area */}
      <SkeletonLoader width="100%" height={100} borderRadius={12} style={{ marginTop: 12 }} />
    </View>
  );
}

// Quick weather preview skeleton
export function SkeletonWeatherPreview({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.weatherPreview, style]}>
      <View style={styles.weatherPreviewItem}>
        <SkeletonLoader width={14} height={14} borderRadius={4} />
        <SkeletonLoader width={50} height={13} borderRadius={4} />
      </View>
      <View style={styles.weatherPreviewItem}>
        <SkeletonLoader width={14} height={14} borderRadius={4} />
        <SkeletonLoader width={60} height={13} borderRadius={4} />
      </View>
      <View style={styles.weatherPreviewItem}>
        <SkeletonLoader width={14} height={14} borderRadius={4} />
        <SkeletonLoader width={30} height={13} borderRadius={4} />
      </View>
    </View>
  );
}

// Forecast days skeleton
export function SkeletonForecastDays({ days = 5, style }: { days?: number; style?: ViewStyle }) {
  return (
    <View style={[styles.forecastDaysContainer, style]}>
      {Array.from({ length: days }).map((_, index) => (
        <View key={index} style={styles.forecastDay}>
          <SkeletonLoader width={30} height={12} borderRadius={4} />
          <SkeletonLoader width={22} height={22} borderRadius={6} style={{ marginVertical: 8 }} />
          <SkeletonLoader width={24} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: APPLE.gray1,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 150,
  },
  gradient: {
    flex: 1,
    width: "100%",
  },
  textContainer: {
    flexDirection: "column",
  },
  statCell: {
    padding: 14,
    backgroundColor: APPLE.cardSolid,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  graphContainer: {
    marginBottom: 16,
  },
  graphLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weatherPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: APPLE.gray2,
    borderRadius: 12,
  },
  weatherPreviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  forecastDaysContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  forecastDay: {
    alignItems: "center",
  },
});
