// lib/weatherAlertScheduler.ts
// Background scheduler for weather-based fishing alerts

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  UserCatchProfile,
  WeatherAlertSettings,
  PendingWeatherAlert,
  ForecastMatch,
} from "../types/catchProfile";
import {
  WeatherAlertUserDocument,
  FIRESTORE_COLLECTIONS,
  FIRESTORE_DOCS,
} from "../types/weatherAlerts";
import {
  findBestForecastMatches,
  formatMatchForNotification,
  DEFAULT_MIN_MATCH_SCORE,
} from "./forecastMatcher";
import { generateUserCatchProfile, hasEnoughDataForAlerts, getCurrentSeason } from "./catchProfileGenerator";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { getActivePushTokens } from "./pushTokenManager";

// ============================================================================
// Constants
// ============================================================================

const WEATHER_ALERT_TASK = "weather_alert_check";
const STORAGE_KEY_SETTINGS = "weather_alert_settings";
const STORAGE_KEY_PROFILE = "weather_alert_profile";
const STORAGE_KEY_LAST_ALERT = "weather_alert_last";

// Minimum interval between alerts (hours)
const MIN_ALERT_INTERVAL_HOURS = 12;

// Background fetch interval (minimum 15 minutes on iOS)
const BACKGROUND_FETCH_INTERVAL = 15 * 60; // 15 minutes

// ============================================================================
// Storage Helpers
// ============================================================================

export async function getAlertSettings(): Promise<WeatherAlertSettings | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function saveAlertSettings(settings: WeatherAlertSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

export async function getCachedProfile(): Promise<UserCatchProfile | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function saveCachedProfile(profile: UserCatchProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
}

async function getLastAlertTime(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY_LAST_ALERT);
    return data ? parseInt(data, 10) : 0;
  } catch {
    return 0;
  }
}

async function setLastAlertTime(timestamp: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_LAST_ALERT, timestamp.toString());
}

// ============================================================================
// Default Settings
// ============================================================================

export function getDefaultAlertSettings(): WeatherAlertSettings {
  return {
    enabled: false,
    minimumMatchScore: DEFAULT_MIN_MATCH_SCORE,
    alertFrequency: "daily",
    quietHoursStart: 22,
    quietHoursEnd: 7,
    monitoredSpotIds: [],
    lastAlertSent: undefined,
    lastForecastCheck: undefined,
  };
}

// ============================================================================
// Notification Setup
// ============================================================================

export async function setupNotifications(): Promise<boolean> {
  // Skip on Android Expo Go
  if (Platform.OS === "android" && !__DEV__) {
    // In production, this should work
  }

  try {
    const existingPermissions = await Notifications.getPermissionsAsync();
    const existingGranted =
      (existingPermissions as any).granted || (existingPermissions as any).status === "granted";

    let finalGranted = existingGranted;

    if (!existingGranted) {
      const newPermissions = await Notifications.requestPermissionsAsync();
      finalGranted =
        (newPermissions as any).granted || (newPermissions as any).status === "granted";
    }

    if (!finalGranted) {
      console.log("Notification permissions not granted");
      return false;
    }

    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    return true;
  } catch (error) {
    console.error("Error setting up notifications:", error);
    return false;
  }
}

// ============================================================================
// Alert Sending
// ============================================================================

async function sendWeatherAlert(
  match: ForecastMatch,
  spotName: string
): Promise<string | null> {
  try {
    const { title, body } = formatMatchForNotification(match);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: `📍 ${spotName}: ${body}`,
        data: {
          type: "weather_alert",
          match: JSON.stringify(match),
          spotName,
        },
        sound: true,
      },
      trigger: null, // Send immediately
    });

    await setLastAlertTime(Date.now());

    return notificationId;
  } catch (error) {
    console.error("Error sending weather alert:", error);
    return null;
  }
}

// ============================================================================
// Quiet Hours Check
// ============================================================================

function isQuietHours(settings: WeatherAlertSettings): boolean {
  if (settings.quietHoursStart == null || settings.quietHoursEnd == null) {
    return false;
  }

  const now = new Date();
  const hour = now.getHours();

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (settings.quietHoursStart > settings.quietHoursEnd) {
    return hour >= settings.quietHoursStart || hour < settings.quietHoursEnd;
  }

  return hour >= settings.quietHoursStart && hour < settings.quietHoursEnd;
}

// ============================================================================
// Main Check Function
// ============================================================================

export type CheckResult = {
  checked: boolean;
  alertSent: boolean;
  match: ForecastMatch | null;
  reason?: string;
};

