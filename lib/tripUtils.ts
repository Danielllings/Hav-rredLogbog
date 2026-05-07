// lib/tripUtils.ts - Pure utility functions (no Firebase dependencies)

export type TripRowBase = {
  fish_count: number;
  fish_events_json?: string | null;
  path_json?: string | null;
};

export type FishEventCondition = {
  color?: "blank" | "farvet";
  seaLice?: "ingen" | "faa" | "mange";
  released?: boolean;
};

export type FishEvent = {
  ts: number;       // milliseconds
  length_cm?: number;
  condition?: FishEventCondition;
};

/** Parse fish_events_json til strukturerede events (håndterer begge formater) */
export function parseFishEvents(fish_events_json?: string | null): FishEvent[] {
  if (!fish_events_json) return [];
  try {
    const parsed = JSON.parse(fish_events_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((ev: any): FishEvent => {
      if (typeof ev === "string") {
        return { ts: new Date(ev).getTime() };
      } else if (typeof ev === "number") {
        return { ts: ev };
      } else if (ev && typeof ev === "object" && ev.ts) {
        return {
          ts: typeof ev.ts === "string" ? new Date(ev.ts).getTime() : ev.ts,
          length_cm: typeof ev.length_cm === "number" ? ev.length_cm : undefined,
          condition: ev.condition || undefined,
        };
      }
      return { ts: 0 };
    }).filter((e: FishEvent) => e.ts > 0);
  } catch {
    return [];
  }
}

/** Hjælp: antal fisk ud fra events, fallback til fish_count */
export function getFishEventsCount(t: TripRowBase): number {
  if (t.fish_events_json) {
    const events = parseFishEvents(t.fish_events_json);
    if (events.length > 0) return events.length;
  }
  return t.fish_count ?? 0;
}

/** Hent alle længder fra fish_events_json */
export function getFishLengths(fish_events_json?: string | null): number[] {
  return parseFishEvents(fish_events_json)
    .filter((e) => e.length_cm != null && e.length_cm > 0)
    .map((e) => e.length_cm!);
}

// Haversine distance i meter
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // meter
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Forsøg at hente slutpositionen for turen ud fra path_json
export function getEndPositionFromPath(
  path_json?: string | null
): { lat: number; lng: number } | null {
  if (!path_json) return null;
  try {
    const parsed = JSON.parse(path_json);

    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const last = parsed[parsed.length - 1];

    // Støt både {lat,lng} og {latitude,longitude}
    const lat =
      typeof last.lat === "number"
        ? last.lat
        : typeof last.latitude === "number"
        ? last.latitude
        : null;
    const lng =
      typeof last.lng === "number"
        ? last.lng
        : typeof last.longitude === "number"
        ? last.longitude
        : null;

    if (lat === null || lng === null) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}
