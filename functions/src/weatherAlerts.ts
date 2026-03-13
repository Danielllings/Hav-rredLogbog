// functions/src/weatherAlerts.ts
// Cloud Function for server-side weather alert notifications

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineString } from "firebase-functions/params";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// DMI API key for forecast data
const DMI_EDR_KEY = defineString("DMI_EDR_KEY");

// ============================================================================
// Types (mirroring client-side types)
// ============================================================================

type Season = "spring" | "summer" | "autumn" | "winter";

type Range = {
  min: number;
  max: number;
};

type WindDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type TideLevel = "low" | "medium" | "high";
type TimeOfDay = "morning" | "forenoon" | "afternoon" | "evening" | "night";

type ProfileSummary = {
  bestWindSpeedRange?: Range;
  bestWindDirection?: string;
  bestTideLevel?: string;
  bestTimeOfDay?: string;
  bestWaterTempRange?: Range;
};

type WeatherAlertUser = {
  userId: string;
  enabled: boolean;
  minimumMatchScore: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  lastAlertSent?: string;
  lastForecastCheck?: string;
  monitoredSpots: {
    spotId: string;
    name: string;
    lat: number;
    lng: number;
  }[];
  pushTokens: string[];
  currentSeason: Season;
  hasEnoughData: boolean;
  profileSummary?: ProfileSummary;
  updatedAt: string;
};

type ForecastPoint = {
  timestamp: number;
  airTempC: number | null;
  windMS: number | null;
  windDirDeg: number | null;
  waterLevelCM: number | null;
};

type MatchResult = {
  score: number;
  forecastTime: string;
  spotName: string;
  conditions: {
    windMS?: number;
    windDir?: string;
    airTempC?: number;
    waterLevelCM?: number;
  };
};

// ============================================================================
// Constants
// ============================================================================

const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [2, 3, 4],
  summer: [5, 6, 7],
  autumn: [8, 9, 10],
  winter: [11, 0, 1],
};

const SEASON_LABELS: Record<Season, string> = {
  spring: "Foraar",
  summer: "Sommer",
  autumn: "Efteraar",
  winter: "Vinter",
};

// Match weights (total = 100)
const WEIGHTS = {
  waterTemp: 30,
  windSpeed: 25,
  windDirection: 15,
  tideLevel: 20,
  timeOfDay: 10,
};

// Minimum interval between alerts per user (hours)
const MIN_ALERT_INTERVAL_HOURS = 12;

// ============================================================================
// Helper Functions
// ============================================================================

function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (SEASON_MONTHS.spring.includes(month)) return "spring";
  if (SEASON_MONTHS.summer.includes(month)) return "summer";
  if (SEASON_MONTHS.autumn.includes(month)) return "autumn";
  return "winter";
}

function isQuietHours(start: number | undefined, end: number | undefined): boolean {
  if (start == null || end == null) return false;

  const hour = new Date().getHours();

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return hour >= start || hour < end;
  }

  return hour >= start && hour < end;
}

function inRange(value: number, range: Range): boolean {
  return value >= range.min && value < range.max;
}

function getWindDirectionFromDeg(deg: number): WindDirection {
  const d = ((deg % 360) + 360) % 360;

  if (d >= 337.5 || d < 22.5) return "N";
  if (d >= 22.5 && d < 67.5) return "NE";
  if (d >= 67.5 && d < 112.5) return "E";
  if (d >= 112.5 && d < 157.5) return "SE";
  if (d >= 157.5 && d < 202.5) return "S";
  if (d >= 202.5 && d < 247.5) return "SW";
  if (d >= 247.5 && d < 292.5) return "W";
  return "NW";
}

function getTideLevelFromCM(cm: number): TideLevel {
  if (cm < -20) return "low";
  if (cm > 20) return "high";
  return "medium";
}

function getTimeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 9) return "morning";
  if (hour >= 9 && hour < 12) return "forenoon";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function windDirLabel(dir: WindDirection): string {
  const labels: Record<WindDirection, string> = {
    N: "Nord",
    NE: "Nordoest",
    E: "Oest",
    SE: "Sydoest",
    S: "Syd",
    SW: "Sydvest",
    W: "Vest",
    NW: "Nordvest",
  };
  return labels[dir];
}

// ============================================================================
// DMI Forecast Fetching
// ============================================================================

type Serie = { ts: number; v: number };

type EdrForecast = {
  airTempSeries: Serie[];
  windSpeedSeries: Serie[];
  windDirSeries: Serie[];
  waterLevelSeries: Serie[];
};