/**
 * Check forecast and send alert if conditions match
 * This is the main function called by the background task
 */
export async function checkForecastAndAlert(
  trips: any[],
  spots: { id: string; name: string; lat: number; lng: number }[]
): Promise<CheckResult> {
  // Load settings
  const settings = await getAlertSettings();

  if (!settings || !settings.enabled) {
    return { checked: false, alertSent: false, match: null, reason: "Alerts disabled" };
  }

  // Check quiet hours
  if (isQuietHours(settings)) {
    return { checked: false, alertSent: false, match: null, reason: "Quiet hours" };
  }

  // Check minimum interval since last alert
  const lastAlert = await getLastAlertTime();
  const hoursSinceLastAlert = (Date.now() - lastAlert) / (1000 * 60 * 60);

  if (hoursSinceLastAlert < MIN_ALERT_INTERVAL_HOURS) {
    return {
      checked: false,
      alertSent: false,
      match: null,
      reason: `Too soon since last alert (${Math.round(hoursSinceLastAlert)}h ago)`,
    };
  }

  // Generate profile from trips
  const profile = generateUserCatchProfile(trips, settings.monitoredSpotIds);

  // Check if user has enough data
  if (!hasEnoughDataForAlerts(profile)) {
    return {
      checked: true,
      alertSent: false,
      match: null,
      reason: `Not enough trips (${profile.totalTrips}/${profile.minimumTripsRequired})`,
    };
  }

  // Cache the profile
  await saveCachedProfile(profile);

  // Get spots to monitor
  const monitoredSpots = settings.monitoredSpotIds.length > 0
    ? spots.filter((s) => settings.monitoredSpotIds.includes(s.id))
    : spots.slice(0, 3); // Default: first 3 spots

  if (monitoredSpots.length === 0) {
    return { checked: true, alertSent: false, match: null, reason: "No spots to monitor" };
  }

  // Check each spot for matches
  let bestOverallMatch: ForecastMatch | null = null;
  let bestSpot: typeof monitoredSpots[0] | null = null;

  for (const spot of monitoredSpots) {
    try {
      const result = await findBestForecastMatches(profile, spot.lat, spot.lng, {
        minScore: settings.minimumMatchScore,
        maxResults: 1,
        daysAhead: 3, // Look 3 days ahead
      });

      if (result.bestMatch) {
        if (!bestOverallMatch || result.bestMatch.score > bestOverallMatch.score) {
          bestOverallMatch = result.bestMatch;
          bestSpot = spot;
        }
      }
    } catch (error) {
      console.error(`Error checking spot ${spot.name}:`, error);
    }
  }

  // Update last check time
  settings.lastForecastCheck = new Date().toISOString();
  await saveAlertSettings(settings);

  // Send alert if we found a good match
  if (bestOverallMatch && bestSpot) {
    const notificationId = await sendWeatherAlert(bestOverallMatch, bestSpot.name);

    if (notificationId) {
      settings.lastAlertSent = new Date().toISOString();
      await saveAlertSettings(settings);

      return {
        checked: true,
        alertSent: true,
        match: bestOverallMatch,
      };
    }
  }

  return {
    checked: true,
    alertSent: false,
    match: bestOverallMatch,
    reason: bestOverallMatch ? "Match found but alert failed" : "No matching conditions",
  };
}

// ============================================================================
// Background Task Definition
// ============================================================================

