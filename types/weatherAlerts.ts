// types/weatherAlerts.ts
// Firestore document types for push notifications and weather alerts

import { Season, UserCatchProfile, WeatherAlertSettings, ForecastMatch } from "./catchProfile";

/**
 * Push token document stored in Firestore
 * Collection: users/{userId}/pushTokens/{tokenId}
 */
export type PushTokenDocument = {
  token: string;
  platform: "ios" | "android" | "web";
  deviceId?: string;
  deviceName?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  lastUsed?: string; // ISO timestamp of last successful push
  isActive: boolean;
};

/**
 * User catch profile document stored in Firestore
 * Collection: users/{userId}/catchProfile
 * Document: current (single document per user)
 */
export type CatchProfileDocument = {
  profile: UserCatchProfile;
  updatedAt: string; // ISO timestamp
  version: number;
};

/**
 * User weather alert settings stored in Firestore
 * Collection: users/{userId}/settings
 * Document: weatherAlerts
 */
export type UserAlertSettingsDocument = {
  settings: WeatherAlertSettings;
  pushEnabled: boolean;
  updatedAt: string; // ISO timestamp
};

/**
 * Monitored spot for weather alerts
 * Collection: users/{userId}/monitoredSpots/{spotId}
 */
export type MonitoredSpotDocument = {
  spotId: string;
  name: string;
  lat: number;
  lng: number;
  addedAt: string; // ISO timestamp
};

/**
 * Weather alert sent to user (for history/deduplication)
 * Collection: users/{userId}/alertHistory/{alertId}
 */
export type WeatherAlertDocument = {
  id: string;
  spotId: string;
  spotName: string;
  match: ForecastMatch;
  forecastTime: string; // ISO timestamp of the forecasted conditions
  createdAt: string; // ISO timestamp when alert was created
  sentAt?: string; // ISO timestamp when push was sent
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
};

/**
 * Aggregated user document for efficient Cloud Function queries
 * Collection: weatherAlertUsers/{userId}
 * This denormalized document allows the Cloud Function to efficiently
 * query all users who need weather checks without N+1 queries
 */
export type WeatherAlertUserDocument = {
  userId: string;
  enabled: boolean;
  minimumMatchScore: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  lastAlertSent?: string; // ISO timestamp
  lastForecastCheck?: string; // ISO timestamp
  monitoredSpots: {
    spotId: string;
    name: string;
    lat: number;
    lng: number;
  }[];
  pushTokens: string[]; // FCM tokens for this user
  // Denormalized catch profile summary for quick matching
  currentSeason: Season;
  hasEnoughData: boolean;
  // Best conditions from profile (for server-side matching)
  profileSummary?: {
    bestWindSpeedRange?: { min: number; max: number };
    bestWindDirection?: string;
    bestTideLevel?: string;
    bestTimeOfDay?: string;
    bestWaterTempRange?: { min: number; max: number };
  };
  updatedAt: string; // ISO timestamp
};

/**
 * Type guard to check if a document is a valid WeatherAlertUserDocument
 */
export function isValidWeatherAlertUser(doc: unknown): doc is WeatherAlertUserDocument {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as Record<string, unknown>;
  return (
    typeof d.userId === "string" &&
    typeof d.enabled === "boolean" &&
    typeof d.minimumMatchScore === "number" &&
    Array.isArray(d.monitoredSpots) &&
    Array.isArray(d.pushTokens)
  );
}

/**
 * Firestore collection paths
 */
export const FIRESTORE_COLLECTIONS = {
  // User-specific collections
  userPushTokens: (userId: string) => `users/${userId}/pushTokens`,
  userCatchProfile: (userId: string) => `users/${userId}/catchProfile`,
  userSettings: (userId: string) => `users/${userId}/settings`,
  userMonitoredSpots: (userId: string) => `users/${userId}/monitoredSpots`,
  userAlertHistory: (userId: string) => `users/${userId}/alertHistory`,

  // Aggregated collection for Cloud Function
  weatherAlertUsers: "weatherAlertUsers",
} as const;

/**
 * Firestore document IDs
 */
export const FIRESTORE_DOCS = {
  currentProfile: "current",
  weatherAlertSettings: "weatherAlerts",
} as const;
