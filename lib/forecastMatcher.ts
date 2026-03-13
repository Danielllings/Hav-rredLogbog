// lib/forecastMatcher.ts
// Compares weather forecast with user's catch profile to find optimal fishing times

import {
  Season,
  SeasonalCatchProfile,
  UserCatchProfile,
  ForecastMatch,
  Range,
  WindDirection,
  TideLevel,
  TimeOfDay,
  SEASON_LABELS,
} from "../types/catchProfile";
import { EdrForecast, Serie, getSpotForecastEdr } from "./dmi";
import { getProfileForDate, getCurrentSeason } from "./catchProfileGenerator";

// ============================================================================
// Weight Configuration (total = 100%)
// ============================================================================

const WEIGHTS = {
  waterTemp: 30,
  windSpeed: 25,
  windDirection: 15,
  tideLevel: 20,
  timeOfDay: 10,
  // airTemp not used directly in score, but shown in summary
};

// Minimum score to consider a "good" match
export const DEFAULT_MIN_MATCH_SCORE = 70;

// ============================================================================
// Helper Functions
// ============================================================================

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

function windDirLabel(dir: WindDirection): string {
  const labels: Record<WindDirection, string> = {
    N: "Nord",
    NE: "Nordøst",
    E: "Øst",
    SE: "Sydøst",
    S: "Syd",
    SW: "Sydvest",
    W: "Vest",
    NW: "Nordvest",
  };
  return labels[dir];
}

function tideLevelLabel(level: TideLevel): string {
  const labels: Record<TideLevel, string> = {
    low: "Lavvande",
    medium: "Middel",
    high: "Højvande",
  };
  return labels[level];
}

function timeOfDayLabel(tod: TimeOfDay): string {
  const labels: Record<TimeOfDay, string> = {
    morning: "Morgen",
    forenoon: "Formiddag",
    afternoon: "Eftermiddag",
    evening: "Aften",
    night: "Nat",
  };
  return labels[tod];
}

// ============================================================================
// Match Calculation
// ============================================================================

type ForecastPoint = {
  timestamp: number;
  airTempC: number | null;
  waterTempC: number | null;
  windMS: number | null;
  windDirDeg: number | null;
  waterLevelCM: number | null;
};

function extractForecastPoint(
  forecast: EdrForecast,
  targetTs: number
): ForecastPoint {
  return {
    timestamp: targetTs,
    airTempC: findClosestValue(forecast.airTempSeries, targetTs),
    waterTempC: null, // EDR doesn't provide water temp forecast, we'll estimate from season
    windMS: findClosestValue(forecast.windSpeedSeries, targetTs),
    windDirDeg: findClosestValue(forecast.windDirSeries, targetTs),
    waterLevelCM: findClosestValue(forecast.waterLevelSeries, targetTs),
  };
}

