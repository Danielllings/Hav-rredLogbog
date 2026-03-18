// lib/climateOceanCache.ts
// Persistent SQLite cache for climate and ocean station data
// Follows the same pattern as weatherCache.ts

import * as SQLite from "expo-sqlite";

// Database instance (lazy initialized)
let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;
let dbInitFailed = false;

/**
 * Initialize the database (called once)
 */
async function initDB(): Promise<void> {
  if (db) return;

  try {
    db = await SQLite.openDatabaseAsync("climate_ocean_cache.db");

    // Create table for climate/ocean data
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS station_cache (
        cache_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        station_id TEXT,
        parameter_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_station_fetched ON station_cache(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_station_param ON station_cache(station_id, parameter_id);
    `);

    // Clean up old entries on startup (older than 24 hours)
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    await db.runAsync(
      "DELETE FROM station_cache WHERE fetched_at < ?",
      [now - maxAge]
    );
  } catch (e) {
    console.warn("Climate/Ocean cache DB init failed:", e);
    dbInitFailed = true;
    db = null;
  }
}

/**
 * Ensure database is initialized
 * Returns null if database failed to initialize
 */
async function ensureDB(): Promise<SQLite.SQLiteDatabase | null> {
  // Don't retry if init already failed
  if (dbInitFailed) return null;

  if (!dbInitPromise) {
    dbInitPromise = initDB();
  }
  await dbInitPromise;
  return db;
}

// Types
export interface CachedStationEntry {
  data: string; // JSON stringified array of {ts, value}
  fetchedAt: number;
  isStale: boolean;
}

// Cache settings
const FRESH_TTL_MS = 30 * 60 * 1000; // 30 minutes - data is "fresh"
const STALE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours - data can be used but should refresh

/**
 * Generate cache key for climate data
 */
export function getClimateCacheKey(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): string {
  // Truncate timestamps to hour to improve cache hit rate
  const startHour = startIso.substring(0, 13); // YYYY-MM-DDTHH
  const endHour = endIso.substring(0, 13);
  return `climate_${stationId}_${parameterId}_${startHour}_${endHour}`;
}

/**
 * Generate cache key for ocean data
 */
export function getOceanCacheKey(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): string {
  // Truncate timestamps to hour to improve cache hit rate
  const startHour = startIso.substring(0, 13); // YYYY-MM-DDTHH
  const endHour = endIso.substring(0, 13);
  return `ocean_${stationId}_${parameterId}_${startHour}_${endHour}`;
}

/**
 * Get cached climate data
 */
export async function getClimateCache(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): Promise<CachedStationEntry | null> {
  try {
    const database = await ensureDB();
    if (!database) return null; // DB init failed

    const cacheKey = getClimateCacheKey(stationId, parameterId, startIso, endIso);
    const now = Date.now();

    const result = await database.getFirstAsync<{
      data: string;
      fetched_at: number;
    }>(
      "SELECT data, fetched_at FROM station_cache WHERE cache_key = ?",
      [cacheKey]
    );

    if (!result) return null;

    // Check if completely expired (beyond stale period)
    if (now > result.fetched_at + STALE_TTL_MS) {
      // Delete expired entry
      await database.runAsync("DELETE FROM station_cache WHERE cache_key = ?", [cacheKey]);
      return null;
    }

    return {
      data: result.data,
      fetchedAt: result.fetched_at,
      isStale: now > result.fetched_at + FRESH_TTL_MS,
    };
  } catch (e) {
    console.warn("Climate cache read error:", e);
    return null;
  }
}

/**
 * Store climate data in cache
 */
export async function setClimateCache(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string,
  data: string
): Promise<void> {
  try {
    const database = await ensureDB();
    if (!database) return; // DB init failed

    const cacheKey = getClimateCacheKey(stationId, parameterId, startIso, endIso);
    const now = Date.now();

    await database.runAsync(
      `INSERT OR REPLACE INTO station_cache (cache_key, data, fetched_at, station_id, parameter_id)
       VALUES (?, ?, ?, ?, ?)`,
      [cacheKey, data, now, stationId, parameterId]
    );
  } catch (e) {
    console.warn("Climate cache write error:", e);
  }
}

/**
 * Get cached ocean data
 */
export async function getOceanCache(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): Promise<CachedStationEntry | null> {
  try {
    const database = await ensureDB();
    if (!database) return null; // DB init failed

    const cacheKey = getOceanCacheKey(stationId, parameterId, startIso, endIso);
    const now = Date.now();

    const result = await database.getFirstAsync<{
      data: string;
      fetched_at: number;
    }>(
      "SELECT data, fetched_at FROM station_cache WHERE cache_key = ?",
      [cacheKey]
    );

    if (!result) return null;

    // Check if completely expired
    if (now > result.fetched_at + STALE_TTL_MS) {
      await database.runAsync("DELETE FROM station_cache WHERE cache_key = ?", [cacheKey]);
      return null;
    }

    return {
      data: result.data,
      fetchedAt: result.fetched_at,
      isStale: now > result.fetched_at + FRESH_TTL_MS,
    };
  } catch (e) {
    console.warn("Ocean cache read error:", e);
    return null;
  }
}

/**
 * Store ocean data in cache
 */
export async function setOceanCache(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string,
  data: string
): Promise<void> {
  try {
    const database = await ensureDB();
    if (!database) return; // DB init failed

    const cacheKey = getOceanCacheKey(stationId, parameterId, startIso, endIso);
    const now = Date.now();

    await database.runAsync(
      `INSERT OR REPLACE INTO station_cache (cache_key, data, fetched_at, station_id, parameter_id)
       VALUES (?, ?, ?, ?, ?)`,
      [cacheKey, data, now, stationId, parameterId]
    );
  } catch (e) {
    console.warn("Ocean cache write error:", e);
  }
}

/**
 * Clear all cached station data
 */
export async function clearStationCache(): Promise<void> {
  try {
    const database = await ensureDB();
    if (!database) return;
    await database.runAsync("DELETE FROM station_cache");
  } catch (e) {
    console.warn("Station cache clear error:", e);
  }
}

/**
 * Get cache statistics (for debugging)
 */
export async function getStationCacheStats(): Promise<{
  totalEntries: number;
  climateEntries: number;
  oceanEntries: number;
  oldestEntry: number | null;
}> {
  try {
    const database = await ensureDB();
    if (!database) {
      return { totalEntries: 0, climateEntries: 0, oceanEntries: 0, oldestEntry: null };
    }

    const total = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM station_cache"
    );

    const climate = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM station_cache WHERE cache_key LIKE 'climate_%'"
    );

    const ocean = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM station_cache WHERE cache_key LIKE 'ocean_%'"
    );

    const oldest = await database.getFirstAsync<{ fetched_at: number }>(
      "SELECT MIN(fetched_at) as fetched_at FROM station_cache"
    );

    return {
      totalEntries: total?.count ?? 0,
      climateEntries: climate?.count ?? 0,
      oceanEntries: ocean?.count ?? 0,
      oldestEntry: oldest?.fetched_at ?? null,
    };
  } catch (e) {
    return { totalEntries: 0, climateEntries: 0, oceanEntries: 0, oldestEntry: null };
  }
}
