// lib/catchProfileGenerator.ts
// Generates seasonal catch profiles from user's trip history

import SunCalc from "suncalc";
import {
  Season,
  SeasonalCatchProfile,
  UserCatchProfile,
  WeightedCondition,
  Range,
  WindDirection,
  TideLevel,
  TimeOfDay,
  SEASON_MONTHS,
  SEASON_LABELS,
  TEMP_RANGES,
  WIND_SPEED_RANGES,
  TIDE_THRESHOLDS,
} from "../types/catchProfile";

// Minimum trips required for reliable profile
const MIN_TRIPS_TOTAL = 5;
const MIN_TRIPS_PER_SEASON = 3;
const PROFILE_VERSION = 1;

// ============================================================================
// Helper Functions
// ============================================================================

function getSeasonFromMonth(month: number): Season {
  if (SEASON_MONTHS.spring.includes(month)) return "spring";
  if (SEASON_MONTHS.summer.includes(month)) return "summer";
  if (SEASON_MONTHS.autumn.includes(month)) return "autumn";
  return "winter";
}

function getTempRange(temp: number | null | undefined): Range | null {
  if (temp == null || !Number.isFinite(temp)) return null;
  for (const range of TEMP_RANGES) {
    if (temp >= range.min && temp < range.max) return range;
  }
  return null;
}

function getWindSpeedRange(ms: number | null | undefined): Range | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  for (const { range } of WIND_SPEED_RANGES) {
    if (ms >= range.min && ms < range.max) return range;
  }
  return null;
}

function getWindDirection(deg: number | null | undefined): WindDirection | null {
  if (deg == null || !Number.isFinite(deg)) return null;
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

function getTideLevel(cm: number | null | undefined): TideLevel | null {
  if (cm == null || !Number.isFinite(cm)) return null;
  if (cm < TIDE_THRESHOLDS.low) return "low";
  if (cm > TIDE_THRESHOLDS.high) return "high";
  return "medium";
}

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 9) return "morning";
  if (hour >= 9 && hour < 12) return "forenoon";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function rangeKey(range: Range): string {
  return `${range.min}-${range.max}`;
}

// ============================================================================
// Bucket Aggregation
// ============================================================================

type BucketStats<T> = Map<string, { value: T; fish: number; trips: Set<string> }>;

function addToBucket<T>(
  bucket: BucketStats<T>,
  key: string,
  value: T,
  fishCount: number,
  tripId: string
): void {
  const existing = bucket.get(key);
  if (existing) {
    existing.fish += fishCount;
    existing.trips.add(tripId);
  } else {
    bucket.set(key, { value, fish: fishCount, trips: new Set([tripId]) });
  }
}

function bucketToWeightedConditions<T>(
  bucket: BucketStats<T>,
  totalFish: number
): WeightedCondition<T>[] {
  const results: WeightedCondition<T>[] = [];

  for (const [, stats] of bucket) {
    results.push({
      value: stats.value,
      weight: totalFish > 0 ? stats.fish / totalFish : 0,
      fishCount: stats.fish,
      tripCount: stats.trips.size,
    });
  }

  // Sort by fish count descending
  results.sort((a, b) => b.fishCount - a.fishCount);
  return results;
}

// ============================================================================
// Trip Data Extraction
// ============================================================================

type TripEvaluation = {
  waterTempC?: number | null;
  airTempC?: number | null;
  windMS?: number | null;
  windDirDeg?: number | null;
  waterLevelCM?: number | null;
};

function extractEvaluation(trip: any): TripEvaluation | null {
  let meta: any = {};

  try {
    meta = trip.meta_json ? JSON.parse(trip.meta_json) : {};
  } catch {
    return null;
  }

  const evaluation =
    meta?.evaluation ||
    meta?.summary?.evaluation ||
    (meta && meta.source ? meta : null);

  if (!evaluation) return null;

  // Handle various field name variations
  const waterTempC =
    evaluation.waterTempC?.avg ??
    evaluation.seaTempC?.avg ??
    null;

  const airTempC = evaluation.airTempC?.avg ?? null;

  const windMS = evaluation.windMS?.avg ?? null;

  const windDirDeg =
    evaluation.windDirDeg?.avg ??
    evaluation.windDeg?.avg ??
    evaluation.windFromDirDeg?.avg ??
    null;

  const waterLevelCM =
    evaluation.waterLevelCM?.avg ??
    evaluation.waterLevelCm?.avg ??
    null;

  return { waterTempC, airTempC, windMS, windDirDeg, waterLevelCM };
}

