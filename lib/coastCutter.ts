// lib/coastCutter.ts
// Filtrerer havdata-punkter så de kun vises i vandet (ikke på land)

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

type LandFeature = Feature<Polygon | MultiPolygon>;

// Cache af land-polygoner
let landFeatures: LandFeature[] = [];
let isLoaded = false;

/**
 * Loader land-polygoner fra bundled JSON
 */
export function loadLandPolygons(): void {
  if (isLoaded) return;

  try {
    // Metro bundler håndterer JSON require
    const landGeoJson = require("./denmark-land.json") as FeatureCollection<Polygon | MultiPolygon>;

    if (!landGeoJson?.features) {
      console.warn("[CoastCutter] Invalid GeoJSON - no features found");
      return;
    }

    landFeatures = landGeoJson.features.filter(
      (f): f is LandFeature =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
    );

    isLoaded = true;
    console.log(`[CoastCutter] Loaded ${landFeatures.length} land polygons`);
  } catch (err) {
    console.error("[CoastCutter] Failed to load land polygons:", err);
  }
}

/**
 * Tjekker om land-polygoner er loadet
 */
export function isLandDataLoaded(): boolean {
  return isLoaded;
}

/**
 * Tjekker om et punkt er på land (inde i et af land-polygonerne)
 */
export function isOnLand(lat: number, lng: number): boolean {
  if (!isLoaded || landFeatures.length === 0) return false;

  const pt = point([lng, lat]);

  for (const feature of landFeatures) {
    try {
      if (booleanPointInPolygon(pt, feature)) {
        return true;
      }
    } catch {
      // Skip ugyldige polygoner
    }
  }

  return false;
}

/**
 * Tjekker om et punkt er i vandet (ikke på land)
 */
export function isInSea(lat: number, lng: number): boolean {
  // Hvis data ikke er loadet, antag alt er i vandet (vis alle punkter)
  if (!isLoaded) return true;
  return !isOnLand(lat, lng);
}

/**
 * Filtrerer et array af punkter og beholder kun dem i vandet
 */
export function filterSeaPoints<T extends { lat: number; lng: number }>(
  points: T[]
): T[] {
  // Hvis data ikke er loadet, returner alle punkter
  if (!isLoaded) return points;
  return points.filter((p) => isInSea(p.lat, p.lng));
}

/**
 * Returnerer antal loadede land-polygoner (til debugging)
 */
export function getLandPolygonCount(): number {
  return landFeatures.length;
}