async function fetchForecast(lat: number, lng: number): Promise<EdrForecast | null> {
  // Validate coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    functions.logger.warn("Invalid coordinates:", { lat, lng });
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    functions.logger.warn("Coordinates out of range:", { lat, lng });
    return null;
  }

  const apiKey = DMI_EDR_KEY.value();
  if (!apiKey) {
    functions.logger.error("Missing DMI_EDR_KEY");
    return null;
  }

  const coords = `POINT(${lng} ${lat})`;
  const params = [
    "temperature-0m",
    "wind-speed-10m",
    "wind-dir-10m",
  ].join(",");

  const baseUrl = "https://dmigw.govcloud.dk/v1/forecastedr";
  const url = `${baseUrl}/collections/harmonie_dini_sf/position?coords=${encodeURIComponent(coords)}&parameter-name=${params}&f=CoverageJSON`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/prs.coverage+json, application/json",
        "X-Gravitee-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      functions.logger.error("DMI API error:", response.status);
      return null;
    }

    const data = await response.json();

    // Parse CoverageJSON response
    const times: number[] = data.domain?.axes?.t?.values || [];
    const ranges = data.ranges || {};

    const airTempSeries: Serie[] = [];
    const windSpeedSeries: Serie[] = [];
    const windDirSeries: Serie[] = [];

    const tempValues = ranges["temperature-0m"]?.values || [];
    const windValues = ranges["wind-speed-10m"]?.values || [];
    const dirValues = ranges["wind-dir-10m"]?.values || [];

    times.forEach((timeStr: any, i: number) => {
      const ts = new Date(timeStr).getTime();

      if (tempValues[i] != null) {
        // Convert Kelvin to Celsius
        airTempSeries.push({ ts, v: tempValues[i] - 273.15 });
      }
      if (windValues[i] != null) {
        windSpeedSeries.push({ ts, v: windValues[i] });
      }
      if (dirValues[i] != null) {
        windDirSeries.push({ ts, v: dirValues[i] });
      }
    });

    return {
      airTempSeries,
      windSpeedSeries,
      windDirSeries,
      waterLevelSeries: [], // Would need separate API for water level
    };
  } catch (error) {
    functions.logger.error("Error fetching forecast:", error);
    return null;
  }
}

function findClosestValue(series: Serie[], targetTs: number): number | null {
  if (!series.length) return null;

  let closest = series[0];
  let minDiff = Math.abs(series[0].ts - targetTs);

  for (const point of series) {
    const diff = Math.abs(point.ts - targetTs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }

  // Only accept if within 2 hours
  if (minDiff > 2 * 60 * 60 * 1000) return null;

  return closest.v;
}

// ============================================================================
// Match Calculation
// ============================================================================

function calculateMatchScore(
  profile: ProfileSummary,
  point: ForecastPoint,
  targetDate: Date
): number {
  let score = 0;

  const hour = targetDate.getHours();
  const forecastTimeOfDay = getTimeOfDayFromHour(hour);

  // Wind Speed (25%)
  if (point.windMS != null && profile.bestWindSpeedRange) {
    if (inRange(point.windMS, profile.bestWindSpeedRange)) {
      score += WEIGHTS.windSpeed;
    }
  }

  // Wind Direction (15%)
  if (point.windDirDeg != null && profile.bestWindDirection) {
    const forecastDir = getWindDirectionFromDeg(point.windDirDeg);
    if (forecastDir === profile.bestWindDirection) {
      score += WEIGHTS.windDirection;
    }
  }

  // Tide Level (20%)
  if (point.waterLevelCM != null && profile.bestTideLevel) {
    const forecastTide = getTideLevelFromCM(point.waterLevelCM);
    if (forecastTide === profile.bestTideLevel) {
      score += WEIGHTS.tideLevel;
    }
  }

  // Time of Day (10%)
  if (profile.bestTimeOfDay) {
    if (forecastTimeOfDay === profile.bestTimeOfDay) {
      score += WEIGHTS.timeOfDay;
    }
  }

  // Water Temperature (30%) - estimated from air temp
  if (point.airTempC != null && profile.bestWaterTempRange) {
    const estimatedWaterTemp = point.airTempC - 2;
    if (inRange(estimatedWaterTemp, profile.bestWaterTempRange)) {
      score += WEIGHTS.waterTemp;
    }
  }

  return Math.round(score);
}

async function findBestMatch(
  user: WeatherAlertUser,
  spot: { name: string; lat: number; lng: number }
): Promise<MatchResult | null> {
  if (!user.profileSummary) {
    return null;
  }

  const forecast = await fetchForecast(spot.lat, spot.lng);
  if (!forecast) {
    return null;
  }

  const now = Date.now();
  const endTime = now + 3 * 24 * 60 * 60 * 1000; // 3 days ahead

  let bestMatch: MatchResult | null = null;

  // Check every hour in the forecast
  for (let ts = now; ts < endTime; ts += 60 * 60 * 1000) {
    const targetDate = new Date(ts);
    const hour = targetDate.getHours();

    // Skip night hours (22:00 - 05:00) unless user's best time is night
    if (hour >= 22 || hour < 5) {
      if (user.profileSummary.bestTimeOfDay !== "night") continue;
    }

    const point: ForecastPoint = {
      timestamp: ts,
      airTempC: findClosestValue(forecast.airTempSeries, ts),
      windMS: findClosestValue(forecast.windSpeedSeries, ts),
      windDirDeg: findClosestValue(forecast.windDirSeries, ts),
      waterLevelCM: findClosestValue(forecast.waterLevelSeries, ts),
    };

    const score = calculateMatchScore(user.profileSummary, point, targetDate);

    if (score >= user.minimumMatchScore) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          score,
          forecastTime: targetDate.toISOString(),
          spotName: spot.name,
          conditions: {
            windMS: point.windMS ?? undefined,
            windDir: point.windDirDeg != null
              ? windDirLabel(getWindDirectionFromDeg(point.windDirDeg))
              : undefined,
            airTempC: point.airTempC != null
              ? Math.round(point.airTempC * 10) / 10
              : undefined,
            waterLevelCM: point.waterLevelCM ?? undefined,
          },
        };
      }
    }
  }

  return bestMatch;
}

