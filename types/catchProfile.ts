// types/catchProfile.ts
// Type definitions for seasonal catch profiles used by Smart Weather Alerts

export type Season = "spring" | "summer" | "autumn" | "winter";

export type SeasonLabel = {
  spring: "Forår";
  summer: "Sommer";
  autumn: "Efterår";
  winter: "Vinter";
};

export type TideLevel = "low" | "medium" | "high";

export type TimeOfDay =
  | "morning"
  | "forenoon"
  | "afternoon"
  | "evening"
  | "night";

export type WindDirection =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export type WindSpeedCategory = "weak" | "mild" | "fresh" | "strong";

/**
 * Range type for numerical conditions
 */
export type Range = {
  min: number;
  max: number;
};

/**
 * Weighted condition - stores both the preferred value/range and its importance
 */
export type WeightedCondition<T> = {
  value: T;
  weight: number; // 0-1, based on how many fish caught under this condition
  fishCount: number;
  tripCount: number;
};

/**
 * Seasonal catch profile - captures ideal fishing conditions for a specific season
 */
export type SeasonalCatchProfile = {
  season: Season;
  seasonLabel: string;

  // Data quality indicators
  hasEnoughData: boolean;
  tripCount: number;
  totalFish: number;
  dataQualityScore: number; // 0-100, based on trip count and data completeness

  // Ideal conditions for this season (sorted by weight/fish count)
  waterTempRanges: WeightedCondition<Range>[];
  airTempRanges: WeightedCondition<Range>[];
  windSpeedRanges: WeightedCondition<Range>[];
  windDirections: WeightedCondition<WindDirection>[];
  tideLevels: WeightedCondition<TideLevel>[];
  timesOfDay: WeightedCondition<TimeOfDay>[];

  // Sun-related patterns
  sunOffsetMinutes?: number; // Average minutes relative to sunrise/sunset
  prefersSunrise: boolean; // true = sunrise, false = sunset

  // Best single values (for quick matching)
  bestWaterTempRange?: Range;
  bestAirTempRange?: Range;
  bestWindSpeedRange?: Range;
  bestWindDirection?: WindDirection;
  bestTideLevel?: TideLevel;
  bestTimeOfDay?: TimeOfDay;
};

/**
 * Complete user catch profile with all seasons
 */
export type UserCatchProfile = {
  odateret: string; // ISO timestamp of last update
  version: number; // Schema version for future migrations

  // Minimum requirements
  minimumTripsRequired: number;
  minimumTripsPerSeason: number;

  // User's preferred spots to monitor
  monitoredSpotIds: string[];

  // Season-specific profiles
  profiles: {
    spring: SeasonalCatchProfile | null;
    summer: SeasonalCatchProfile | null;
    autumn: SeasonalCatchProfile | null;
    winter: SeasonalCatchProfile | null;
  };

  // Fallback: aggregated profile across all seasons
  allSeasons: SeasonalCatchProfile;

  // Statistics
  totalTrips: number;
  totalFish: number;
  oldestTripDate?: string;
  newestTripDate?: string;
};

/**
 * Match result from comparing forecast to profile
 */
export type ForecastMatch = {
  score: number; // 0-100
  season: Season;
  usedSeasonalProfile: boolean; // false = used allSeasons fallback

  // Individual factor matches
  factors: {
    waterTemp?: { matched: boolean; weight: number; forecast: number; ideal: Range };
    airTemp?: { matched: boolean; weight: number; forecast: number; ideal: Range };
    windSpeed?: { matched: boolean; weight: number; forecast: number; ideal: Range };
    windDirection?: { matched: boolean; weight: number; forecast: string; ideal: string };
    tideLevel?: { matched: boolean; weight: number; forecast: string; ideal: string };
    timeOfDay?: { matched: boolean; weight: number; forecast: string; ideal: string };
  };

  // Forecast details for the matched time slot
  forecastTime: string; // ISO timestamp
  forecastSummary: {
    airTempC?: number;
    waterTempC?: number;
    windMS?: number;
    windDir?: string;
    waterLevelCM?: number;
  };
};

/**
 * Alert configuration stored per user
 */
export type WeatherAlertSettings = {
  enabled: boolean;
  minimumMatchScore: number; // Default 70
  alertFrequency: "daily" | "twice_daily" | "when_conditions_change";
  quietHoursStart?: number; // Hour 0-23
  quietHoursEnd?: number; // Hour 0-23
  monitoredSpotIds: string[];
  lastAlertSent?: string; // ISO timestamp
  lastForecastCheck?: string; // ISO timestamp
};

/**
 * Pending alert ready to be sent
 */
export type PendingWeatherAlert = {
  id: string;
  userId: string;
  spotId: string;
  spotName: string;
  match: ForecastMatch;
  scheduledFor: string; // ISO timestamp
  created: string; // ISO timestamp
  sent: boolean;
  sentAt?: string;
};

// Helper type for season mapping
export const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [2, 3, 4], // Mar, Apr, May (0-indexed: Feb=1, Mar=2, etc.)
  summer: [5, 6, 7], // Jun, Jul, Aug
  autumn: [8, 9, 10], // Sep, Oct, Nov
  winter: [11, 0, 1], // Dec, Jan, Feb
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Forår",
  summer: "Sommer",
  autumn: "Efterår",
  winter: "Vinter",
};

// Temperature ranges matching existing patternAnalysis.ts
export const TEMP_RANGES: Range[] = [
  { min: 0, max: 4 },
  { min: 4, max: 8 },
  { min: 8, max: 12 },
  { min: 12, max: 16 },
  { min: 16, max: 100 },
];

// Wind speed ranges (m/s) matching existing patternAnalysis.ts
export const WIND_SPEED_RANGES: { label: WindSpeedCategory; range: Range }[] = [
  { label: "weak", range: { min: 0, max: 4 } },
  { label: "mild", range: { min: 4, max: 8 } },
  { label: "fresh", range: { min: 8, max: 12 } },
  { label: "strong", range: { min: 12, max: 100 } },
];

// Tide level thresholds (cm) matching existing patternAnalysis.ts
export const TIDE_THRESHOLDS = {
  low: -20, // below -20cm = low tide
  high: 20, // above +20cm = high tide
};
