// types/records.ts
// Type definitions for personal records feature

import type { CatchRow } from "../lib/catches";
import type { TripRow } from "../lib/trips";

/**
 * Record for longest fish caught
 */
export type LongestFishRecord = {
  type: "longest_fish";
  value: number; // length in cm
  catch: CatchRow;
};

/**
 * Record for heaviest fish caught
 */
export type HeaviestFishRecord = {
  type: "heaviest_fish";
  value: number; // weight in kg
  catch: CatchRow;
};

/**
 * Record for most fish caught on a single trip
 */
export type MostFishTripRecord = {
  type: "most_fish_trip";
  value: number; // fish count
  trip: TripRow;
};

/**
 * Union type for all record types
 */
export type PersonalRecord =
  | LongestFishRecord
  | HeaviestFishRecord
  | MostFishTripRecord;

/**
 * Complete personal records object
 */
export type PersonalRecords = {
  longestFish: LongestFishRecord | null;
  heaviestFish: HeaviestFishRecord | null;
  mostFishTrip: MostFishTripRecord | null;
};
