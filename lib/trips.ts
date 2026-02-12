// lib/trips.ts - Firestore Version
import {
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  orderBy,
  where,
  getDoc,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { getUserCollectionRef, getUserId } from "./firestore";
import { listSpots } from "./spots";

// Re-export pure utility functions from tripUtils (for testing)
export {
  getFishEventsCount,
  distanceMeters,
  getEndPositionFromPath,
} from "./tripUtils";

import { getFishEventsCount, distanceMeters, getEndPositionFromPath } from "./tripUtils";

export type TripRow = {
  id: string; // Firestore ID
  userId: string; // ejerskab
  start_ts: string; // ISO
  end_ts: string; // ISO
  duration_sec: number;
  distance_m: number;
  fish_count: number;
  path_json?: string | null;
  meta_json?: string | null;
  created_at: string;

  // Gemmer rå fangst-tidsstempler som JSON (typisk ISO-strenge)
  fish_events_json?: string | null;

  // Automatisk kobling til nærmeste spot ved stop/evaluering
  spot_id?: string | null;
  spot_name?: string | null;
  spot_lat?: number | null;
  spot_lng?: number | null;
};

const mapSnapshotToTripRow = (snap: QueryDocumentSnapshot): TripRow => {
  return { id: snap.id, ...(snap.data() as Omit<TripRow, "id">) };
};

// Find nærmeste spot til en given position
async function findNearestSpot(
  lat: number,
  lng: number
): Promise<{
  spot_id: string | null;
  spot_name: string | null;
  spot_lat: number | null;
  spot_lng: number | null;
}> {
  try {
    const spots = await listSpots();
    if (!spots || spots.length === 0) {
      return {
        spot_id: null,
        spot_name: null,
        spot_lat: null,
        spot_lng: null,
      };
    }

    let best = null as null | {
      id: string;
      name: string;
      lat: number;
      lng: number;
      dist: number;
    };

    for (const s of spots as any[]) {
      const sLat =
        typeof s.lat === "number"
          ? s.lat
          : typeof s.latitude === "number"
          ? s.latitude
          : null;
      const sLng =
        typeof s.lng === "number"
          ? s.lng
          : typeof s.longitude === "number"
          ? s.longitude
          : null;

      if (sLat == null || sLng == null) continue;

      const d = distanceMeters(lat, lng, sLat, sLng);

      if (!best || d < best.dist) {
        best = {
          id: s.id,
          name: s.name ?? "Spot",
          lat: sLat,
          lng: sLng,
          dist: d,
        };
      }
    }

    if (!best) {
      return {
        spot_id: null,
        spot_name: null,
        spot_lat: null,
        spot_lng: null,
      };
    }

    return {
      spot_id: best.id,
      spot_name: best.name,
      spot_lat: best.lat,
      spot_lng: best.lng,
    };
  } catch (e) {
    return {
      spot_id: null,
      spot_name: null,
      spot_lat: null,
      spot_lng: null,
    };
  }
}

/** Opret tur */
export async function saveTrip(input: {
  start_ts: string;
  end_ts: string;
  duration_sec: number;
  distance_m: number;
  fish_count: number;
  path_json?: string;
  meta_json?: string;
  needs_dmi?: boolean;
  spot_id?: string | null;
  spot_name?: string | null;
  spot_lat?: number | null;
  spot_lng?: number | null;

  // Fangst-tidsstempler i millisekunder (Date.now())
  catch_marks_ms?: number[];
}) {
  const userId = getUserId();
  const created_at = new Date().toISOString();

  const {
    catch_marks_ms,
    spot_id,
    spot_name,
    spot_lat,
    spot_lng,
    ...rest
  } = input;

  let fish_events_json: string | null = null;

  if (Array.isArray(catch_marks_ms) && catch_marks_ms.length > 0) {
    // Sortér og konverter til ISO-tidsstempler
    const sorted = catch_marks_ms
      .filter((ms) => typeof ms === "number" && Number.isFinite(ms))
      .sort((a, b) => a - b);

    const isoEvents = sorted.map((ms) => new Date(ms).toISOString());
    fish_events_json = JSON.stringify(isoEvents);
  }

  // Forsøg automatisk at koble turen til nærmeste spot ud fra slutpositionen,
  // men respekter manuelt valgte spots fra fx import eller redigering.
  let spotPatch: {
    spot_id: string | null;
    spot_name: string | null;
    spot_lat: number | null;
    spot_lng: number | null;
  } = {
    spot_id: spot_id ?? null,
    spot_name: spot_name ?? null,
    spot_lat: spot_lat ?? null,
    spot_lng: spot_lng ?? null,
  };

  const shouldAutoDetect = !spotPatch.spot_id && !spotPatch.spot_name;
  const endPos = shouldAutoDetect
    ? getEndPositionFromPath(rest.path_json)
    : null;
  if (endPos) {
    spotPatch = await findNearestSpot(endPos.lat, endPos.lng);
  }

  const docRef = await addDoc(getUserCollectionRef("trips"), {
    ...rest,
    userId,
    created_at,
    fish_events_json,
    ...spotPatch,
  });

  return docRef.id;
}

/** Hent en tur */
export async function getTrip(id: string): Promise<TripRow | null> {
  const ref = doc(getUserCollectionRef("trips"), id);
  const snap = await getDoc(ref);
  return snap.exists() ? mapSnapshotToTripRow(snap as any) : null;
}

/** Opdatér en tur */
export async function updateTrip(
  id: string,
  patch: Partial<Omit<TripRow, "id" | "userId" | "created_at">>
) {
  const ref = doc(getUserCollectionRef("trips"), id);
  await updateDoc(ref, patch as any);
}

/** Slet en tur */
export async function deleteTrip(id: string) {
  const ref = doc(getUserCollectionRef("trips"), id);
  await deleteDoc(ref);
}

/** List ture (nyeste først) */
export async function listTrips(
  limitCount = 50,
  daysAgo?: number
): Promise<TripRow[]> {
  const tripsRef = getUserCollectionRef("trips");
  const constraints: QueryConstraint[] = [];

  if (daysAgo && daysAgo > 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    constraints.push(where("start_ts", ">=", d.toISOString()));
  }

  constraints.push(orderBy("start_ts", "desc"));

  const qy = query(tripsRef, ...constraints);
  const qs = await getDocs(qy);

  let rows = qs.docs.map(mapSnapshotToTripRow);
  if (limitCount) rows = rows.slice(0, limitCount);

  return rows;
}

/** Antal fisk for et givent spot baseret på trips.spot_id */
export async function getFishCountForSpot(
  spotId: string
): Promise<number> {
  if (!spotId) return 0;

  const tripsRef = getUserCollectionRef("trips");
  const qs = await getDocs(
    query(tripsRef, where("spot_id", "==", spotId))
  );

  const trips = qs.docs.map(mapSnapshotToTripRow);

  // Brug samme logik som statsTrips → getFishEventsCount
  const fishCounts = trips.map(getFishEventsCount);
  const total_fish = fishCounts.reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );

  return total_fish;
}

