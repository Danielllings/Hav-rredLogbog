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
  language?: "da" | "en";
  /** Max hours ahead for hourly mode (default 48) */
  maxHours?: number;
}

// Explicit weekday abbreviations to avoid Intl/Hermes locale issues
const WEEKDAYS_SHORT_DA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const WEEKDAYS_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Get Copenhagen local time parts from a UTC Date */
function toCopenhagen(date: Date): { day: number; hour: number; minute: number } {
  // Use Intl to get the correct offset for Europe/Copenhagen (handles DST)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  // Map weekday name to day index (0=Sun, 1=Mon, ...)
  const weekdayStr = parts.find(p => p.type === "weekday")?.value || "Sun";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekdayStr] ?? 0;
  return { day, hour, minute };
}

/** Generate hourly forecast options */
function getHourlyOptions(language: "da" | "en" = "da", maxHours = 48): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  const utcHour = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0, 0, 0
  ));

  const weekdays = language === "da" ? WEEKDAYS_SHORT_DA : WEEKDAYS_SHORT_EN;
  for (let h = 0; h <= maxHours; h++) {
    const time = new Date(utcHour.getTime() + h * 60 * 60 * 1000);
    const iso = time.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const cph = toCopenhagen(time);
    const hh = String(cph.hour).padStart(2, "0");
    const mm = String(cph.minute).padStart(2, "0");
    const label = `${weekdays[cph.day]} ${hh}:${mm}`;
    options.push({ label, value: iso });
  }
  return options;
}

// Explicit month abbreviations to avoid Intl/Hermes locale issues
const MONTHS_SHORT_DA = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Generate daily forecast options (next 10 days) */
function getDailyOptions(language: "da" | "en" = "da"): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();

  const weekdays = language === "da" ? WEEKDAYS_SHORT_DA : WEEKDAYS_SHORT_EN;
  const months = language === "da" ? MONTHS_SHORT_DA : MONTHS_SHORT_EN;
  for (let d = 0; d < 10; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const iso = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay();
    const dayNum = date.getDate();
    const monthIdx = date.getMonth();
    const label = `${weekdays[dayOfWeek]} ${dayNum}. ${months[monthIdx]}`;
    options.push({ label, value: iso });
  }
  return options;
}

export function ForecastSlider({ mode, value, onValueChange, color, language = "da", maxHours = 48 }: Props) {
  const { theme } = useTheme();
  const accentColor = color || theme.primary;

  const options = useMemo(
    () => (mode === "hourly" ? getHourlyOptions(language, maxHours) : getDailyOptions(language)),
    [mode, language, maxHours]
  );

  const maxValue = mode === "hourly" ? maxHours : 9;
  const days = Math.round(maxHours / 24);
  const startLabel = mode === "hourly" ? (language === "da" ? "Nu" : "Now") : (language === "da" ? "I dag" : "Today");
  const endLabel = mode === "hourly" ? (language === "da" ? `+${days}d` : `+${days}d`) : "+10d";

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
export function getForecastValue(mode: SliderMode, index: number, maxHours = 168): string {
  const options = mode === "hourly" ? getHourlyOptions("da", maxHours) : getDailyOptions();
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
