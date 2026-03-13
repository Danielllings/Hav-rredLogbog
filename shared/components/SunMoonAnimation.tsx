import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  G,
  RadialGradient,
} from "react-native-svg";

const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  accent: "#F59E0B",
  border: "#2A2A2E",
};

interface SunMoonAnimationProps {
  sunrise: string; // "HH:MM"
  sunset: string;  // "HH:MM"
}

// Parse "HH:MM" to minutes since midnight
function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function SunMoonAnimation({ sunrise, sunset }: SunMoonAnimationProps) {
  const now = new Date();
  const sunriseMin = parseTime(sunrise);
  const sunsetMin = parseTime(sunset);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Calculate sun position (0 = sunrise, 1 = sunset)
  const dayLength = sunsetMin - sunriseMin;
  const sunProgress = Math.max(0, Math.min(1, (nowMin - sunriseMin) / dayLength));

  // Is it daytime?
  const isDaytime = nowMin >= sunriseMin && nowMin <= sunsetMin;

  // Dimensions
  const width = 300;
  const height = 100;
  const arcRadius = 90;
  const centerX = width / 2;
  const horizonY = height - 16;

  // Sun position on arc
  const sunAngle = Math.PI * (1 - sunProgress);
  const sunX = centerX + arcRadius * Math.cos(sunAngle);
  const sunY = horizonY - arcRadius * Math.sin(sunAngle);

  // Arc path
  const arcPath = `M ${centerX - arcRadius} ${horizonY} A ${arcRadius} ${arcRadius} 0 0 1 ${centerX + arcRadius} ${horizonY}`;

  // Travelled path (from sunrise to current position)
  const travelledPath = isDaytime
    ? `M ${centerX - arcRadius} ${horizonY} A ${arcRadius} ${arcRadius} 0 0 1 ${sunX} ${sunY}`
    : sunProgress >= 1
    ? arcPath
    : "";

  return (
    <View style={styles.container}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          {/* Sun glow gradient */}
          <RadialGradient id="sunGlow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#FFD700" stopOpacity={1} />
            <Stop offset="0.5" stopColor="#FFA500" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#FF6B00" stopOpacity={0} />
          </RadialGradient>

          {/* Arc gradient */}
          <LinearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFA500" />
            <Stop offset="0.5" stopColor="#FFD700" />
            <Stop offset="1" stopColor="#FF6347" />
          </LinearGradient>

          {/* Horizon gradient */}
          <LinearGradient id="horizonGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFA500" stopOpacity={0.3} />
            <Stop offset="0.5" stopColor="#FFD700" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#FF6347" stopOpacity={0.3} />
          </LinearGradient>
        </Defs>

        {/* Background arc (full path - subtle) */}
        <Path
          d={arcPath}
          stroke={THEME.border}
          strokeWidth={2}
          strokeDasharray="6 4"
          fill="none"
          opacity={0.5}
        />

        {/* Travelled arc (gradient) */}
        {travelledPath && (
          <Path
            d={travelledPath}
            stroke="url(#arcGrad)"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Horizon line */}
        <Line
          x1={centerX - arcRadius - 15}
          y1={horizonY}
          x2={centerX + arcRadius + 15}
          y2={horizonY}
          stroke="url(#horizonGrad)"
          strokeWidth={2}
        />

        {/* Sunrise marker */}
        <G>
          <Circle
            cx={centerX - arcRadius}
            cy={horizonY}
            r={6}
            fill={THEME.elevated}
            stroke="#FFA500"
            strokeWidth={2}
          />
        </G>

        {/* Sunset marker */}
        <G>
          <Circle
            cx={centerX + arcRadius}
            cy={horizonY}
            r={6}
            fill={THEME.elevated}
            stroke="#FF6347"
            strokeWidth={2}
          />
        </G>

        {/* Current sun position (only during day) */}
        {isDaytime && (
          <G>
            {/* Outer glow */}
            <Circle
              cx={sunX}
              cy={sunY}
              r={24}
              fill="url(#sunGlow)"
            />
            {/* Sun body */}
            <Circle
              cx={sunX}
              cy={sunY}
              r={10}
              fill="#FFD700"
            />
            {/* Inner highlight */}
            <Circle
              cx={sunX - 2}
              cy={sunY - 2}
              r={4}
              fill="#FFF8DC"
              opacity={0.7}
            />
          </G>
        )}

        {/* Night indicator (sun below horizon) */}
        {!isDaytime && (
          <G>
            <Circle
              cx={centerX}
              cy={horizonY + 10}
              r={8}
              fill={THEME.elevated}
              stroke={THEME.border}
              strokeWidth={1}
            />
            <Circle
              cx={centerX}
              cy={horizonY + 10}
              r={4}
              fill={THEME.textTertiary}
            />
          </G>
        )}
      </Svg>

      {/* Labels */}
      <View style={styles.labels}>
        <View style={styles.labelItem}>
          <View style={[styles.dot, { backgroundColor: "#FFA500" }]} />
          <View>
            <Text style={styles.labelTitle}>Solopgang</Text>
            <Text style={styles.labelValue}>{sunrise}</Text>
          </View>
        </View>

        <View style={styles.centerLabel}>
          <Text style={styles.nowLabel}>{isDaytime ? "NU" : "NAT"}</Text>
          <Text style={styles.nowValue}>
            {now.getHours().toString().padStart(2, "0")}:
            {now.getMinutes().toString().padStart(2, "0")}
          </Text>
        </View>

        <View style={[styles.labelItem, { alignItems: "flex-end" }]}>
          <View>
            <Text style={[styles.labelTitle, { textAlign: "right" }]}>Solnedgang</Text>
            <Text style={[styles.labelValue, { textAlign: "right" }]}>{sunset}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: "#FF6347" }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 20,
    paddingTop: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginTop: 16,
  },
  labelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  labelTitle: {
    color: THEME.textTertiary,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  labelValue: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  centerLabel: {
    alignItems: "center",
  },
  nowLabel: {
    color: THEME.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  nowValue: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
});
