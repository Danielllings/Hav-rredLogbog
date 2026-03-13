// lib/weatherCache.ts
// Persistent SQLite cache for weather data with H3 geospatial indexing
// Provides instant cache hits and stale-while-revalidate pattern

import * as SQLite from "expo-sqlite";

// H3-like geospatial cell calculation (simplified - doesn't require h3-js dependency)
// Uses ~3km grid cells similar to H3 resolution 6
const CELL_SIZE_DEG = 0.027; // ~3km at Danish latitudes

/**
 * Converts lat/lng to a grid cell ID
 * More efficient than exact coordinate matching - nearby points share same cell
 */
export function getWeatherCellId(lat: number, lng: number): string {
  const latCell = Math.floor(lat / CELL_SIZE_DEG);
  const lngCell = Math.floor(lng / CELL_SIZE_DEG);
  return `${latCell}_${lngCell}`;
}

/**
 * Gets the center coordinates of a cell
 */
export function getCellCenter(cellId: string): { lat: number; lng: number } {
  const [latCell, lngCell] = cellId.split("_").map(Number);
  return {
    lat: (latCell + 0.5) * CELL_SIZE_DEG,
    lng: (lngCell + 0.5) * CELL_SIZE_DEG,
  };
}

/**
 * Gets adjacent cells (for prefetching)
 */
export function getAdjacentCells(cellId: string): string[] {
  const [latCell, lngCell] = cellId.split("_").map(Number);
  const adjacent: string[] = [];

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      if (dLat === 0 && dLng === 0) continue;
      adjacent.push(`${latCell + dLat}_${lngCell + dLng}`);
    }
  }

  return adjacent;
}

// Database instance (lazy initialized)
let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;

/**
 * Initialize the database (called once)
 */
async function initDB(): Promise<void> {
  if (db) return;

  db = await SQLite.openDatabaseAsync("weather_cache.db");

  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS weather_cache (
      cell_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expires ON weather_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_fetched ON weather_cache(fetched_at);
  `);

  // Clean up old entries on startup
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  await db.runAsync(
    "DELETE FROM weather_cache WHERE fetched_at < ?",
    [now - maxAge]
  );
}

/**
 * Ensure database is initialized
 */
async function ensureDB(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInitPromise) {
    dbInitPromise = initDB();
  }
  await dbInitPromise;
  return db!;
}

// Types
export interface CachedWeatherEntry {
  data: string; // JSON stringified EdrForecast
  fetchedAt: number;
  expiresAt: number;
  isStale: boolean;
}

// Cache settings
const FRESH_TTL_MS = 30 * 60 * 1000; // 30 minutes - data is "fresh"
const STALE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours - data can be shown but should refresh

/**
 * Get cached weather data for coordinates
 * Returns null if no cache exists, otherwise returns data with stale flag
 */
export async function getCachedWeather(
  lat: number,
  lng: number
): Promise<CachedWeatherEntry | null> {
  try {
    const database = await ensureDB();
    const cellId = getWeatherCellId(lat, lng);
    const now = Date.now();

    const result = await database.getFirstAsync<{
      data: string;
      fetched_at: number;
      expires_at: number;
    }>(
      "SELECT data, fetched_at, expires_at FROM weather_cache WHERE cell_id = ?",
      [cellId]
    );

    if (!result) return null;

    // Check if completely expired (beyond stale period)
    if (now > result.fetched_at + STALE_TTL_MS) {
      // Delete expired entry
      await database.runAsync("DELETE FROM weather_cache WHERE cell_id = ?", [cellId]);
      return null;
    }

    return {
      data: result.data,
      fetchedAt: result.fetched_at,
      expiresAt: result.expires_at,
      isStale: now > result.expires_at,
    };
  } catch (e) {
    console.warn("Weather cache read error:", e);
    return null;
  }
}

/**
 * Store weather data in cache
 */
export async function setCachedWeather(
  lat: number,
  lng: number,
  data: string
): Promise<void> {
  try {
    const database = await ensureDB();
    const cellId = getWeatherCellId(lat, lng);
    const now = Date.now();

    await database.runAsync(
      `INSERT OR REPLACE INTO weather_cache (cell_id, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      [cellId, data, now, now + FRESH_TTL_MS]
    );
  } catch (e) {
    console.warn("Weather cache write error:", e);
  }
}

/**
 * Get cached weather by cell ID directly
 */
export async function getCachedWeatherByCell(
  cellId: string
): Promise<CachedWeatherEntry | null> {
  try {
    const database = await ensureDB();
    const now = Date.now();

    const result = await database.getFirstAsync<{
      data: string;
      fetched_at: number;
      expires_at: number;
    }>(
      "SELECT data, fetched_at, expires_at FROM weather_cache WHERE cell_id = ?",
      [cellId]
    );

    if (!result) return null;

    if (now > result.fetched_at + STALE_TTL_MS) {
      await database.runAsync("DELETE FROM weather_cache WHERE cell_id = ?", [cellId]);
      return null;
    }

    return {
      data: result.data,
      fetchedAt: result.fetched_at,
      expiresAt: result.expires_at,
      isStale: now > result.expires_at,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Store weather data by cell ID directly
 */
export async function setCachedWeatherByCell(
  cellId: string,
  data: string
): Promise<void> {
  try {
    const database = await ensureDB();
    const now = Date.now();

    await database.runAsync(
      `INSERT OR REPLACE INTO weather_cache (cell_id, data, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      [cellId, data, now, now + FRESH_TTL_MS]
    );
  } catch (e) {
    console.warn("Weather cache write error:", e);
  }
}

/**
 * Prefetch weather for multiple cells (used for viewport prefetching)
 */
export async function prefetchWeatherCells(
  cellIds: string[],
  fetchFunction: (cellId: string) => Promise<string | null>
): Promise<void> {
  const database = await ensureDB();
  const now = Date.now();

  // Check which cells need fetching
  const toFetch: string[] = [];

  for (const cellId of cellIds) {
    const cached = await getCachedWeatherByCell(cellId);
    if (!cached || cached.isStale) {
      toFetch.push(cellId);
    }
  }

  if (toFetch.length === 0) return;

  // Fetch in batches of 5 to avoid overwhelming the API
  const BATCH_SIZE = 5;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (cellId) => {
        try {
          const data = await fetchFunction(cellId);
          if (data) {
            await setCachedWeatherByCell(cellId, data);
          }
        } catch (e) {
          // Ignore prefetch errors
        }
      })
    );
  }
}

/**
 * Get cache statistics (for debugging)
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  freshEntries: number;
  staleEntries: number;
  oldestEntry: number | null;
}> {
  try {
    const database = await ensureDB();
    const now = Date.now();

    const total = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM weather_cache"
    );

    const fresh = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM weather_cache WHERE expires_at > ?",
      [now]
    );

    const oldest = await database.getFirstAsync<{ fetched_at: number }>(
      "SELECT MIN(fetched_at) as fetched_at FROM weather_cache"
    );

    return {
      totalEntries: total?.count ?? 0,
      freshEntries: fresh?.count ?? 0,
      staleEntries: (total?.count ?? 0) - (fresh?.count ?? 0),
      oldestEntry: oldest?.fetched_at ?? null,
    };
  } catch (e) {
    return { totalEntries: 0, freshEntries: 0, staleEntries: 0, oldestEntry: null };
  }
}

/**
 * Clear all cached weather data
 */
export async function clearWeatherCache(): Promise<void> {
  try {
    const database = await ensureDB();
    await database.runAsync("DELETE FROM weather_cache");
  } catch (e) {
    console.warn("Weather cache clear error:", e);
  }
}