// Define the background task
TaskManager.defineTask(WEATHER_ALERT_TASK, async () => {
  try {
    // In a real implementation, you would load trips and spots from Firestore here
    // For now, we'll use cached profile
    const cachedProfile = await getCachedProfile();

    if (!cachedProfile) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // This is a simplified version - in production, you'd fetch fresh data
    console.log("[WeatherAlert] Background task running...");

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error("[WeatherAlert] Background task error:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ============================================================================
// Background Task Registration
// ============================================================================

export async function registerBackgroundTask(): Promise<boolean> {
  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WEATHER_ALERT_TASK);

    if (isRegistered) {
      console.log("[WeatherAlert] Background task already registered");
      return true;
    }

    // Register background fetch
    await BackgroundFetch.registerTaskAsync(WEATHER_ALERT_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log("[WeatherAlert] Background task registered");
    return true;
  } catch (error) {
    console.error("[WeatherAlert] Failed to register background task:", error);
    return false;
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WEATHER_ALERT_TASK);

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(WEATHER_ALERT_TASK);
      console.log("[WeatherAlert] Background task unregistered");
    }
  } catch (error) {
    console.error("[WeatherAlert] Failed to unregister background task:", error);
  }
}

// ============================================================================
// Manual Trigger (for testing)
// ============================================================================

export async function triggerManualCheck(
  trips: any[],
  spots: { id: string; name: string; lat: number; lng: number }[]
): Promise<CheckResult> {
  console.log("[WeatherAlert] Manual check triggered");
  return checkForecastAndAlert(trips, spots);
}

// ============================================================================
// Firestore Sync
// ============================================================================

/**
 * Sync alert settings to Firestore for server-side processing
 */
export async function syncSettingsToFirestore(
  settings: WeatherAlertSettings,
  profile: UserCatchProfile | null,
  spots: { id: string; name: string; lat: number; lng: number }[]
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    console.log("[WeatherAlert] Cannot sync - user not authenticated");
    return false;
  }

  try {
    // Get current push tokens
    const pushTokens = await getActivePushTokens();

    // Build monitored spots array
    const monitoredSpots = settings.monitoredSpotIds.length > 0
      ? spots
          .filter((s) => settings.monitoredSpotIds.includes(s.id))
          .map((s) => ({
            spotId: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
          }))
      : spots.slice(0, 3).map((s) => ({
          spotId: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        }));

    // Build profile summary for server-side matching
    const currentSeason = getCurrentSeason();
    const seasonalProfile = profile?.profiles[currentSeason] || profile?.allSeasons;

    const profileSummary = seasonalProfile
      ? {
          bestWindSpeedRange: seasonalProfile.bestWindSpeedRange,
          bestWindDirection: seasonalProfile.bestWindDirection,
          bestTideLevel: seasonalProfile.bestTideLevel,
          bestTimeOfDay: seasonalProfile.bestTimeOfDay,
          bestWaterTempRange: seasonalProfile.bestWaterTempRange,
        }
      : undefined;

    // Create the aggregated document
    const alertUserDoc: WeatherAlertUserDocument = {
      userId: user.uid,
      enabled: settings.enabled,
      minimumMatchScore: settings.minimumMatchScore,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      lastAlertSent: settings.lastAlertSent,
      lastForecastCheck: settings.lastForecastCheck,
      monitoredSpots,
      pushTokens,
      currentSeason,
      hasEnoughData: profile ? hasEnoughDataForAlerts(profile) : false,
      profileSummary,
      updatedAt: new Date().toISOString(),
    };

    // Save to Firestore
    const docRef = doc(db, FIRESTORE_COLLECTIONS.weatherAlertUsers, user.uid);
    await setDoc(docRef, alertUserDoc, { merge: true });

    console.log("[WeatherAlert] Settings synced to Firestore");
    return true;
  } catch (error) {
    console.error("[WeatherAlert] Error syncing to Firestore:", error);
    return false;
  }
}

/**
 * Disable alerts in Firestore (when user turns off alerts)
 */
export async function disableAlertsInFirestore(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  try {
    const docRef = doc(db, FIRESTORE_COLLECTIONS.weatherAlertUsers, user.uid);
    await setDoc(
      docRef,
      {
        enabled: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("[WeatherAlert] Alerts disabled in Firestore");
    return true;
  } catch (error) {
    console.error("[WeatherAlert] Error disabling alerts:", error);
    return false;
  }
}

/**
 * Remove user from weather alerts completely
 */
export async function removeFromWeatherAlerts(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  try {
    const docRef = doc(db, FIRESTORE_COLLECTIONS.weatherAlertUsers, user.uid);
    await deleteDoc(docRef);

    console.log("[WeatherAlert] User removed from weather alerts");
    return true;
  } catch (error) {
    console.error("[WeatherAlert] Error removing from weather alerts:", error);
    return false;
  }
}

/**
 * Get weather alert status from Firestore
 */
export async function getFirestoreAlertStatus(): Promise<{
  enabled: boolean;
  lastAlertSent?: string;
  lastForecastCheck?: string;
} | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }

  try {
    const docRef = doc(db, FIRESTORE_COLLECTIONS.weatherAlertUsers, user.uid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as WeatherAlertUserDocument;
    return {
      enabled: data.enabled,
      lastAlertSent: data.lastAlertSent,
      lastForecastCheck: data.lastForecastCheck,
    };
  } catch (error) {
    console.error("[WeatherAlert] Error getting Firestore status:", error);
    return null;
  }
}

// ============================================================================
// Initialization
// ============================================================================

export async function initializeWeatherAlerts(): Promise<void> {
  const settings = await getAlertSettings();

  if (!settings) {
    // Initialize with default settings
    await saveAlertSettings(getDefaultAlertSettings());
  }

  // Setup notifications
  await setupNotifications();
}