// ============================================================================
// Push Notification Sending
// ============================================================================

async function sendPushNotification(
  tokens: string[],
  match: MatchResult,
  season: Season
): Promise<void> {
  if (tokens.length === 0) {
    functions.logger.info("No push tokens to send to");
    return;
  }

  const date = new Date(match.forecastTime);
  const dayName = date.toLocaleDateString("da-DK", { weekday: "long" });
  const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

  const conditions: string[] = [];
  if (match.conditions.windMS != null) {
    conditions.push(`${match.conditions.windMS} m/s ${match.conditions.windDir || ""}`);
  }
  if (match.conditions.airTempC != null) {
    conditions.push(`${match.conditions.airTempC}C`);
  }

  const title = `Godt fiskevejr ${dayName} kl. ${time}!`;
  const body = `${match.score}% match med dit ${SEASON_LABELS[season].toLowerCase()}-moenster ved ${match.spotName}. ${conditions.join(", ")}`;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      type: "weather_alert",
      score: match.score.toString(),
      forecastTime: match.forecastTime,
      spotName: match.spotName,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "weather_alerts",
        icon: "ic_notification",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    functions.logger.info(
      `Push sent: ${response.successCount} success, ${response.failureCount} failed`
    );

    // Handle failed tokens - remove invalid tokens from Firestore
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            functions.logger.info(`Invalid token: ${tokens[idx]}`);
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      // Remove invalid tokens from Firestore
      for (const invalidToken of invalidTokens) {
        await removeInvalidToken(invalidToken);
      }
    }
  } catch (error) {
    functions.logger.error("Error sending push notification:", error);
  }
}

// ============================================================================
// Main Scheduled Function
// ============================================================================

/**
 * Check weather conditions and send alerts to eligible users
 * Runs every 2 hours
 */
