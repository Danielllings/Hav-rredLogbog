import React, { useState, useEffect, memo, useCallback } from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { type OceanStation } from "../../lib/dmiOcean";

const isAndroid = Platform.OS === "android";

type TranslateFn = (key: any) => string;

interface DmiStationMarkerProps {
  station: OceanStation;
  onPress?: () => void;
  t?: TranslateFn;
}

export const DmiStationMarker = memo(function DmiStationMarker({
  station,
  onPress,
  t,
}: DmiStationMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    const delay = isAndroid ? 2000 : 300;
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  const displayName = station.name;

  // Android: use icon with title callout (View wrappers cause clipping bug)
  if (isAndroid) {
    return (
      <Marker
        coordinate={{ latitude: station.lat, longitude: station.lon }}
        tracksViewChanges={true}
        onPress={handlePress}
        zIndex={0}
        title={displayName}
      >
        <Ionicons
          name="water"
          size={28}
          color="#3B82F6"
        />
      </Marker>
    );
  }

  // iOS: full custom marker
  return (
    <Marker
      coordinate={{ latitude: station.lat, longitude: station.lon }}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      zIndex={0}
    >
      <View style={styles.container} collapsable={false}>
        <View style={styles.bubble} collapsable={false}>
          <Ionicons name="water" size={12} color="#3B82F6" style={styles.icon} />
          <Text style={styles.text}>{displayName}</Text>
        </View>
        <View style={styles.arrow} collapsable={false} />
      </View>
    </Marker>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.station.id === nextProps.station.id &&
    prevProps.station.name === nextProps.station.name &&
    prevProps.station.lat === nextProps.station.lat &&
    prevProps.station.lon === nextProps.station.lon
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderWidth: 2,
    borderColor: "#3B82F6",
  },
  androidBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#1C1C1E",
    borderWidth: 2,
    borderColor: "#3B82F6",
  },
  androidText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 3,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#3B82F6",
  },
});
