// shared/components/BentoTrackingDashboard.tsx
// Premium tracking UI - clean, polished, professional

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Polyline, Marker, UrlTile, Region } from "react-native-maps";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Premium dark palette - carefully selected
const COLORS = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  border: "#2A2A2E",

  text: "#FFFFFF",
  textSecondary: "#A0A0A8",
  textTertiary: "#606068",

  accent: "#F59E0B",      // Premium gold
  accentMuted: "#F59E0B20",
  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
};

interface Pt {
  latitude: number;
  longitude: number;
  t?: number;
}

interface Props {
  elapsedSec: number;
  distanceM: number;
  catchCount: number;
  points: Pt[];
  region: Region;
  onRegionChange: (r: Region) => void;
  mapProvider: any;
  spotName?: string;
  weather?: { waterTemp?: number; windSpeed?: number; windDir?: string };
  onMarkCatch: () => void;
  onMeasureTemp: () => void;
  onStopTrip: () => void;
  manualTempCount: number;
  lastManualTemp?: number;
  t: (key: any) => string;
  language?: "da" | "en";
}


export function BentoTrackingDashboard({
  elapsedSec,
  distanceM,
  catchCount,
  points,
  region,
  onRegionChange,
  mapProvider,
  spotName,
  weather,
  onMarkCatch,
  onMeasureTemp,
  onStopTrip,
  manualTempCount,
  lastManualTemp,
  t,
  language = "da",
}: Props) {
  // Format time
  const hours = Math.floor(elapsedSec / 3600);
  const mins = Math.floor((elapsedSec % 3600) / 60);
  const secs = elapsedSec % 60;

  const timeStr = hours > 0
    ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${mins}:${String(secs).padStart(2, "0")}`;

  const distKm = (distanceM / 1000).toFixed(2);

  const mapRef = useRef<MapView>(null);

  // Lock map to user's latest position
  useEffect(() => {
    if (points.length > 0 && mapRef.current) {
      const last = points[points.length - 1];
      mapRef.current.animateToRegion(
        {
          latitude: last.latitude,
          longitude: last.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        300
      );
    }
  }, [points.length]);

  return (
    <>
      {/* Map - standalone card, locked to position */}
      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region}
          onRegionChangeComplete={onRegionChange}
          provider={mapProvider}
          mapType="satellite"
          rotateEnabled={false}
          pitchEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
          followsUserLocation={true}
          showsUserLocation={false}
        >
          {points.length > 0 && (
            <>
              <Polyline
                coordinates={points}
                strokeWidth={3}
                strokeColor={COLORS.accent}
              />
              <Marker
                coordinate={points[points.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.positionMarker}>
                  <View style={styles.positionMarkerCore} />
                </View>
              </Marker>
            </>
          )}
        </MapView>
        {spotName ? (
          <View style={styles.mapSpotBadge}>
            <Text style={styles.mapSpotText} numberOfLines={1}>{spotName}</Text>
          </View>
        ) : null}
      </View>

      {/* Timer + Stats + Actions card */}
      <View style={styles.container}>
        {/* Timer - Hero element */}
        <View style={styles.timerSection}>
          <Text style={styles.timer}>{timeStr}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{distKm}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{catchCount}</Text>
            <Text style={styles.statLabel}>{language === "da" ? "fangst" : "catch"}</Text>
          </View>
          {manualTempCount > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{lastManualTemp}°</Text>
                <Text style={styles.statLabel}>{language === "da" ? "vand" : "water"}</Text>
              </View>
            </>
          )}
        </View>

        {/* Actions - Stacked full-width buttons */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.catchButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onMarkCatch}
          >
            <Ionicons name="fish" size={20} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.catchButtonText}>{t("catchBtn")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.tempButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onMeasureTemp}
          >
            <Ionicons name="thermometer-outline" size={20} color="#FFF" />
            <Text style={styles.tempButtonText}>{t("waterTempBtn")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.stopButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onStopTrip}
          >
            <View style={styles.stopIcon} />
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    height: 220,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.elevated,
    marginBottom: 12,
    position: "relative",
  },
  mapSpotBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(22, 22, 24, 0.85)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  mapSpotText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: 200,
  },
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },

  // Timer
  timerSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  timer: {
    fontSize: 56,
    fontWeight: "200",
    color: COLORS.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  stat: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textTertiary,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },

  // Map
  map: {
    flex: 1,
  },
  positionMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  positionMarkerCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
    borderWidth: 2,
    borderColor: COLORS.text,
  },

  // Actions - stacked layout
  actions: {
    gap: 10,
  },
  catchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15803D",
    height: 52,
    borderRadius: 14,
  },
  buttonIcon: {
    marginRight: 8,
  },
  catchButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },
  tempButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1D4ED8",
    height: 52,
    borderRadius: 14,
  },
  tempButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.dangerMuted,
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: COLORS.danger,
    marginRight: 8,
  },
  stopButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.danger,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

export default BentoTrackingDashboard;