export const checkWeatherAlerts = onSchedule(
  {
    schedule: "0 */2 * * *", // Every 2 hours
    timeZone: "Europe/Copenhagen",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    functions.logger.info("Starting weather alert check");

    const now = Date.now();
    const currentSeason = getCurrentSeason();

    // Query all enabled users with push tokens
    const usersSnapshot = await db
      .collection("weatherAlertUsers")
      .where("enabled", "==", true)
      .where("hasEnoughData", "==", true)
      .get();

    functions.logger.info(`Found ${usersSnapshot.size} eligible users`);

    let alertsSent = 0;
    let usersSkipped = 0;

    for (const doc of usersSnapshot.docs) {
      const user = doc.data() as WeatherAlertUser;

      // Skip if no push tokens
      if (!user.pushTokens || user.pushTokens.length === 0) {
        usersSkipped++;
        continue;
      }

      // Skip if in quiet hours
      if (isQuietHours(user.quietHoursStart, user.quietHoursEnd)) {
        usersSkipped++;
        continue;
      }

      // Skip if alert sent recently
      if (user.lastAlertSent) {
        const lastSent = new Date(user.lastAlertSent).getTime();
        const hoursSinceLastAlert = (now - lastSent) / (1000 * 60 * 60);
        if (hoursSinceLastAlert < MIN_ALERT_INTERVAL_HOURS) {
          usersSkipped++;
          continue;
        }
      }

      // Skip if no monitored spots
      if (!user.monitoredSpots || user.monitoredSpots.length === 0) {
        usersSkipped++;
        continue;
      }

      // Find best match across all monitored spots
      let bestOverallMatch: MatchResult | null = null;

      for (const spot of user.monitoredSpots) {
        try {
          const match = await findBestMatch(user, spot);
          if (match && (!bestOverallMatch || match.score > bestOverallMatch.score)) {
            bestOverallMatch = match;
          }
        } catch (error) {
          functions.logger.error(`Error checking spot ${spot.name}:`, error);
        }
      }

      // Send notification if good match found
      if (bestOverallMatch) {
        await sendPushNotification(user.pushTokens, bestOverallMatch, currentSeason);

        // Update last alert time
        await db.collection("weatherAlertUsers").doc(user.userId).update({
          lastAlertSent: new Date().toISOString(),
          lastForecastCheck: new Date().toISOString(),
        });

        // Save to alert history
        await db
          .collection("users")
          .doc(user.userId)
          .collection("alertHistory")
          .add({
            spotName: bestOverallMatch.spotName,
            score: bestOverallMatch.score,
            forecastTime: bestOverallMatch.forecastTime,
            conditions: bestOverallMatch.conditions,
            sentAt: new Date().toISOString(),
            status: "sent",
          });

        alertsSent++;
      } else {
        // Update last check time even if no alert sent
        await db.collection("weatherAlertUsers").doc(user.userId).update({
          lastForecastCheck: new Date().toISOString(),
        });
      }
    }

    functions.logger.info(
      `Weather alert check complete: ${alertsSent} alerts sent, ${usersSkipped} users skipped`
    );
  }
);

/**
 * Remove invalid push token from all users
 */
async function removeInvalidToken(token: string): Promise<void> {
  try {
    const usersSnapshot = await db
      .collection("weatherAlertUsers")
      .where("pushTokens", "array-contains", token)
      .get();

    for (const userDoc of usersSnapshot.docs) {
      const currentTokens = userDoc.data().pushTokens || [];
      await userDoc.ref.update({
        pushTokens: currentTokens.filter((t: string) => t !== token),
        updatedAt: new Date().toISOString(),
      });
      functions.logger.info(`Removed invalid token from user ${userDoc.id}`);
    }
  } catch (error) {
    functions.logger.error("Error removing invalid token:", error);
  }
}

/**
 * HTTP endpoint to manually trigger a weather check for a specific user
 * Useful for testing - rate limited to once per 5 minutes
 */
export const triggerWeatherCheck = functions.https.onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userDoc = await db.collection("weatherAlertUsers").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User not found in weatherAlertUsers");
  }

  const user = userDoc.data() as WeatherAlertUser;

  // Rate limiting: max once per 5 minutes
  const lastManualCheck = (userDoc.data() as any).lastManualCheck;
  if (lastManualCheck) {
    const minutesSinceLastCheck = (Date.now() - new Date(lastManualCheck).getTime()) / 60000;
    if (minutesSinceLastCheck < 5) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Please wait ${Math.ceil(5 - minutesSinceLastCheck)} minutes before checking again`
      );
    }
  }

  if (!user.enabled || !user.hasEnoughData) {
    return { success: false, message: "Alerts not enabled or not enough data" };
  }

  if (!user.monitoredSpots || user.monitoredSpots.length === 0) {
    return { success: false, message: "No monitored spots" };
  }

  // Find best match
  let bestMatch: MatchResult | null = null;
  for (const spot of user.monitoredSpots) {
    const match = await findBestMatch(user, spot);
    if (match && (!bestMatch || match.score > bestMatch.score)) {
      bestMatch = match;
    }
  }

  if (!bestMatch) {
    return { success: false, message: "No matching conditions found" };
  }

  // Send notification
  if (user.pushTokens && user.pushTokens.length > 0) {
    await sendPushNotification(user.pushTokens, bestMatch, getCurrentSeason());

    await db.collection("weatherAlertUsers").doc(userId).update({
      lastAlertSent: new Date().toISOString(),
      lastForecastCheck: new Date().toISOString(),
      lastManualCheck: new Date().toISOString(),
    });
  } else {
    // Update manual check time even without sending
    await db.collection("weatherAlertUsers").doc(userId).update({
      lastManualCheck: new Date().toISOString(),
    });
  }

  return {
    success: true,
    match: bestMatch,
  };
});
