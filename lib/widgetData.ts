import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getSpotForecastEdr, type Serie } from "./dmi";
import type { WidgetConfig, WidgetData } from "../types/widget";

const WIDGET_CONFIG_KEY = "@widget_config";
const WIDGET_DATA_KEY = "@widget_data";

// --- Config (favorite spot) ---

export async function saveWidgetConfig(config: WidgetConfig): Promise<void> {
  await AsyncStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(config));
}

export async function getWidgetConfig(): Promise<WidgetConfig | null> {
  const raw = await AsyncStorage.getItem(WIDGET_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearWidgetConfig(): Promise<void> {
  await AsyncStorage.removeItem(WIDGET_CONFIG_KEY);
  await AsyncStorage.removeItem(WIDGET_DATA_KEY);
}

// --- Widget data update ---

function getClosestValue(series: Serie[], ts: number): number | null {
  if (!series || series.length === 0) return null;
  let closest = series[0];
  let closestDist = Math.abs(ts - closest.ts);
  for (const pt of series) {
    const dist = Math.abs(ts - pt.ts);
    if (dist < closestDist) {
      closest = pt;
      closestDist = dist;
    }
  }
  // Only accept if within 2 hours
  return closestDist < 2 * 60 * 60 * 1000 ? closest.v : null;
}

function getWindDirLabel(deg: number | null): string {
  if (deg == null) return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Fetch current weather for the configured favorite spot and cache it.
 * Called on app launch and from background fetch.
 * Returns the widget data or null if no config/no data.
 */
export async function updateWidgetWeatherData(): Promise<WidgetData | null> {
  const config = await getWidgetConfig();
  if (!config) return null;

  try {
    const forecast = await getSpotForecastEdr(config.favoriteSpotLat, config.favoriteSpotLng);
    if (!forecast) return null;

    const now = Date.now();

    const waterTemp = getClosestValue(forecast.waterTempSeries, now);
    const airTemp = getClosestValue(forecast.airTempSeries, now);
    const windSpeed = getClosestValue(forecast.windSpeedSeries, now);
    const windDir = getClosestValue(forecast.windDirSeries, now);
    const waterLevel = getClosestValue(forecast.waterLevelSeries, now);

    // Simple catch forecast score (0-100) based on conditions
    // This is a lightweight version — full scoring requires user profile
    let score = 50; // baseline
    if (waterTemp != null) {
      if (waterTemp >= 6 && waterTemp <= 14) score += 15;
      else if (waterTemp >= 4 && waterTemp <= 16) score += 5;
      else score -= 10;
    }
    if (windSpeed != null) {
      if (windSpeed >= 2 && windSpeed <= 8) score += 15;
      else if (windSpeed < 2) score += 5;
      else score -= 10;
    }
    if (waterLevel != null) {
      if (Math.abs(waterLevel) <= 20) score += 10;
      else if (Math.abs(waterLevel) <= 40) score += 5;
    }
    score = Math.max(0, Math.min(100, score));

    const data: WidgetData = {
      spotName: config.favoriteSpotName,
      waterTempC: waterTemp != null ? Math.round(waterTemp * 10) / 10 : null,
      airTempC: airTemp != null ? Math.round(airTemp * 10) / 10 : null,
      windSpeedMS: windSpeed != null ? Math.round(windSpeed * 10) / 10 : null,
      windDirDeg: windDir != null ? Math.round(windDir) : null,
      windDirLabel: getWindDirLabel(windDir),
      waterLevelCM: waterLevel != null ? Math.round(waterLevel) : null,
      catchForecastScore: score,
      updatedAt: new Date().toISOString(),
    };

    // Cache locally
    await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(data));

    // Write to shared storage for native widget
    await writeToSharedStorage(data);

    return data;
  } catch (e) {
    console.error("Widget data update error:", e);
    return null;
  }
}

/**
 * Get cached widget data without fetching.
 */
export async function getCachedWidgetData(): Promise<WidgetData | null> {
  const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Shared storage for native widgets ---

async function writeToSharedStorage(data: WidgetData): Promise<void> {
  if (Platform.OS === "ios") {
    // iOS: Write to App Group UserDefaults
    // This requires a native module bridge — will be implemented via Config Plugin
    // For now, data is cached in AsyncStorage and will be bridged later
    try {
      const { default: SharedGroupPreferences } = await import(
        "react-native-shared-group-preferences"
      ).catch(() => ({ default: null }));
      if (SharedGroupPreferences) {
        await SharedGroupPreferences.setItem(
          "widgetData",
          JSON.stringify(data),
          "group.dk.havoerred.logbog"
        );
      }
    } catch {
      // SharedGroupPreferences not installed yet — graceful fallback
    }
  }
  // Android: SharedPreferences handled by react-native-android-widget if installed
}
