// shared/components/OceanLegend.tsx
// Legend component for ocean current and salinity overlays

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

type LegendType = "currents" | "salinity";

interface OceanLegendProps {
  type: LegendType;
  language?: "da" | "en";
  onClose?: () => void;
}

const CURRENT_LEGEND = {
  da: {
    title: "Havstrøm",
    items: [
      { color: "#1e4d7a", label: "< 1.0 km/t (Svag)" },
      { color: "#2586bf", label: "1.0-2.0 km/t (Let)" },
      { color: "#5cc974", label: "2.0-3.5 km/t (Moderat)" },
      { color: "#f0c800", label: "3.5-5.0 km/t (Stærk)" },
      { color: "#f54040", label: "> 5.0 km/t (Meget stærk)" },
    ],
  },
  en: {
    title: "Ocean Current",
    items: [
      { color: "#1e4d7a", label: "< 1.0 km/h (Weak)" },
      { color: "#2586bf", label: "1.0-2.0 km/h (Light)" },
      { color: "#5cc974", label: "2.0-3.5 km/h (Moderate)" },
      { color: "#f0c800", label: "3.5-5.0 km/h (Strong)" },
      { color: "#f54040", label: "> 5.0 km/h (Very strong)" },
    ],
  },
};

const SALINITY_LEGEND = {
  da: {
    title: "Saltholdighed (PSU)",
    items: [
      { color: "rgba(59, 130, 246, 0.7)", label: "< 10 PSU (Brakvand)" },
      { color: "rgba(139, 92, 246, 0.7)", label: "10-20 PSU (Blandet)" },
      { color: "rgba(249, 115, 22, 0.7)", label: "20-28 PSU (Overgangsvand)" },
      { color: "rgba(239, 68, 68, 0.7)", label: "> 28 PSU (Saltvand)" },
    ],
  },
  en: {
    title: "Salinity (PSU)",
    items: [
      { color: "rgba(59, 130, 246, 0.7)", label: "< 10 PSU (Brackish)" },
      { color: "rgba(139, 92, 246, 0.7)", label: "10-20 PSU (Mixed)" },
      { color: "rgba(249, 115, 22, 0.7)", label: "20-28 PSU (Transitional)" },
      { color: "rgba(239, 68, 68, 0.7)", label: "> 28 PSU (Marine)" },
    ],
  },
};

export function OceanLegend({ type, language = "da", onClose }: OceanLegendProps) {
  const legend = type === "currents" ? CURRENT_LEGEND[language] : SALINITY_LEGEND[language];
  const icon = type === "currents" ? "navigate" : "water";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name={icon}
          size={16}
          color={type === "currents" ? "#22C55E" : "#3B82F6"}
        />
        <Text style={styles.title}>{legend.title}</Text>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color="#A1A1AA" />
          </Pressable>
        )}
      </View>
      <View style={styles.items}>
        {legend.items.map((item, index) => (
          <View key={index} style={styles.item}>
            <View
              style={[
                styles.colorBox,
                { backgroundColor: item.color },
                type === "currents" && styles.colorBoxArrow,
              ]}
            >
              {type === "currents" && (
                <Ionicons name="arrow-up" size={10} color="#fff" />
              )}
            </View>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 120,
    left: 12,
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#333",
    maxWidth: 200,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
  items: {
    gap: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorBox: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  colorBoxArrow: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#A1A1AA",
    fontSize: 10,
    flex: 1,
  },
});

export default OceanLegend;
