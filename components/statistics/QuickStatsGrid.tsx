/**
 * QuickStatsGrid - 6-celle glassmorphism grid
 * Apple Health inspireret bento-style layout med animerede værdier
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import { APPLE, APPLE_TIMING } from "../../constants/appleTheme";

interface StatItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  suffix?: string;
  color?: string;
  trend?: "up" | "down" | "neutral";
}

interface QuickStatsGridProps {
  stats: StatItem[];
  columns?: 2 | 3;
}

// Enkelt stat-celle med entry animation
function StatCell({
  item,
  index,
  columns,
}: {
  item: StatItem;
  index: number;
  columns: number;
}) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    const delay = index * 80;

    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    scale.value = withDelay(
      delay,
      withSpring(1, APPLE_TIMING.springBouncy)
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const isIOS = Platform.OS === "ios";
  const accentColor = item.color || APPLE.accent;

  const content = (
    <>
      {/* Icon med farvet baggrund */}
      <View style={[styles.iconContainer, { backgroundColor: `${accentColor}20` }]}>
        <Ionicons name={item.icon} size={18} color={accentColor} />
      </View>

      {/* Label */}
      <Text style={styles.cellLabel} numberOfLines={1}>
        {item.label}
      </Text>

      {/* Værdi */}
      <View style={styles.valueRow}>
        <Text style={styles.cellValue}>
          {item.value}
          {item.suffix && <Text style={styles.cellSuffix}>{item.suffix}</Text>}
        </Text>

        {/* Trend indicator */}
        {item.trend && item.trend !== "neutral" && (
          <Ionicons
            name={item.trend === "up" ? "trending-up" : "trending-down"}
            size={14}
            color={item.trend === "up" ? APPLE.success : APPLE.error}
            style={styles.trendIcon}
          />
        )}
      </View>
    </>
  );

  if (isIOS) {
    return (
      <Animated.View
        style={[
          styles.cellWrapper,
          { width: `${100 / columns}%` },
          animatedStyle,
        ]}
      >
        <View style={styles.cellContainer}>
          <BlurView intensity={30} tint="dark" style={styles.cellBlur}>
            {content}
          </BlurView>
        </View>
      </Animated.View>
    );
  }

  // Android fallback
  return (
    <Animated.View
      style={[
        styles.cellWrapper,
        { width: `${100 / columns}%` },
        animatedStyle,
      ]}
    >
      <View style={[styles.cellContainer, styles.cellContainerAndroid]}>
        {content}
      </View>
    </Animated.View>
  );
}

export function QuickStatsGrid({ stats, columns = 3 }: QuickStatsGridProps) {
  return (
    <View style={styles.grid}>
      {stats.map((item, index) => (
        <StatCell key={index} item={item} index={index} columns={columns} />
      ))}
    </View>
  );
}

// Stor stat-kort for hero metrics
export function HeroStatCard({
  icon,
  label,
  value,
  suffix,
  color = APPLE.accent,
  subtitle,
}: StatItem & { subtitle?: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(600).springify()}
      style={styles.heroCard}
    >
      <View style={[styles.heroIconContainer, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>

      <Text style={styles.heroLabel}>{label}</Text>

      <View style={styles.heroValueRow}>
        <Text style={styles.heroValue}>{value}</Text>
        {suffix && <Text style={styles.heroSuffix}>{suffix}</Text>}
      </View>

      {subtitle && <Text style={styles.heroSubtitle}>{subtitle}</Text>}
    </Animated.View>
  );
}

// Kompakt inline stat
export function InlineStat({
  icon,
  label,
  value,
  color = APPLE.textSecondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <View style={styles.inlineContainer}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.inlineLabel}>{label}:</Text>
      <Text style={styles.inlineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  cellWrapper: {
    padding: 4,
  },
  cellContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    backgroundColor: APPLE.card,
  },
  cellContainerAndroid: {
    padding: 14,
    backgroundColor: APPLE.cardSolid,
  },
  cellBlur: {
    padding: 14,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  cellLabel: {
    fontSize: 10,
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  cellValue: {
    fontSize: 20,
    fontWeight: "600",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
  },
  cellSuffix: {
    fontSize: 12,
    fontWeight: "400",
    color: APPLE.textSecondary,
    marginLeft: 2,
  },
  trendIcon: {
    marginLeft: 6,
  },

  // Hero card
  heroCard: {
    backgroundColor: APPLE.cardSolid,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    alignItems: "center",
  },
  heroIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 12,
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  heroValue: {
    fontSize: 40,
    fontWeight: "700",
    color: APPLE.text,
    fontVariant: ["tabular-nums"],
  },
  heroSuffix: {
    fontSize: 18,
    fontWeight: "400",
    color: APPLE.textSecondary,
    marginLeft: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: APPLE.textTertiary,
    marginTop: 8,
  },

  // Inline stat
  inlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineLabel: {
    fontSize: 13,
    color: APPLE.textSecondary,
  },
  inlineValue: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.text,
  },
});
