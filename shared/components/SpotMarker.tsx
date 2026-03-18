import React, { useState, useEffect, useCallback, memo } from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { type SpotRow } from "../../lib/spots";

const isAndroid = Platform.OS === "android";

type TranslateFn = (key: any) => string;

interface SpotMarkerProps {
  spot: SpotRow;
  isBestSpot: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  t: TranslateFn;
}

export const SpotMarker = memo(function SpotMarker({
  spot,
  isBestSpot,
  onPress,
  onLongPress,
  t,
}: SpotMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    const delay = isAndroid ? 500 : 300;
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, isAndroid ? 500 : 200);
    return () => clearTimeout(timer);
  }, [isBestSpot]);

  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);

  const displayName = spot.name;

  // Android: use icon with title callout (View wrappers cause clipping bug)
  if (isAndroid) {
    return (
      <Marker
        coordinate={{ latitude: spot.lat, longitude: spot.lng }}
        tracksViewChanges={true}
        onPress={handlePress}
        onCalloutPress={onLongPress}
        zIndex={isBestSpot ? 2 : 1}
        title={displayName}
      >
        <Ionicons
          name={isBestSpot ? "star" : "fish"}
          size={32}
          color="#F59E0B"
        />
      </Marker>
    );
  }

  // iOS: full custom marker
  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      onCalloutPress={onLongPress}
      zIndex={isBestSpot ? 2 : 1}
    >
      <View style={styles.container} collapsable={false}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: isBestSpot ? "#F59E0B" : "#1C1C1E" }
          ]}
          collapsable={false}
        >
          <Ionicons
            name={isBestSpot ? "star" : "fish"}
            size={14}
            color={isBestSpot ? "#000" : "#F59E0B"}
            style={styles.icon}
          />
          <Text
            style={[
              styles.text,
              { color: isBestSpot ? "#000" : "#FFF" }
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
        </View>
        <View style={styles.arrow} collapsable={false} />
      </View>
    </Marker>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.spot.id === nextProps.spot.id &&
    prevProps.spot.name === nextProps.spot.name &&
    prevProps.spot.lat === nextProps.spot.lat &&
    prevProps.spot.lng === nextProps.spot.lng &&
    prevProps.isBestSpot === nextProps.isBestSpot
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#F59E0B",
  },
  androidBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#F59E0B",
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F59E0B",
    marginTop: -2,
  },
});
