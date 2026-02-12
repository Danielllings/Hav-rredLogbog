// Geo utilities for GPS tracking

export type Pt = { latitude: number; longitude: number; t: number };

// Log GPS punkter tættere for at undgå kun start/slut (mobil kan give få opdateringer)
export const MIN_WAYPOINT_DISTANCE = 10;
// Drop spikes; 300 m-hop giver urealistiske data og ødelægger statistik
export const MAX_WAYPOINT_DISTANCE = 150;
export const MAX_WAYPOINT_SPEED_MS = 8; // ~30 km/t; over det er sandsynligvis et hop

/**
 * Calculate the distance between two points using the Haversine formula.
 * Returns distance in meters.
 */
export function haversine(a: Pt, b: Pt): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Compute total distance from an array of points, filtering out jitter and spikes.
 * Returns distance in meters.
 */
export function computeDistance(points: Pt[]): number {
  if (points.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const step = haversine(points[i - 1], points[i]);
    // Skip tiny jitter
    if (step < MIN_WAYPOINT_DISTANCE) continue;

    // Skip spikes (distance or speed)
    const dtMs =
      typeof points[i].t === "number" && typeof points[i - 1].t === "number"
        ? Math.max(1, points[i].t - points[i - 1].t)
        : null;
    const speed = dtMs ? step / (dtMs / 1000) : null;
    if (step > MAX_WAYPOINT_DISTANCE) continue;
    if (speed != null && speed > MAX_WAYPOINT_SPEED_MS) continue;

    dist += step;
  }
  return dist;
}
