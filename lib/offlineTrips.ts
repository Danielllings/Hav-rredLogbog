// lib/offlineTrips.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { saveTrip } from "./trips";
import { evaluateTripWithDmi } from "./dmi";

const OFFLINE_TRIPS_KEY = "offline_trips_v2";
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000; // 3 sekunder mellem forsøg

export type SaveTripPayload = {
  start_ts: string;
  end_ts: string;
  duration_sec: number;
  distance_m: number;
  fish_count: number;
  path_json: string;
  meta_json: string | null;
  needs_dmi?: boolean;
  catch_marks_ms?: number[];
  spot_id?: string | null;
  spot_name?: string | null;
  spot_lat?: number | null;
  spot_lng?: number | null;
};

type PendingTrip = {
  id: string;
  payload: SaveTripPayload;
  created_at: string;
  retry_count?: number;
  last_error?: string;
};

async function loadPendingTrips(): Promise<PendingTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_TRIPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingTrip[];
  } catch {
    return [];
  }
}

async function savePendingTrips(list: PendingTrip[]) {
  try {
    await AsyncStorage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify(list));
  } catch (e) {
  }
}

// Hjælpefunktion til at vente
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tjek om vi har netværksforbindelse
async function hasNetworkConnection(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

// Forsøg at hente DMI-data med retry-logik
async function fetchDmiWithRetry(
  payload: SaveTripPayload,
  maxAttempts: number = 3
): Promise<{ success: boolean; meta_json: string | null; error?: string }> {
  const points: { latitude: number; longitude: number; t: number }[] = JSON.parse(
    payload.path_json || "[]"
  );

  if (!points.length) {
    return {
      success: true,
      meta_json: null,
      error: "Ingen GPS-punkter på turen",
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {

      // Tjek netværk før hvert forsøg
      const hasNetwork = await hasNetworkConnection();
      if (!hasNetwork) {
        return {
          success: false,
          meta_json: null,
          error: "Ingen netværksforbindelse",
        };
      }

      const evalRes = await evaluateTripWithDmi({
        startIso: payload.start_ts,
        endIso: payload.end_ts,
        points,
      });

      if (evalRes) {
        return {
          success: true,
          meta_json: JSON.stringify({ evaluation: evalRes }),
        };
      } else {
        // Ingen data fra DMI (ikke en fejl, bare ingen data tilgængelig)
        return {
          success: true,
          meta_json: null,
          error: "Ingen DMI-data tilgængelig",
        };
      }
    } catch (e) {
      const errorMsg = (e as Error)?.message || String(e);

      // Hvis det er sidste forsøg, returner fejl
      if (attempt === maxAttempts) {
        return {
          success: false,
          meta_json: null,
          error: errorMsg,
        };
      }

      // Vent før næste forsøg (eksponentiel backoff)
      const waitTime = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await delay(waitTime);
    }
  }

  return {
    success: false,
    meta_json: null,
    error: "Max forsøg overskredet",
  };
}

/**
 * Synkroniser offline-ture til Firestore.
 * Kaldes ved app-start, når netværk genetableres, eller manuelt.
 *
 * Returnerer antal synkroniserede ture.
 */
export async function syncOfflineTrips(): Promise<number> {
  let list = await loadPendingTrips();
  if (!list.length) {
    return 0;
  }


  // Tjek netværk først
  const hasNetwork = await hasNetworkConnection();
  if (!hasNetwork) {
    return 0;
  }

  const stillPending: PendingTrip[] = [];
  let synced = 0;

  for (const item of list) {

    // Arbejd på en kopi så vi ikke smadrer det der ligger i AsyncStorage
    const payload: SaveTripPayload = { ...item.payload };
    const retryCount = (item.retry_count ?? 0) + 1;

    // Hvis turen er markeret til DMI-evaluering
    if (payload.needs_dmi) {
      const dmiResult = await fetchDmiWithRetry(payload, 3);

      if (dmiResult.success) {
        // DMI-kald lykkedes (eller ingen data tilgængelig)
        payload.meta_json = dmiResult.meta_json;
        payload.needs_dmi = false;
      } else {
        // DMI-kald fejlede - prøv igen senere

        if (retryCount >= MAX_RETRY_ATTEMPTS) {
          // Max forsøg overskredet - gem turen UDEN vejrdata
          payload.meta_json = JSON.stringify({
            evaluation: {
              source: "DMI",
              note: `Kunne ikke hente vejrdata efter ${MAX_RETRY_ATTEMPTS} forsøg: ${dmiResult.error}`,
            },
          });
          payload.needs_dmi = false;
        } else {
          // Læg tilbage i køen med opdateret retry_count
          stillPending.push({
            ...item,
            retry_count: retryCount,
            last_error: dmiResult.error,
          });
          continue;
        }
      }
    }

    // Prøv at gemme turen til Firestore
    try {
      await saveTrip(payload as any);
      synced++;
    } catch (e) {
      const errorMsg = (e as Error)?.message || String(e);

      // Læg tilbage i køen
      stillPending.push({
        ...item,
        payload, // brug opdateret payload (med evt. DMI-data)
        retry_count: retryCount,
        last_error: errorMsg,
      });
    }
  }

  await savePendingTrips(stillPending);

  return synced;
}

/**
 * Læg en tur i offline-kø (bruges når vi er offline ved afslutning)
 */
export async function queueOfflineTrip(base: SaveTripPayload) {
  const list = await loadPendingTrips();
  const item: PendingTrip = {
    id: `pending_${Date.now()}`,
    payload: { ...base, needs_dmi: true },
    created_at: new Date().toISOString(),
    retry_count: 0,
  };
  list.push(item);
  await savePendingTrips(list);
}

/**
 * Hent antal ventende ture (til UI/debugging)
 */
export async function getPendingTripCount(): Promise<number> {
  const list = await loadPendingTrips();
  return list.length;
}

/**
 * Hent alle ventende ture (til debugging)
 */
export async function getPendingTrips(): Promise<PendingTrip[]> {
  return loadPendingTrips();
}

/**
 * Ryd alle ventende ture (til debugging/reset)
 */
export async function clearPendingTrips(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_TRIPS_KEY);
}
