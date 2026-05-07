// lib/tripTrim.ts
// Smart trip trimming — detects when fishing actually ended

import { type Pt, haversine, computeDistance } from "../shared/utils/geo";

const CAR_SPEED_MS = 12; // m/s (~43 km/h) — same as index.tsx fail-safe
const IDLE_THRESHOLD_MS = 45 * 60 * 1000; // 45 min without meaningful movement
const IDLE_DISTANCE_M = 50; // less than 50m movement = "idle"
const MIN_TRIM_SAVINGS_SEC = 10 * 60; // only suggest trim if saving >= 10 min

export type TrimSuggestion = {
  /** Suggested real end time (ms since epoch) */
  suggestedEndMs: number;
  /** ISO string of suggested end */
  suggestedEndIso: string;
  /** Reason for the suggestion */
  reason: "high_speed" | "idle" | "speed_detected";
  /** How many seconds would be trimmed */
  trimmedSec: number;
  /** Recalculated distance after trim (meters) */
  trimmedDistanceM: number;
  /** Trimmed path */
  trimmedPoints: Pt[];
  /** Catch marks that survive the trim */
  validCatchMarks: number[];
};

/**
 * Analyze a trip's GPS path to find the real fishing end time.
 *
 * Priority:
 * 1. If highSpeedDetectedAt is available, use the GPS point just before that
 * 2. Scan path backwards for first car-speed segment
 * 3. Detect long idle periods (sitting at home)
 *
 * Returns null if no trim is needed (trip looks clean).
 */
export function analyzeTripEndTime(opts: {
  points: Pt[];
  actualEndMs: number;
  catchMarks: number[];
  highSpeedDetectedAt: number | null;
}): TrimSuggestion | null {
  const { points, actualEndMs, catchMarks, highSpeedDetectedAt } = opts;

  if (points.length < 5) return null;

  const sorted = [...points].sort((a, b) => a.t - b.t);
  const tripStartMs = sorted[0].t;

  // ── Strategy 1: Use saved highSpeedDetectedAt ──
  if (highSpeedDetectedAt) {
    const cutoff = findLastPointBefore(sorted, highSpeedDetectedAt);
    if (cutoff) {
      const result = buildSuggestion(sorted, cutoff, actualEndMs, catchMarks, "speed_detected");
      if (result) return result;
    }
  }

  // ── Strategy 2: Scan for car-speed segments from the end ──
  const speedCut = findFirstCarSpeed(sorted);
  if (speedCut) {
    const result = buildSuggestion(sorted, speedCut, actualEndMs, catchMarks, "high_speed");
    if (result) return result;
  }

  // ── Strategy 3: Detect long idle at the end ──
  const idleCut = findIdleStart(sorted);
  if (idleCut) {
    const result = buildSuggestion(sorted, idleCut, actualEndMs, catchMarks, "idle");
    if (result) return result;
  }

  return null;
}

/**
 * Find the last GPS point before the given timestamp.
 */
function findLastPointBefore(sorted: Pt[], beforeMs: number): Pt | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].t <= beforeMs) return sorted[i];
  }
  return null;
}

/**
 * Scan from the end to find where car-speed driving began.
 * Returns the last "normal speed" point before the car-speed segment.
 */
function findFirstCarSpeed(sorted: Pt[]): Pt | null {
  let carSpeedCount = 0;

  // Walk backwards
  for (let i = sorted.length - 1; i > 0; i--) {
    const dt = (sorted[i].t - sorted[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const dist = haversine(sorted[i - 1], sorted[i]);
    const speed = dist / dt;

    if (speed > CAR_SPEED_MS) {
      carSpeedCount++;
    } else if (carSpeedCount >= 3) {
      // Found the transition point — this is the last "fishing" point
      return sorted[i];
    } else {
      carSpeedCount = 0;
    }
  }

  // If the entire tail is car-speed, return the first normal point
  if (carSpeedCount >= 3 && sorted.length > carSpeedCount) {
    return sorted[sorted.length - 1 - carSpeedCount];
  }

  return null;
}

/**
 * Detect long idle period at the end of the trip.
 * Walks backwards to find when the user stopped moving meaningfully.
 */
function findIdleStart(sorted: Pt[]): Pt | null {
  if (sorted.length < 3) return null;

  const lastPt = sorted[sorted.length - 1];

  // Walk backwards to find the last point with meaningful movement
  for (let i = sorted.length - 2; i >= 0; i--) {
    const timeSinceLast = lastPt.t - sorted[i].t;
    if (timeSinceLast < IDLE_THRESHOLD_MS) continue;

    // Check if there's been meaningful movement from point i to end
    const subPath = sorted.slice(i);
    const movement = totalMovement(subPath);

    if (movement < IDLE_DISTANCE_M) {
      // Very little movement from this point to end — find the actual idle start
      // Walk forward from i to find last meaningful movement
      for (let j = i; j < sorted.length - 1; j++) {
        const remaining = sorted.slice(j);
        if (totalMovement(remaining) < IDLE_DISTANCE_M) {
          return sorted[j];
        }
      }
    }
  }

  return null;
}

/**
 * Calculate total raw movement (sum of point-to-point distances, no filtering).
 */
function totalMovement(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += haversine(pts[i - 1], pts[i]);
  }
  return d;
}

/**
 * Build a TrimSuggestion from a cutoff point, or null if trim is too small.
 */
function buildSuggestion(
  sorted: Pt[],
  cutoff: Pt,
  actualEndMs: number,
  catchMarks: number[],
  reason: TrimSuggestion["reason"]
): TrimSuggestion | null {
  const trimmedSec = Math.round((actualEndMs - cutoff.t) / 1000);

  if (trimmedSec < MIN_TRIM_SAVINGS_SEC) return null;

  const trimmedPoints = sorted.filter((p) => p.t <= cutoff.t);
  const trimmedDistanceM = computeDistance(trimmedPoints);
  const validCatchMarks = catchMarks.filter((cm) => cm <= cutoff.t);

  return {
    suggestedEndMs: cutoff.t,
    suggestedEndIso: new Date(cutoff.t).toISOString(),
    reason,
    trimmedSec,
    trimmedDistanceM,
    trimmedPoints,
    validCatchMarks,
  };
}

/**
 * Format a trim suggestion for display.
 */
export function formatTrimTime(ms: number, lang: "da" | "en"): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(lang === "da" ? "da-DK" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(sec: number, lang: "da" | "en"): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (lang === "da") {
    return h > 0 ? `${h}t ${m}m` : `${m} min`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
