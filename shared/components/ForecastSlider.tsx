// shared/components/ForecastSlider.tsx
// Modern forecast time slider for ocean overlays

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { BlurView } from "expo-blur";
import { useTheme } from "../../lib/theme";

type SliderMode = "hourly" | "daily";

interface Props {
  mode: SliderMode;
  value: number;
  onValueChange: (value: number) => void;
  color?: string;
}

/** Generate hourly forecast options (next 48 hours) */
function getHourlyOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  const utcHour = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0, 0, 0
  ));

  for (let h = 0; h <= 48; h++) {
    const time = new Date(utcHour.getTime() + h * 60 * 60 * 1000);
    const iso = time.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const label = time.toLocaleString("da-DK", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Copenhagen",
    });
    options.push({ label, value: iso });
  }
  return options;
}

/** Generate daily forecast options (next 10 days) */
function getDailyOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();

  for (let d = 0; d < 10; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const iso = date.toISOString().split("T")[0];
    const label = date.toLocaleDateString("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    options.push({ label, value: iso });
  }
  return options;
}

export function ForecastSlider({ mode, value, onValueChange, color }: Props) {
  const { theme } = useTheme();
  const accentColor = color || theme.primary;

  const options = useMemo(
    () => (mode === "hourly" ? getHourlyOptions() : getDailyOptions()),
    [mode]
  );

  const maxValue = mode === "hourly" ? 48 : 9;
  const startLabel = mode === "hourly" ? "Nu" : "I dag";
  const endLabel = mode === "hourly" ? "+48t" : "+10d";

  const currentLabel = options[value]?.label || "";

  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.indicator, { backgroundColor: accentColor }]} />
        <Text style={styles.label}>{currentLabel}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={maxValue}
        step={1}
        value={value}
        onSlidingComplete={(val) => onValueChange(Math.round(val))}
        minimumTrackTintColor={accentColor}
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor="#fff"
      />
      <View style={styles.labels}>
        <Text style={styles.endLabel}>{startLabel}</Text>
        <Text style={styles.endLabel}>{endLabel}</Text>
      </View>
    </>
  );

  // Use BlurView on iOS for glassmorphism effect
  if (Platform.OS === "ios") {
    return (
      <BlurView intensity={40} tint="dark" style={styles.container}>
        <View style={styles.innerContainer}>{content}</View>
      </BlurView>
    );
  }

  return <View style={[styles.container, styles.androidContainer]}>{content}</View>;
}

/** Get the ISO datetime/date string for a given index */
export function getForecastValue(mode: SliderMode, index: number): string {
  const options = mode === "hourly" ? getHourlyOptions() : getDailyOptions();
  return options[index]?.value || "";
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 30,
    left: 16,
    right: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  androidContainer: {
    backgroundColor: "rgba(10,10,18,0.92)",
  },
  innerContainer: {
    padding: 14,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  slider: {
    width: "100%",
    height: 36,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: -4,
  },
  endLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "500",
  },
});

export default ForecastSlider;
