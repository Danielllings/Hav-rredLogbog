/**
 * MoonPhaseCard - Viser aktuel månefase og 7-dages forecast
 * Bruger suncalc til beregninger
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SunCalc from "suncalc";
import { APPLE } from "../../constants/appleTheme";
import { GlassCard } from "./GlassCard";

type MoonPhaseInfo = {
  phase: number; // 0-1
  illumination: number; // 0-1
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function getMoonPhaseInfo(date: Date): MoonPhaseInfo {
  const moon = SunCalc.getMoonIllumination(date);
  const phase = moon.phase;
  const illumination = moon.fraction;

  // Bestem fase-navn og ikon baseret på phase (0-1)
  // 0 = Nymåne, 0.25 = Første kvarter, 0.5 = Fuldmåne, 0.75 = Sidste kvarter
  let name: string;
  let icon: keyof typeof Ionicons.glyphMap;

  if (phase < 0.0625 || phase >= 0.9375) {
    name = "Nymåne";
    icon = "moon-outline";
  } else if (phase < 0.1875) {
    name = "Tiltagende måne";
    icon = "moon-outline";
  } else if (phase < 0.3125) {
    name = "Første kvarter";
    icon = "moon-outline";
  } else if (phase < 0.4375) {
    name = "Tiltagende måne";
    icon = "moon";
  } else if (phase < 0.5625) {
    name = "Fuldmåne";
    icon = "moon";
  } else if (phase < 0.6875) {
    name = "Aftagende måne";
    icon = "moon";
  } else if (phase < 0.8125) {
    name = "Sidste kvarter";
    icon = "moon";
  } else {
    name = "Aftagende måne";
    icon = "moon-outline";
  }

  return { phase, illumination, name, icon };
}

function getForecast(days: number = 7): { date: Date; info: MoonPhaseInfo }[] {
  const forecast: { date: Date; info: MoonPhaseInfo }[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0); // Midt på dagen

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    forecast.push({
      date,
      info: getMoonPhaseInfo(date),
    });
  }

  return forecast;
}

const WEEKDAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];

interface MoonPhaseCardProps {
  style?: object;
}

export function MoonPhaseCard({ style }: MoonPhaseCardProps) {
  const currentMoon = useMemo(() => getMoonPhaseInfo(new Date()), []);
  const forecast = useMemo(() => getForecast(7), []);

  const illuminationPct = Math.round(currentMoon.illumination * 100);

  return (
    <GlassCard style={style}>
      {/* Aktuel månefase */}
      <View style={styles.currentRow}>
        <View style={styles.moonIconWrap}>
          <Ionicons name={currentMoon.icon} size={32} color={APPLE.accent} />
        </View>
        <View style={styles.currentInfo}>
          <Text style={styles.phaseName}>{currentMoon.name}</Text>
          <Text style={styles.illumination}>{illuminationPct}% belyst</Text>
        </View>
      </View>

      {/* Separator */}
      <View style={styles.separator} />

      {/* 7-dages forecast */}
      <View style={styles.forecastRow}>
        {forecast.map((day, idx) => {
          const dayName = idx === 0 ? "I dag" : WEEKDAYS_SHORT[day.date.getDay()];
          const illum = Math.round(day.info.illumination * 100);

          return (
            <View key={idx} style={styles.forecastDay}>
              <Text style={styles.forecastDayLabel}>{dayName}</Text>
              <View style={styles.forecastIconWrap}>
                <Ionicons
                  name={day.info.icon}
                  size={18}
                  color={idx === 0 ? APPLE.accent : APPLE.textSecondary}
                />
              </View>
              <Text style={styles.forecastIllum}>{illum}%</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  moonIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: APPLE.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  currentInfo: {
    marginLeft: 16,
    flex: 1,
  },
  phaseName: {
    fontSize: 18,
    fontWeight: "600",
    color: APPLE.text,
  },
  illumination: {
    fontSize: 14,
    color: APPLE.textSecondary,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: APPLE.glassBorder,
    marginVertical: 16,
  },
  forecastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  forecastDay: {
    alignItems: "center",
    flex: 1,
  },
  forecastDayLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  forecastIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: APPLE.gray1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  forecastIllum: {
    fontSize: 10,
    color: APPLE.textSecondary,
  },
});
