// lib/db.ts
// Denne fil initialiserer kun den (nu ubrugte) lokale SQLite-database,
// så app/_layout.tsx ikke crasher, når den kalder initDB().

import * as SQLite from "expo-sqlite";

// Åbner den lokale database
export const db = SQLite.openDatabaseSync("catchlog.db");

/**
 * Sikrer at de lokale SQLite-tabeller eksisterer.
 * BEMÆRK: Disse tabeller bruges IKKE længere til at gemme/hente data,
 * da appen nu bruger Firestore.
 */
export async function initDB() {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  // --- Opretter (tom) Catches Tabelle ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS catches (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time_of_day TEXT,
      length_cm REAL,
      weight_kg REAL,
      bait TEXT,
      notes TEXT,
      photo_uri TEXT NOT NULL,
      lat REAL, lng REAL,
      created_at TEXT, updated_at TEXT
    );
  `);

  // --- Opretter (tom) Trips Tabelle ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      start_ts TEXT NOT NULL,
      end_ts   TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      distance_m REAL NOT NULL,
      fish_count INTEGER NOT NULL,
      path_json TEXT,
      meta_json TEXT,
      created_at TEXT
    );
  `);
}