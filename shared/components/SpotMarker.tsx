import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Marker, Callout } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { type SpotRow } from "../../lib/spots";

const BEST_SPOT_COLOR = "#F4D03F";

const THEME = {
  text: "#FFFFFF",
};

type TranslateFn = (key: any) => string;

interface SpotMarkerProps {
  spot: SpotRow;
  isBestSpot: boolean;
  onPress: () => void;
  onLongPress: () => void;
  useNativeMarker?: boolean;
  t: TranslateFn;
}

export function SpotMarker({
  spot,
  isBestSpot,
  onPress,
  onLongPress,
  useNativeMarker = true,
  t,
}: SpotMarkerProps) {
  const isAndroid = Platform.OS === "android";
  const defaultPin = "#FF3B30";

  if (isAndroid && useNativeMarker) {
    return (
      <Marker
        coordinate={{ latitude: spot.lat, longitude: spot.lng }}
        pinColor={isBestSpot ? BEST_SPOT_COLOR : defaultPin}
        title={spot.name}
        description={t("spot")}
        onPress={onPress}
        onCalloutPress={onLongPress}
        tracksViewChanges={false}
        zIndex={isBestSpot ? 2 : 1}
      >
        <Callout tooltip={false} onPress={onLongPress}>
          <View style={{ padding: 8, maxWidth: 200 }}>
            <Text style={{ fontWeight: "700", marginBottom: 4 }}>
              {spot.name}
            </Text>
            <Text style={{ color: "#666", fontSize: 12 }}>
              {t("tapToClose")}
            </Text>
          </View>
        </Callout>
      </Marker>
    );
  }

  if (isAndroid && !useNativeMarker) {
    return (
      <Marker
        coordinate={{ latitude: spot.lat, longitude: spot.lng }}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
        zIndex={isBestSpot ? 2 : 1}
      >
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
            paddingVertical: 4,
          }}
        >
          <Ionicons
            name="location-sharp"
            size={34}
            color={isBestSpot ? BEST_SPOT_COLOR : defaultPin}
            style={{ textShadowColor: "#000", textShadowRadius: 2 }}
          />
          <Text
            style={{
              color: "#fff",
              fontSize: 11,
              fontWeight: "700",
              backgroundColor: "rgba(0,0,0,0.65)",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              marginTop: -6,
            }}
            numberOfLines={1}
          >
            {spot.name}
          </Text>
        </Pressable>
      </Marker>
    );
  }

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      anchor={{ x: 0.5, y: 1 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      tracksViewChanges={false}
      onPress={onPress}
      identifier={String(spot.id)}
      flat
      zIndex={isBestSpot ? 2 : 1}
    >
      <Pressable
        style={({ pressed }) => [
          {
            width: 120,
            minHeight: 60,
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 4,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        collapsable={false}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={600}
        hitSlop={12}
      >
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: "#111",
            borderWidth: 1,
            borderColor: "#222",
            flexDirection: "row",
            alignItems: "center",
            maxWidth: 140,
            marginBottom: 6,
          }}
        >
          {isBestSpot && (
            <Ionicons
              name="star"
              size={12}
              color={BEST_SPOT_COLOR}
              style={{ marginRight: 4 }}
            />
          )}
          <Text
            style={{
              color: THEME.text,
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {spot.name}
          </Text>
        </View>

        <View style={{ position: "relative", alignItems: "center" }}>
          <View
            style={{
              position: "absolute",
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: isBestSpot ? "#c29d00" : "#b71c1c",
              top: 8,
            }}
          />
          <Ionicons
            name="location-sharp"
            size={34}
            color={isBestSpot ? BEST_SPOT_COLOR : "#e53935"}
            style={{ textShadowColor: "#000", textShadowRadius: 2 }}
          />
        </View>
      </Pressable>
    </Marker>
  );
}