function getTripLocation(trip: any): { lat: number; lng: number } | null {
  if (Number.isFinite(trip.spot_lat) && Number.isFinite(trip.spot_lng)) {
    return { lat: trip.spot_lat, lng: trip.spot_lng };
  }

  if (trip.path_json) {
    try {
      const parsed = JSON.parse(trip.path_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const lat =
          typeof first.lat === "number"
            ? first.lat
            : typeof first.latitude === "number"
            ? first.latitude
            : null;
        const lng =
          typeof first.lng === "number"
            ? first.lng
            : typeof first.longitude === "number"
            ? first.longitude
            : null;
        if (lat != null && lng != null) return { lat, lng };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

// ============================================================================
// Seasonal Profile Builder
// ============================================================================

type SeasonData = {
  trips: any[];
  totalFish: number;
  waterTempBucket: BucketStats<Range>;
  airTempBucket: BucketStats<Range>;
  windSpeedBucket: BucketStats<Range>;
  windDirBucket: BucketStats<WindDirection>;
  tideBucket: BucketStats<TideLevel>;
  todBucket: BucketStats<TimeOfDay>;
  sunOffsets: { minutes: number; isSunrise: boolean }[];
};

function createEmptySeasonData(): SeasonData {
  return {
    trips: [],
    totalFish: 0,
    waterTempBucket: new Map(),
    airTempBucket: new Map(),
    windSpeedBucket: new Map(),
    windDirBucket: new Map(),
    tideBucket: new Map(),
    todBucket: new Map(),
    sunOffsets: [],
  };
}

function buildSeasonalProfile(
  season: Season,
  data: SeasonData
): SeasonalCatchProfile | null {
  const tripCount = data.trips.length;
  const hasEnoughData = tripCount >= MIN_TRIPS_PER_SEASON;

  // Calculate data quality score (0-100)
  let dataQualityScore = Math.min(100, (tripCount / 10) * 50); // 10+ trips = 50 points
  if (data.waterTempBucket.size > 0) dataQualityScore += 10;
  if (data.windSpeedBucket.size > 0) dataQualityScore += 10;
  if (data.windDirBucket.size > 0) dataQualityScore += 10;
  if (data.tideBucket.size > 0) dataQualityScore += 10;
  if (data.todBucket.size > 0) dataQualityScore += 10;

  const waterTempRanges = bucketToWeightedConditions(data.waterTempBucket, data.totalFish);
  const airTempRanges = bucketToWeightedConditions(data.airTempBucket, data.totalFish);
  const windSpeedRanges = bucketToWeightedConditions(data.windSpeedBucket, data.totalFish);
  const windDirections = bucketToWeightedConditions(data.windDirBucket, data.totalFish);
  const tideLevels = bucketToWeightedConditions(data.tideBucket, data.totalFish);
  const timesOfDay = bucketToWeightedConditions(data.todBucket, data.totalFish);

  // Calculate sun offset pattern
  let sunOffsetMinutes: number | undefined;
  let prefersSunrise = true;

  if (data.sunOffsets.length > 0) {
    const avgMinutes =
      data.sunOffsets.reduce((sum, o) => sum + o.minutes, 0) / data.sunOffsets.length;
    sunOffsetMinutes = Math.round(avgMinutes);

    const sunriseCount = data.sunOffsets.filter((o) => o.isSunrise).length;
    prefersSunrise = sunriseCount >= data.sunOffsets.length / 2;
  }

  return {
    season,
    seasonLabel: SEASON_LABELS[season],
    hasEnoughData,
    tripCount,
    totalFish: data.totalFish,
    dataQualityScore: Math.round(dataQualityScore),

    waterTempRanges,
    airTempRanges,
    windSpeedRanges,
    windDirections,
    tideLevels,
    timesOfDay,

    sunOffsetMinutes,
    prefersSunrise,

    // Best single values
    bestWaterTempRange: waterTempRanges[0]?.value,
    bestAirTempRange: airTempRanges[0]?.value,
    bestWindSpeedRange: windSpeedRanges[0]?.value,
    bestWindDirection: windDirections[0]?.value,
    bestTideLevel: tideLevels[0]?.value,
    bestTimeOfDay: timesOfDay[0]?.value,
  };
}

// ============================================================================
// Main Profile Generator
// ============================================================================

export function generateUserCatchProfile(
  trips: any[],
  monitoredSpotIds: string[] = []
): UserCatchProfile {
  // Filter trips with catches
  const tripsWithFish = trips.filter((t) => (t.fish_count ?? 0) > 0);

  // Initialize season data
  const seasonData: Record<Season, SeasonData> = {
    spring: createEmptySeasonData(),
    summer: createEmptySeasonData(),
    autumn: createEmptySeasonData(),
    winter: createEmptySeasonData(),
  };

  // Also collect all-seasons data
  const allSeasonsData = createEmptySeasonData();

  // Track date range
  let oldestDate: Date | null = null;
  let newestDate: Date | null = null;

  // Sun time cache
  const sunCache = new Map<string, { sunrise: number; sunset: number }>();

  const getSunTimes = (d: Date, loc: { lat: number; lng: number }) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}`;
    const cached = sunCache.get(key);
    if (cached) return cached;

    const times = SunCalc.getTimes(d, loc.lat, loc.lng);
    const value = {
      sunrise: times.sunrise?.getTime() ?? 0,
      sunset: times.sunset?.getTime() ?? 0,
    };
    sunCache.set(key, value);
    return value;
  };

  // Process each trip
  for (const trip of tripsWithFish) {
    const fishCount = trip.fish_count ?? 0;
    if (fishCount <= 0) continue;

    const tripId = trip.id ?? `trip-${Math.random()}`;

    // Get trip timestamp
    const tripDate = new Date(trip.start_ts || trip.created_at);
    if (isNaN(tripDate.getTime())) continue;

    // Track date range
    if (!oldestDate || tripDate < oldestDate) oldestDate = tripDate;
    if (!newestDate || tripDate > newestDate) newestDate = tripDate;

    // Determine season
    const month = tripDate.getMonth();
    const season = getSeasonFromMonth(month);
    const sData = seasonData[season];

    sData.trips.push(trip);
    sData.totalFish += fishCount;
    allSeasonsData.trips.push(trip);
    allSeasonsData.totalFish += fishCount;

    // Extract weather evaluation
    const evaluation = extractEvaluation(trip);

    // Process weather conditions
    if (evaluation) {
      // Water temperature
      const waterTempRange = getTempRange(evaluation.waterTempC);
      if (waterTempRange) {
        const key = rangeKey(waterTempRange);
        addToBucket(sData.waterTempBucket, key, waterTempRange, fishCount, tripId);
        addToBucket(allSeasonsData.waterTempBucket, key, waterTempRange, fishCount, tripId);
      }

      // Air temperature
      const airTempRange = getTempRange(evaluation.airTempC);
      if (airTempRange) {
        const key = rangeKey(airTempRange);
        addToBucket(sData.airTempBucket, key, airTempRange, fishCount, tripId);
        addToBucket(allSeasonsData.airTempBucket, key, airTempRange, fishCount, tripId);
      }

      // Wind speed
      const windSpeedRange = getWindSpeedRange(evaluation.windMS);
      if (windSpeedRange) {
        const key = rangeKey(windSpeedRange);
        addToBucket(sData.windSpeedBucket, key, windSpeedRange, fishCount, tripId);
        addToBucket(allSeasonsData.windSpeedBucket, key, windSpeedRange, fishCount, tripId);
      }

      // Wind direction
      const windDir = getWindDirection(evaluation.windDirDeg);
      if (windDir) {
        addToBucket(sData.windDirBucket, windDir, windDir, fishCount, tripId);
        addToBucket(allSeasonsData.windDirBucket, windDir, windDir, fishCount, tripId);
      }

      // Tide level
      const tideLevel = getTideLevel(evaluation.waterLevelCM);
      if (tideLevel) {
        addToBucket(sData.tideBucket, tideLevel, tideLevel, fishCount, tripId);
        addToBucket(allSeasonsData.tideBucket, tideLevel, tideLevel, fishCount, tripId);
      }
    }

    // Time of day from fish events or trip start
    let catchTimestamps: number[] = [];

    if (trip.fish_events_json) {
      try {
        const events = JSON.parse(trip.fish_events_json);
        if (Array.isArray(events)) {
          for (const ev of events) {
            if (typeof ev === "string") {
              const ts = Date.parse(ev);
              if (!isNaN(ts)) catchTimestamps.push(ts);
            } else if (typeof ev === "number" && Number.isFinite(ev)) {
              catchTimestamps.push(ev);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Fallback to trip start time
    if (catchTimestamps.length === 0) {
      catchTimestamps = Array(fishCount).fill(tripDate.getTime());
    }

    // Process each catch timestamp
    const location = getTripLocation(trip);

    for (const ts of catchTimestamps) {
      const catchDate = new Date(ts);
      const hour = catchDate.getHours();
      const tod = getTimeOfDay(hour);

      addToBucket(sData.todBucket, tod, tod, 1, tripId);
      addToBucket(allSeasonsData.todBucket, tod, tod, 1, tripId);

      // Sun offset calculation
      if (location) {
        const sunTimes = getSunTimes(catchDate, location);
        const catchMs = catchDate.getTime();

        const toSunrise = catchMs - sunTimes.sunrise;
        const toSunset = catchMs - sunTimes.sunset;

        const isSunrise = Math.abs(toSunrise) < Math.abs(toSunset);
        const minutes = isSunrise ? toSunrise / 60000 : toSunset / 60000;

        sData.sunOffsets.push({ minutes, isSunrise });
        allSeasonsData.sunOffsets.push({ minutes, isSunrise });
      }
    }
  }

  // Build seasonal profiles
  const profiles = {
    spring: buildSeasonalProfile("spring", seasonData.spring),
    summer: buildSeasonalProfile("summer", seasonData.summer),
    autumn: buildSeasonalProfile("autumn", seasonData.autumn),
    winter: buildSeasonalProfile("winter", seasonData.winter),
  };

  // Build all-seasons fallback profile
  const allSeasons = buildSeasonalProfile("spring", allSeasonsData)!;
  allSeasons.season = "spring"; // Will be ignored when using as fallback
  allSeasons.seasonLabel = "Alle sæsoner";

  return {
    odateret: new Date().toISOString(),
    version: PROFILE_VERSION,
    minimumTripsRequired: MIN_TRIPS_TOTAL,
    minimumTripsPerSeason: MIN_TRIPS_PER_SEASON,
    monitoredSpotIds,
    profiles,
    allSeasons,
    totalTrips: tripsWithFish.length,
    totalFish: allSeasonsData.totalFish,
    oldestTripDate: oldestDate?.toISOString(),
    newestTripDate: newestDate?.toISOString(),
  };
}

/**
 * Get the appropriate profile for a given date
 * Falls back to allSeasons if the seasonal profile doesn't have enough data
 */
export function getProfileForDate(
  profile: UserCatchProfile,
  date: Date = new Date()
): SeasonalCatchProfile {
  const month = date.getMonth();
  const season = getSeasonFromMonth(month);
  const seasonalProfile = profile.profiles[season];

  // Use seasonal profile if it has enough data
  if (seasonalProfile && seasonalProfile.hasEnoughData) {
    return seasonalProfile;
  }

  // Fallback to all-seasons profile
  return profile.allSeasons;
}

/**
 * Get current season
 */
export function getCurrentSeason(): Season {
  return getSeasonFromMonth(new Date().getMonth());
}

/**
 * Check if user has enough data for alerts
 */
export function hasEnoughDataForAlerts(profile: UserCatchProfile): boolean {
  return profile.totalTrips >= MIN_TRIPS_TOTAL;
}

/**
 * Get season statistics summary for UI
 */
export function getSeasonStatsSummary(profile: UserCatchProfile): {
  season: Season;
  label: string;
  trips: number;
  fish: number;
  hasEnoughData: boolean;
}[] {
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

  return seasons.map((season) => {
    const p = profile.profiles[season];
    return {
      season,
      label: SEASON_LABELS[season],
      trips: p?.tripCount ?? 0,
      fish: p?.totalFish ?? 0,
      hasEnoughData: p?.hasEnoughData ?? false,
    };
  });
}

// ============================================================================
// Firestore Integration
// ============================================================================

import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  CatchProfileDocument,
  FIRESTORE_COLLECTIONS,
  FIRESTORE_DOCS,
} from "../types/weatherAlerts";

/**
 * Save catch profile to Firestore for server-side weather alert processing
 */
export async function saveCatchProfileToFirestore(
  profile: UserCatchProfile
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    console.log("[CatchProfile] Cannot save - user not authenticated");
    return false;
  }

  try {
    const profileDoc: CatchProfileDocument = {
      profile,
      updatedAt: new Date().toISOString(),
      version: profile.version,
    };

    const docRef = doc(
      db,
      FIRESTORE_COLLECTIONS.userCatchProfile(user.uid),
      FIRESTORE_DOCS.currentProfile
    );
    await setDoc(docRef, profileDoc);

    console.log("[CatchProfile] Profile saved to Firestore");
    return true;
  } catch (error) {
    console.error("[CatchProfile] Error saving to Firestore:", error);
    return false;
  }
}

/**
 * Generate and save profile to both local storage and Firestore
 */
export async function generateAndSaveProfile(
  trips: any[],
  monitoredSpotIds: string[] = []
): Promise<UserCatchProfile> {
  const profile = generateUserCatchProfile(trips, monitoredSpotIds);

  // Save to Firestore in background (don't block)
  saveCatchProfileToFirestore(profile).catch((err) => {
    console.error("[CatchProfile] Background save failed:", err);
  });

  return profile;
}
