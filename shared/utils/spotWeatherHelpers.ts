// Helper functions for spot-weather screen
import SunCalc from "suncalc";
import { type EdrForecast, type Serie } from "../../lib/dmi";

export const THEME = {
  bg: "#121212",
  card: "#1E1E1E",
  primary: "#FFFFFF",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  inputBg: "#2C2C2E",
  border: "#333333",
  graphYellow: "#F59E0B",
  danger: "#FF453A",
  success: "#22C55E",
  blue: "#5E9EFF",
  cyan: "#40E0D0",
  purple: "#C084FC",
};

export const BEST_SPOT_COLOR = "#F4D03F";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslateFn = (key: any) => string;

export function getWeatherIcon(
  temp: number,
  isNight: boolean
): { name: string; color: string } {
  if (temp > 15) return { name: "sunny", color: THEME.graphYellow };
  if (temp > 5) return { name: "cloudy", color: THEME.textSec };
  if (temp > 0) return { name: "rainy", color: THEME.blue };
  return { name: "snow", color: THEME.blue };
}

export function getForecastDays(
  edrData: EdrForecast | null,
  t?: TranslateFn
): { label: string; icon: string; temp: number }[] {
  if (!edrData || !edrData.airTempSeries || edrData.airTempSeries.length === 0)
    return [];

  const dayNames = t
    ? [t("sun"), t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat")]
    : ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
  const todayLabel = t ? t("today") : "I dag";

  const days: { label: string; icon: string; temp: number }[] = [];
  const today = new Date();

  for (let i = 0; i < 5; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const middayTs = checkDate.setHours(13, 0, 0, 0);

    const validSeries = edrData.airTempSeries.filter(
      (p) => typeof p.v === "number" && !isNaN(p.v)
    );

    if (validSeries.length === 0) return [];

    const dataPoint = validSeries.reduce(
      (prev, curr) =>
        Math.abs(curr.ts - middayTs) < Math.abs(prev.ts - middayTs)
          ? curr
          : prev,
      validSeries[0]
    );

    const isNight =
      checkDate.getHours() < 6 || checkDate.getHours() > 20;

    days.push({
      label: i === 0 ? todayLabel : dayNames[checkDate.getDay()],
      icon: getWeatherIcon(dataPoint.v, isNight).name,
      temp: dataPoint.v,
    });
  }
  return days;
}

export function getSunTimes(
  lat: number,
  lon: number
): { sunrise: string; sunset: string } {
  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lon);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return {
    sunrise: fmt(times.sunrise),
    sunset: fmt(times.sunset),
  };
}

// Parse timestamp helper for graphs
export function parseTimestamp(val: unknown): number | null {
  const num = Number(val);
  if (Number.isFinite(num)) {
    if (num > 1e12) return num; // ms
    if (num > 1e9) return num * 1000; // sek -> ms
  }
  const parsed = Date.parse(String(val));
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

// Filter valid series data points
export function filterValidSeries(series: Serie[]): Serie[] {
  if (!Array.isArray(series)) return [];

  return series
    .filter((d) => typeof d.v === "number" && !isNaN(d.v))
    .map((d) => {
      const ts = parseTimestamp(d.ts);
      return ts != null ? { ...d, ts } : null;
    })
    .filter((d): d is Serie => d !== null)
    .sort((a, b) => a.ts - b.ts);
}
