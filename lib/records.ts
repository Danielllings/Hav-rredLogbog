// lib/records.ts
// Functions for calculating personal records

import type { CatchRow } from "./catches";
import type { TripRow } from "./trips";
import type { PersonalRecords } from "../types/records";
import { getFishEventsCount } from "./tripUtils";

/**
 * Calculate personal records from catches and trips data
 */
export function calculatePersonalRecords(
  catches: CatchRow[],
  trips: TripRow[]
): PersonalRecords {
  const records: PersonalRecords = {
    longestFish: null,
    heaviestFish: null,
    mostFishTrip: null,
  };

  // Find longest fish
  let longestCatch: CatchRow | null = null;
  let maxLength = 0;

  for (const c of catches) {
    if (c.length_cm && c.length_cm > maxLength) {
      maxLength = c.length_cm;
      longestCatch = c;
    }
  }

  if (longestCatch && maxLength > 0) {
    records.longestFish = {
      type: "longest_fish",
      value: maxLength,
      catch: longestCatch,
    };
  }

  // Find heaviest fish
  let heaviestCatch: CatchRow | null = null;
  let maxWeight = 0;

  for (const c of catches) {
    if (c.weight_kg && c.weight_kg > maxWeight) {
      maxWeight = c.weight_kg;
      heaviestCatch = c;
    }
  }

  if (heaviestCatch && maxWeight > 0) {
    records.heaviestFish = {
      type: "heaviest_fish",
      value: maxWeight,
      catch: heaviestCatch,
    };
  }

  // Find trip with most fish
  let bestTrip: TripRow | null = null;
  let maxFish = 0;

  for (const t of trips) {
    const fishCount = getFishEventsCount(t);
    if (fishCount > maxFish) {
      maxFish = fishCount;
      bestTrip = t;
    }
  }

  if (bestTrip && maxFish > 0) {
    records.mostFishTrip = {
      type: "most_fish_trip",
      value: maxFish,
      trip: bestTrip,
    };
  }

  return records;
}