function calculateMatchScore(
  profile: SeasonalCatchProfile,
  point: ForecastPoint,
  targetDate: Date
): ForecastMatch {
  let score = 0;
  const factors: ForecastMatch["factors"] = {};

  const hour = targetDate.getHours();
  const forecastTimeOfDay = getTimeOfDayFromHour(hour);

  // 1. Wind Speed (25%)
  if (point.windMS != null && profile.bestWindSpeedRange) {
    const matched = inRange(point.windMS, profile.bestWindSpeedRange);
    factors.windSpeed = {
      matched,
      weight: WEIGHTS.windSpeed,
      forecast: point.windMS,
      ideal: profile.bestWindSpeedRange,
    };
    if (matched) score += WEIGHTS.windSpeed;
  }

  // 2. Wind Direction (15%)
  if (point.windDirDeg != null && profile.bestWindDirection) {
    const forecastDir = getWindDirectionFromDeg(point.windDirDeg);
    const matched = forecastDir === profile.bestWindDirection;
    factors.windDirection = {
      matched,
      weight: WEIGHTS.windDirection,
      forecast: windDirLabel(forecastDir),
      ideal: windDirLabel(profile.bestWindDirection),
    };
    if (matched) score += WEIGHTS.windDirection;
  }

  // 3. Tide Level (20%)
  if (point.waterLevelCM != null && profile.bestTideLevel) {
    const forecastTide = getTideLevelFromCM(point.waterLevelCM);
    const matched = forecastTide === profile.bestTideLevel;
    factors.tideLevel = {
      matched,
      weight: WEIGHTS.tideLevel,
      forecast: tideLevelLabel(forecastTide),
      ideal: tideLevelLabel(profile.bestTideLevel),
    };
    if (matched) score += WEIGHTS.tideLevel;
  }

  // 4. Time of Day (10%)
  if (profile.bestTimeOfDay) {
    const matched = forecastTimeOfDay === profile.bestTimeOfDay;
    factors.timeOfDay = {
      matched,
      weight: WEIGHTS.timeOfDay,
      forecast: timeOfDayLabel(forecastTimeOfDay),
      ideal: timeOfDayLabel(profile.bestTimeOfDay),
    };
    if (matched) score += WEIGHTS.timeOfDay;
  }

  // 5. Water Temperature (30%) - estimated from air temp or seasonal average
  // Since EDR doesn't provide water temp, we use air temp as proxy with seasonal offset
  if (point.airTempC != null && profile.bestWaterTempRange) {
    // Water temp typically lags air temp by a few degrees depending on season
    // This is a rough estimate - real water temp would be better
    const estimatedWaterTemp = point.airTempC - 2; // Simple offset
    const matched = inRange(estimatedWaterTemp, profile.bestWaterTempRange);
    factors.waterTemp = {
      matched,
      weight: WEIGHTS.waterTemp,
      forecast: estimatedWaterTemp,
      ideal: profile.bestWaterTempRange,
    };
    if (matched) score += WEIGHTS.waterTemp;
  }

  // Air temp for display (not scored directly)
  if (point.airTempC != null && profile.bestAirTempRange) {
    const matched = inRange(point.airTempC, profile.bestAirTempRange);
    factors.airTemp = {
      matched,
      weight: 0, // Not counted in score
      forecast: point.airTempC,
      ideal: profile.bestAirTempRange,
    };
  }

  // Build forecast summary
  const forecastSummary: ForecastMatch["forecastSummary"] = {};
  if (point.airTempC != null) forecastSummary.airTempC = Math.round(point.airTempC * 10) / 10;
  if (point.windMS != null) forecastSummary.windMS = Math.round(point.windMS * 10) / 10;
  if (point.windDirDeg != null) {
    forecastSummary.windDir = windDirLabel(getWindDirectionFromDeg(point.windDirDeg));
  }
  if (point.waterLevelCM != null) forecastSummary.waterLevelCM = Math.round(point.waterLevelCM);

  const season = getCurrentSeason();

  return {
    score: Math.round(score),
    season,
    usedSeasonalProfile: profile.hasEnoughData,
    factors,
    forecastTime: targetDate.toISOString(),
    forecastSummary,
  };
}

// ============================================================================
// Public API
// ============================================================================

export type MatchResult = {
  matches: ForecastMatch[];
  bestMatch: ForecastMatch | null;
  season: Season;
  seasonLabel: string;
  usedFallbackProfile: boolean;
};

/**
 * Find the best matching time slots in the forecast for the user's catch profile
 */
