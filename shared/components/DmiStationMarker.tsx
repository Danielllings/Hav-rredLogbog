import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { type OceanStation } from "../../lib/dmiOcean";

const DMI_BLUE = "#00AAFF";
const DMI_BLUE_DARK = "#0077CC";

const THEME = {
  text: "#FFFFFF",
};

type TranslateFn = (key: any) => string;

interface DmiStationMarkerProps {
  station: OceanStation;
  onPress?: () => void;
  t?: TranslateFn;
}

export function DmiStationMarker({ station, onPress, t }: DmiStationMarkerProps) {
  const isAndroid = Platform.OS === "android";
  const tempLabel = t ? t("waterTemp") : "Temp";
  const levelLabel = t ? t("waterLevel") : "Water level";

  // Android: Native marker med pinColor
  if (isAndroid) {
    return (
      <Marker
        coordinate={{ latitude: station.lat, longitude: station.lon }}
        pinColor={DMI_BLUE}
        title={station.name}
        description={`${station.hasTemp ? tempLabel : ""}${station.hasTemp && station.hasLevel ? " + " : ""}${station.hasLevel ? levelLabel : ""}`}
        onPress={onPress}
        tracksViewChanges={false}
        zIndex={0}
      />
    );
  }

  // iOS: Custom marker med label + pin (samme stil som SpotMarker)
  return (
    <Marker
      coordinate={{ latitude: station.lat, longitude: station.lon }}
      centerOffset={{ x: 0, y: -40 }}
      tracksViewChanges={false}
      onPress={onPress}
      identifier={`dmi-${station.id}`}
      zIndex={0}
    >
      <Pressable
        style={({ pressed }) => [
          {
            width: 120,
            height: 80,
            alignItems: "center",
            justifyContent: "flex-end",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        collapsable={false}
        onPress={onPress}
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
          <Ionicons
            name="water"
            size={12}
            color={DMI_BLUE}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              color: THEME.text,
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {station.name}
          </Text>
        </View>

        <View style={{ position: "relative", alignItems: "center" }}>
          <View
            style={{
              position: "absolute",
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: DMI_BLUE_DARK,
              top: 8,
            }}
          />
          <Ionicons
            name="location-sharp"
            size={34}
            color={DMI_BLUE}
            style={{ textShadowColor: "#000", textShadowRadius: 2 }}
          />
        </View>
      </Pressable>
    </Marker>
  );
}