/** Liste over år (nyeste først) */
export async function listYears(): Promise<number[]> {
  const tripsRef = getUserCollectionRef("trips");
  const qs = await getDocs(query(tripsRef, orderBy("start_ts", "desc")));
  const years = new Set<number>();

  qs.docs.forEach((d) => {
    const ts = (d.data() as any)?.start_ts;
    if (ts) {
      const y = new Date(ts).getFullYear();
      if (y) years.add(y);
    }
  });

  const thisYear = new Date().getFullYear();
  if (!years.has(thisYear)) years.add(thisYear);

  return Array.from(years).sort((a, b) => b - a);
}

export type TripStats = {
  trips: number;
  catch_trips: number;
  null_trips: number;
  total_fish: number;
  total_m: number; // meter
  total_sec: number; // sekunder
  fangstrate: number; // %
  fish_per_hour: number;
  multi_fish_rate: number; // % af fangstture med mindst 2 fisk
};

/** Aggregerede statistikdata */
export async function statsTrips(year?: number): Promise<TripStats> {
  const tripsRef = getUserCollectionRef("trips");
  const constraints: QueryConstraint[] = [];

  if (year) {
    const start = `${year}-01-01T00:00:00.000Z`;
    const next = `${year + 1}-01-01T00:00:00.000Z`;
    constraints.push(where("start_ts", ">=", start));
    constraints.push(where("start_ts", "<", next));
  }

  const qs = await getDocs(query(tripsRef, ...constraints));
  const trips = qs.docs.map(mapSnapshotToTripRow);

  // Brug events hvis de findes, ellers fish_count
  const fishCounts = trips.map(getFishEventsCount);

  const total_fish = fishCounts.reduce((s, n) => s + (n ?? 0), 0);
  const total_m = trips.reduce((s, t) => s + (t.distance_m ?? 0), 0);
  const total_sec = trips.reduce((s, t) => s + (t.duration_sec ?? 0), 0);

  const catch_trips = fishCounts.filter((n) => (n ?? 0) > 0).length;
  const null_trips = trips.length - catch_trips;

  const fangstrate =
    trips.length > 0 ? Math.round((catch_trips / trips.length) * 100) : 0;

  const fish_per_hour = total_sec > 0 ? total_fish / (total_sec / 3600) : 0;

  // ture hvor du fanger mindst 2 fisk (ud fra events)
  const multiFishTrips = fishCounts.filter((n) => (n ?? 0) >= 2).length;
  const multi_fish_rate =
    catch_trips > 0
      ? Math.round((multiFishTrips / catch_trips) * 100)
      : 0;

  return {
    trips: trips.length,
    catch_trips,
    null_trips,
    total_fish,
    total_m,
    total_sec,
    fangstrate,
    fish_per_hour: Number(fish_per_hour.toFixed(2)),
    multi_fish_rate,
  };
}

/** Bruges til valg af tracked tur i fangst */
export type TrackedTrip = {
  id: string;
  started_at: string;
  title?: string | null;
};

/** Hent trackede ture (til new-catch osv.) */
export async function getTrackedTrips(
  limitCount = 50,
  daysAgo = 60
): Promise<TrackedTrip[]> {
  const rows = await listTrips(limitCount, daysAgo);
  return rows.map((t) => ({
    id: t.id,
    started_at: t.start_ts,
    title: null,
  }));
}
