/**
 * WeatherQuickPreview - Kompakt vejr preview til location card
 * Viser temperatur, vindstyrke og vindretning inline
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { APPLE } from "../constants/appleTheme";
import { SkeletonWeatherPreview } from "./SkeletonLoader";

interface WeatherQuickPreviewProps {
  temp: number | null;
  wind: number | null;
  windDir: number | null;
  loading: boolean;
}

// Konverter vindretning i grader til kompasretning
function getWindDirectionLabel(degrees: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

// Kompakt inline stat komponent
function InlineStat({
  icon,
  value,
  unit,
  color = APPLE.textSecondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <View style={styles.inlineContainer}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.inlineValue}>
        {value}
        {unit && <Text style={styles.inlineUnit}>{unit}</Text>}
      </Text>
    </View>
  );
}

export function WeatherQuickPreview({
  temp,
  wind,
  windDir,
  loading,
}: WeatherQuickPreviewProps) {
  // Vis skeleton loader mens data hentes
  if (loading) {
    return <SkeletonWeatherPreview style={styles.container} />;
  }

  // Hvis ingen data efter load, vis placeholder tekst
  if (temp === null && wind === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>Vejrdata utilgængelig</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Temperatur */}
      {temp !== null && (
        <InlineStat
          icon="thermometer-outline"
          value={Math.round(temp)}
          unit="°C"
          color={APPLE.accent}
        />
      )}

      {/* Vindstyrke */}
      {wind !== null && (
        <InlineStat
          icon="flag-outline"
          value={wind.toFixed(1)}
          unit=" m/s"
          color={APPLE.textSecondary}
        />
      )}

      {/* Vindretning */}
      {windDir !== null && (
        <View style={styles.windDirContainer}>
          <Ionicons
            name="navigate"
            size={14}
            color={APPLE.textSecondary}
            style={{
              transform: [{ rotate: `${windDir + 180}deg` }],
            }}
          />
          <Text style={styles.inlineValue}>
            {getWindDirectionLabel(windDir)}
          </Text>
        </View>
      )}
    </View>
  );
}

// Alternativ kompakt version til meget små spaces
export function WeatherQuickPreviewCompact({
  temp,
  wind,
  loading,
}: {
  temp: number | null;
  wind: number | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.skeletonBox} />
      </View>
    );
  }

  if (temp === null && wind === null) {
    return null;
  }

  return (
    <View style={styles.compactContainer}>
      {temp !== null && (
        <Text style={styles.compactText}>{Math.round(temp)}°</Text>
      )}
      {temp !== null && wind !== null && (
        <Text style={styles.compactSeparator}>|</Text>
      )}
      {wind !== null && (
        <Text style={styles.compactText}>{wind.toFixed(0)} m/s</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: APPLE.gray1,
    borderRadius: 12,
  },
  inlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  inlineValue: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.text,
  },
  inlineUnit: {
    fontSize: 12,
    fontWeight: "400",
    color: APPLE.textSecondary,
  },
  windDirContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // Compact variant
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
  compactSeparator: {
    fontSize: 12,
    color: APPLE.textTertiary,
  },
  skeletonBox: {
    width: 80,
    height: 14,
    backgroundColor: APPLE.gray1,
    borderRadius: 4,
  },
  noDataText: {
    fontSize: 12,
    color: APPLE.textTertiary,
    fontStyle: "italic",
  },
});
