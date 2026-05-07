import React, { useCallback, memo } from "react";
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

// Star badge komponent
const StarBadge = memo(function StarBadge() {
  return (
    <View style={styles.starBadge}>
      <Ionicons name="star" size={10} color="#000" />
    </View>
  );
});

export const SpotMarker = memo(function SpotMarker({
  spot,
  isBestSpot,
  onPress,
  onLongPress,
  t,
}: SpotMarkerProps) {
  // No tracksViewChanges toggling — causes clipping glitch on zoom
  const tracksViewChanges = false;

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
        <View style={styles.androidContainer}>
          <Ionicons
            name={isBestSpot ? "star" : "fish"}
            size={isBestSpot ? 36 : 32}
            color="#F59E0B"
            style={isBestSpot ? styles.androidBestIcon : undefined}
          />
        </View>
      </Marker>
    );
  }

  // iOS: full custom marker with animations
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
            isBestSpot && styles.bestSpotBubble
          ]}
          collapsable={false}
        >
          <Text
            style={[
              styles.text,
              { color: isBestSpot ? "#000" : "#FFF" }
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>

          {/* Star badge for best spot */}
          {isBestSpot && <StarBadge />}
        </View>

        <View
          style={[
            styles.arrow,
            isBestSpot && styles.bestSpotArrow
          ]}
          collapsable={false}
        />
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
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(28, 28, 30, 0.85)",
  },
  bestSpotBubble: {
    backgroundColor: "rgba(245, 158, 11, 0.95)",
    borderColor: "#FBBF24",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
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
    borderTopColor: "rgba(255, 255, 255, 0.3)",
    marginTop: -2,
  },
  bestSpotArrow: {
    borderTopColor: "#FBBF24",
    borderTopWidth: 12,
    borderLeftWidth: 10,
    borderRightWidth: 10,
  },
  // Star badge
  starBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FBBF24",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  // Android specifik
  androidContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  androidBestIcon: {
    textShadowColor: "rgba(245, 158, 11, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});
