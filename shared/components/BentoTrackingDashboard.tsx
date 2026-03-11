// shared/components/BentoTrackingDashboard.tsx
// Premium tracking UI - clean, polished, professional

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Polyline, Marker, UrlTile, Region } from "react-native-maps";
import { ORTO_FORAAR_URL } from "../../lib/maps";

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
}

// Recording pulse - subtle, professional
function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[styles.recordDot, { opacity }]} />;
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
}: Props) {
  // Format time
  const hours = Math.floor(elapsedSec / 3600);
  const mins = Math.floor((elapsedSec % 3600) / 60);
  const secs = elapsedSec % 60;

  const timeStr = hours > 0
    ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${mins}:${String(secs).padStart(2, "0")}`;

  const distKm = (distanceM / 1000).toFixed(2);

  return (
    <View style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <RecordingDot />
          <Text style={styles.statusText}>Optager</Text>
        </View>
        <Text style={styles.spotText} numberOfLines={1}>
          {spotName || "Fisketur"}
        </Text>
      </View>

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
          <Text style={styles.statLabel}>fangst</Text>
        </View>
        {manualTempCount > 0 && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{lastManualTemp}°</Text>
              <Text style={styles.statLabel}>vand</Text>
            </View>
          </>
        )}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={onRegionChange}
          provider={mapProvider}
          mapType="none"
          rotateEnabled={false}
          pitchEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
        >
          <UrlTile urlTemplate={ORTO_FORAAR_URL} maximumZ={21} tileSize={256} />
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
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {/* Primary: Register catch */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={onMarkCatch}
        >
          <Ionicons name="add" size={24} color={COLORS.bg} style={styles.buttonIcon} />
          <Text style={styles.primaryButtonText}>Fangst</Text>
        </Pressable>

        {/* Secondary buttons */}
        <View style={styles.secondaryButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onMeasureTemp}
          >
            <Ionicons name="thermometer-outline" size={20} color={COLORS.textSecondary} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },

  // Status bar
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  spotText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: 160,
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
  mapContainer: {
    height: 180,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.elevated,
    marginBottom: 20,
  },
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

  // Actions
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    height: 56,
    borderRadius: 16,
    marginRight: 12,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.bg,
  },
  secondaryButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: COLORS.dangerMuted,
  },
  stopIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: COLORS.danger,
    marginRight: 8,
  },
  stopButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.danger,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

export default BentoTrackingDashboard;