export async function findBestForecastMatches(
  userProfile: UserCatchProfile,
  lat: number,
  lon: number,
  options: {
    minScore?: number;
    maxResults?: number;
    daysAhead?: number;
  } = {}
): Promise<MatchResult> {
  const {
    minScore = DEFAULT_MIN_MATCH_SCORE,
    maxResults = 5,
    daysAhead = 5,
  } = options;

  // Get forecast from DMI EDR
  const forecast = await getSpotForecastEdr(lat, lon);

  if (!forecast) {
    const season = getCurrentSeason();
    return {
      matches: [],
      bestMatch: null,
      season,
      seasonLabel: SEASON_LABELS[season],
      usedFallbackProfile: true,
    };
  }

  // Get the appropriate profile for current season
  const profile = getProfileForDate(userProfile);
  const season = getCurrentSeason();
  const usedFallbackProfile = !userProfile.profiles[season]?.hasEnoughData;

  // Generate hourly time slots for the forecast period
  const now = Date.now();
  const endTime = now + daysAhead * 24 * 60 * 60 * 1000;

  const matches: ForecastMatch[] = [];

  // Check every hour in the forecast
  for (let ts = now; ts < endTime; ts += 60 * 60 * 1000) {
    const targetDate = new Date(ts);

    // Skip night hours (22:00 - 05:00) unless user's best time is night
    const hour = targetDate.getHours();
    if (hour >= 22 || hour < 5) {
      if (profile.bestTimeOfDay !== "night") continue;
    }

    const point = extractForecastPoint(forecast, ts);
    const match = calculateMatchScore(profile, point, targetDate);

    if (match.score >= minScore) {
      matches.push(match);
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Limit results
  const topMatches = matches.slice(0, maxResults);

  return {
    matches: topMatches,
    bestMatch: topMatches[0] || null,
    season,
    seasonLabel: SEASON_LABELS[season],
    usedFallbackProfile,
  };
}

/**
 * Quick check if any good matches exist in the next N days
 */
export async function hasGoodForecastMatch(
  userProfile: UserCatchProfile,
  lat: number,
  lon: number,
  minScore: number = DEFAULT_MIN_MATCH_SCORE
): Promise<boolean> {
  const result = await findBestForecastMatches(userProfile, lat, lon, {
    minScore,
    maxResults: 1,
  });
  return result.bestMatch !== null;
}

/**
 * Format a match result for notification display
 */
export function formatMatchForNotification(match: ForecastMatch): {
  title: string;
  body: string;
  shortSummary: string;
} {
  const date = new Date(match.forecastTime);
  const dayName = date.toLocaleDateString("da-DK", { weekday: "long" });
  const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

  const conditions: string[] = [];

  if (match.forecastSummary.windMS != null) {
    conditions.push(`${match.forecastSummary.windMS} m/s ${match.forecastSummary.windDir || ""}`);
  }
  if (match.forecastSummary.waterLevelCM != null) {
    const level = match.forecastSummary.waterLevelCM > 20 ? "højvande" :
                  match.forecastSummary.waterLevelCM < -20 ? "lavvande" : "middel vandstand";
    conditions.push(level);
  }
  if (match.forecastSummary.airTempC != null) {
    conditions.push(`${match.forecastSummary.airTempC}°C`);
  }

  const title = `🎣 Godt fiskevejr ${dayName} kl. ${time}!`;
  const body = `${match.score}% match med dit ${SEASON_LABELS[match.season].toLowerCase()}-mønster. ${conditions.join(", ")}`;
  const shortSummary = conditions.slice(0, 2).join(", ");

  return { title, body, shortSummary };
}

/**
 * Get a human-readable explanation of why conditions match
 */
export function explainMatch(match: ForecastMatch): string[] {
  const explanations: string[] = [];

  if (match.factors.windSpeed?.matched) {
    explanations.push(`✓ Vindstyrke matcher (${match.factors.windSpeed.forecast} m/s)`);
  }
  if (match.factors.windDirection?.matched) {
    explanations.push(`✓ Vindretning matcher (${match.factors.windDirection.forecast})`);
  }
  if (match.factors.tideLevel?.matched) {
    explanations.push(`✓ Vandstand matcher (${match.factors.tideLevel.forecast})`);
  }
  if (match.factors.timeOfDay?.matched) {
    explanations.push(`✓ Tidspunkt matcher (${match.factors.timeOfDay.forecast})`);
  }
  if (match.factors.waterTemp?.matched) {
    explanations.push(`✓ Vandtemperatur matcher (~${Math.round(match.factors.waterTemp.forecast)}°C)`);
  }

  // Add non-matching factors
  if (match.factors.windSpeed && !match.factors.windSpeed.matched) {
    explanations.push(`○ Vindstyrke: ${match.factors.windSpeed.forecast} m/s (ideal: ${match.factors.windSpeed.ideal.min}-${match.factors.windSpeed.ideal.max})`);
  }
  if (match.factors.windDirection && !match.factors.windDirection.matched) {
    explanations.push(`○ Vindretning: ${match.factors.windDirection.forecast} (ideal: ${match.factors.windDirection.ideal})`);
  }
  if (match.factors.tideLevel && !match.factors.tideLevel.matched) {
    explanations.push(`○ Vandstand: ${match.factors.tideLevel.forecast} (ideal: ${match.factors.tideLevel.ideal})`);
  }

  return explanations;
}
