import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  StyleSheet,
  Modal,
  ScrollView,
  StatusBar,
  Dimensions,
  Platform,
  ActivityIndicator,
  Animated,
  AppState,
} from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import SunCalc from "suncalc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, {
  Marker,
  Polyline,
  Region,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  UrlTile,
} from "react-native-maps";
import { Link } from "expo-router";
import { saveTrip, listTrips, statsTrips, listYears } from "../../lib/trips";
import { listSpots, type SpotRow } from "../../lib/spots";
import { evaluateTripWithDmi, getSpotForecastEdr } from "../../lib/dmi";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  queueOfflineTrip,
  syncOfflineTrips,
  type SaveTripPayload,
} from "../../lib/offlineTrips";
import { isRunningInExpoGo } from "expo";
import { useLanguage } from "../../lib/i18n";

const { width } = Dimensions.get("window");

// --- MODERNE TEMA ---
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  primary: "#FFFFFF",

  startGreen: "#22C55E",
  graphYellow: "#F59E0B",
  danger: "#FF453A",

  text: "#FFFFFF",
  textSec: "#A1A1AA",
  textTertiary: "#636366",
};

// --- MØRKT KORT STIL ---
// --- Kort stilarter (lys på Android for bedre synlighed) ---
const LIGHT_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [{ color: "#f5f5f5" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f5f5f5" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#eeeeee" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#e5e5e5" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e0e0e0" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#dadada" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#c9d7f2" }],
  },
];

const DARK_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [{ color: "#242f3e" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#746855" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#242f3e" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

// === NOTIFICATIONS WRAPPER (ingen expo-notifications i Expo Go på Android) ===

const MAP_STYLE = LIGHT_MAP_STYLE;
const MAP_UI_STYLE = "light";

const DEFAULT_TRACK_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const isAndroidExpoGo = Platform.OS === "android" && isRunningInExpoGo();
let notificationsConfigured = false;

// Fallback-tiles til Android hvis Google Maps-nøgle mangler
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

async function ensureNotificationsConfigured() {
  // Expo Go på Android understøtter ikke expo-notifications → vi laver bare no-op
  if (isAndroidExpoGo) {
    return null;
  }

  // Dynamic import, så bundleren ikke crasher i miljøer uden notifications
  const Notifications = await import("expo-notifications");

  if (!notificationsConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldSetBadge: false,
        shouldPlaySound: false,
      }),
    });
    notificationsConfigured = true;
  }

  return Notifications;
}

type Pt = { latitude: number; longitude: number; t: number };
type GraphPoint = { label: string; value: number };

// Log GPS punkter tættere for at undgå kun start/slut (mobil kan give få opdateringer)
const MIN_WAYPOINT_DISTANCE = 10;
// Drop spikes; 300 m-hop giver urealistiske data og ødelægger statistik
const MAX_WAYPOINT_DISTANCE = 150;
const MAX_WAYPOINT_SPEED_MS = 8; // ~30 km/t; over det er sandsynligvis et hop
const TRACK_TASK_NAME = "background_track_updates";
const TRACK_BUFFER_KEY = "track_buffer_v1";
const TRACK_META_KEY = "track_meta_v1";
const TRACK_ACTIVE_KEY = "track_active_v1";

let trackTaskDefined = false;

if (!trackTaskDefined) {
  try {
    // Kører i baggrunden (og forgrunden) for at fange GPS-punkter, også når appen er i dvale.
    TaskManager.defineTask(TRACK_TASK_NAME, async ({ data, error }) => {
      if (error) {
        // console.log("BG tracking fejl:", error.message);
        return;
      }
      // @ts-ignore - task-data typing fra expo-task-manager er løs
      const activeRaw = await AsyncStorage.getItem(TRACK_ACTIVE_KEY);
      if (activeRaw !== "1") return;
      const metaRaw = await AsyncStorage.getItem(TRACK_META_KEY);
      if (!metaRaw) return;
      const { locations } = data || {};
      if (!locations || !locations.length) return;

      const newPts: Pt[] = locations.map((loc: any) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        t:
          typeof loc.timestamp === "number" && Number.isFinite(loc.timestamp)
            ? loc.timestamp
            : Date.now(),
      }));

      try {
        const raw = (await AsyncStorage.getItem(TRACK_BUFFER_KEY)) ?? "[]";
        let existing: Pt[] = [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            existing = parsed as Pt[];
          }
        } catch {
          existing = [];
        }
        const merged: Pt[] = [...existing];
        let last = merged.length ? merged[merged.length - 1] : null;

        for (const p of newPts) {
          if (!last) {
            merged.push(p);
            last = p;
            continue;
          }
          const step = haversine(last, p);
          if (step < MIN_WAYPOINT_DISTANCE) continue;
          const dtMs =
            typeof last.t === "number" && typeof p.t === "number"
              ? Math.max(1, p.t - last.t)
              : null;
          const speed = dtMs ? step / (dtMs / 1000) : null;
          if (step > MAX_WAYPOINT_DISTANCE) continue;
          if (speed != null && speed > MAX_WAYPOINT_SPEED_MS) continue;
          merged.push(p);
          last = p;
        }
        // Trim for at undgå uendelig vækst (beholder de seneste ~2000 punkter)
        const trimmed = merged.slice(-2000);
        await AsyncStorage.setItem(TRACK_BUFFER_KEY, JSON.stringify(trimmed));

      } catch (e) {
        // console.log("BG track buffer parse/save fejl:", e);
      }
    });
    trackTaskDefined = true;
  } catch (e) {
    // console.log("Task allerede defineret eller fejlede:", e);
  }
}

function haversine(a: Pt, b: Pt) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function computeDistance(points: Pt[]): number {
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

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatTripName(trip: any, translate?: TranslateFn): string {
  const dt = trip?.start_ts ? new Date(trip.start_ts) : null;
  const dateStr =
    dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleDateString()
      : (translate ? translate("unknownDate") : "Ukendt dato");

  const spotName =
    typeof trip?.spot_name === "string" && trip.spot_name.trim()
      ? trip.spot_name.trim()
      : null;

  return spotName ? `${dateStr} · ${spotName}` : dateStr;
}

function getTripTitleParts(
  trip: any,
  translate?: TranslateFn
): { dateStr: string; spotName: string | null } {
  const dt = trip?.start_ts ? new Date(trip.start_ts) : null;
  const dateStr: string =
    dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleDateString()
      : (translate ? translate("unknownDate") : "Ukendt dato");

  const spotName: string | null =
    typeof trip?.spot_name === "string" && trip.spot_name.trim()
      ? trip.spot_name.trim()
      : null;

  return { dateStr, spotName };
}

function TripTitle({ trip, t }: { trip: any; t?: TranslateFn }) {
  const { dateStr, spotName } = getTripTitleParts(trip, t);
  return (
    <View style={styles.tripTitleRow}>
      {spotName ? (
        <View style={styles.tripLocationRow}>
          <Ionicons name="navigate-outline" size={14} color="#FFF" />
          <Text style={styles.tripSpot} numberOfLines={1} ellipsizeMode="tail">
            {spotName}
          </Text>
        </View>
      ) : null}
      <View style={styles.tripDateRow}>
        <Ionicons name="calendar-outline" size={14} color={THEME.textSec} />
        <Text style={styles.tripDate} numberOfLines={1}>
          {dateStr}
        </Text>
      </View>
    </View>
  );
}

// Filter options - will use translation function
const getFilterOptions = (t: (key: string) => string) => [
  { label: t("days14"), days: 14 },
  { label: t("days30"), days: 30 },
  { label: t("days60"), days: 60 },
  { label: t("all"), days: 0 },
];

function pickNearest<T extends { ts: number }>(
  series: T[] | undefined,
  now = Date.now(),
  maxAgeMs = 60 * 60 * 1000
): T | null {
  if (!series || !series.length) return null;
  let best = series[0];
  let bestDiff = Math.abs(series[0].ts - now);
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(series[i].ts - now);
    if (d < bestDiff) {
      bestDiff = d;
      best = series[i];
    }
  }
  if (bestDiff > maxAgeMs) return best;
  return best;
}

// ============================================================================
// Vejr-/forholds-analyse til statistik
// ============================================================================

type SimpleBucket = {
  trips: number; // her: antal fangst-events i den bøtte
  fish: number; // her: antal fisk (fangster) i den bøtte
};

type BestBucket = {
  label: string;
  trips: number;
};

type TranslateFn = (key: string) => string;

function waterLevelBucket(cm?: number | null, t?: TranslateFn): string {
  if (cm == null || !Number.isFinite(cm)) return t ? t("unknown") : "ukendt";
  if (cm < -20) return t ? t("lowWater") : "Lavvande";
  if (cm > 20) return t ? t("highWater") : "Højvande";
  return t ? t("midWater") : "Middel vandstand";
}

function seasonFromMonth(month: number, t?: TranslateFn): string {
  if (month >= 2 && month <= 4) return t ? t("spring") : "Foråret";
  if (month >= 5 && month <= 7) return t ? t("summer") : "Sommeren";
  if (month >= 8 && month <= 10) return t ? t("autumn") : "Efteråret";
  return t ? t("winter") : "Vinteren";
}

function filterTripsBySeason(trips: any[], seasonKey: string): any[] {
  if (seasonKey === "all") return trips;
  const seasonMonths: Record<string, number[]> = {
    spring: [2, 3, 4],
    summer: [5, 6, 7],
    autumn: [8, 9, 10],
    winter: [11, 0, 1],
  };
  const months = seasonMonths[seasonKey];
  if (!months) return trips;
  return trips.filter((t) => {
    const ts = t.start_ts;
    if (!ts) return false;
    const d = new Date(ts);
    const m = d.getMonth();
    return months.includes(m);
  });
}

function timeOfDayBucket(h: number, t?: TranslateFn): string {
  if (h >= 5 && h < 9) return t ? t("theMorning") : "Morgenen";
  if (h >= 9 && h < 12) return t ? t("theLateMorning") : "Formiddagen";
  if (h >= 12 && h < 17) return t ? t("theAfternoon") : "Eftermiddagen";
  if (h >= 17 && h < 22) return t ? t("theEvening") : "Aftenen";
  return t ? t("theNight") : "Natten";
}

type TempBand = {
  label: string;
  min: number;
  max: number;
};

const TEMP_BANDS: TempBand[] = [
  { label: "0–4°C", min: 0, max: 4 },
  { label: "4–8°C", min: 4, max: 8 },
  { label: "8–12°C", min: 8, max: 12 },
  { label: "12–16°C", min: 12, max: 16 },
  { label: "16°C+", min: 16, max: 100 },
];

function tempBucketLabel(temp?: number | null, t?: TranslateFn): string {
  if (temp == null || !Number.isFinite(temp)) return t ? t("unknown") : "ukendt";
  const band = TEMP_BANDS.find((b) => temp >= b.min && temp < b.max);
  return band ? band.label : (t ? t("unknown") : "ukendt");
}

function windSpeedBucketLabel(ms?: number | null, t?: TranslateFn): string {
  if (ms == null || !Number.isFinite(ms)) return t ? t("unknown") : "ukendt";
  if (ms < 4) return t ? t("weakWind") : "svag vind";
  if (ms < 8) return t ? t("mildWind") : "mild vind";
  if (ms < 12) return t ? t("freshWind") : "frisk vind";
  return t ? t("hardWind") : "hård vind";
}

function coastWindLabel(raw?: string | null, t?: TranslateFn): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();

  if (v.includes("fraland")) return t ? t("offshoreWind") : "fralandsvind";
  if (v.includes("påland") || v.includes("på-land")) return t ? t("onshoreWind") : "pålandsvind";
  if (v.includes("side") || v.includes("langs") || v.includes("tvaers"))
    return t ? t("sideWind") : "sidevind";
  if (v.includes("offshore")) return t ? t("offshoreWind") : "fralandsvind";
  if (v.includes("onshore")) return t ? t("onshoreWind") : "pålandsvind";

  if (v === "ukendt") return null;
  return raw;
}

// Vindretning fra grader -> Nord / Nordøst / ... / Nordvest
function windDirLabelFromDeg(deg: number, t?: TranslateFn): string {
  const d = ((deg % 360) + 360) % 360;

  if (d >= 337.5 || d < 22.5) return t ? t("north") : "Nord";
  if (d >= 22.5 && d < 67.5) return t ? t("northEast") : "Nordøst";
  if (d >= 67.5 && d < 112.5) return t ? t("east") : "Øst";
  if (d >= 112.5 && d < 157.5) return t ? t("southEast") : "Sydøst";
  if (d >= 157.5 && d < 202.5) return t ? t("south") : "Syd";
  if (d >= 202.5 && d < 247.5) return t ? t("southWest") : "Sydvest";
  if (d >= 247.5 && d < 292.5) return t ? t("west") : "Vest";
  return t ? t("northWest") : "Nordvest";
}

// Nu vælger vi bøtten med flest fisk (fangster),
// ikke “fisk pr. tur”
function pickBestBucket(
  stats: Record<string, SimpleBucket>,
  minTrips: number
): BestBucket | null {
  const entries = Object.entries(stats);
  if (!entries.length) return null;

  const filtered = entries.filter(([, s]) => s.trips >= minTrips);
  const list = filtered.length ? filtered : entries;

  let bestLabel = list[0][0];
  let best = list[0][1];

  for (let i = 1; i < list.length; i++) {
    const [label, s] = list[i];
    if (s.fish > best.fish) {
      best = s;
      bestLabel = label;
    }
  }

  return {
    label: bestLabel,
    trips: best.trips,
  };
}

function durationBucketLabel(durationSec?: number | null, t?: TranslateFn): string | null {
  if (!Number.isFinite(durationSec ?? null)) return null;
  const hrs = (durationSec as number) / 3600;
  if (hrs < 2) return t ? t("lessThan2Hours") : "<2 timer";
  if (hrs < 4) return t ? t("hours2to4") : "2-4 timer";
  if (hrs < 6) return t ? t("hours4to6") : "4-6 timer";
  return t ? t("hours6plus") : "6+ timer";
}

function movementLabel(distanceM?: number | null, durationSec?: number | null, t?: TranslateFn): string | null {
  if (!Number.isFinite(distanceM ?? null) || !Number.isFinite(durationSec ?? null)) return null;
  const dist = distanceM as number;
  const dur = durationSec as number;
  if (dur <= 0) return null;
  const speed = dist / dur; // m/s
  if (dist <= 300) return t ? t("standingLightMovement") : "Stillestående/let bevægelse";
  if (dist >= 1500 || speed >= 0.35) return t ? t("fishingTheWater") : "Affiskning af vand";
  return t ? t("calmPace") : "Roligt tempo";
}

// VIGTIG DEL: nu bruger vi fangst-timestamps fra fish_events_json
// i kombination med vejr-evaluation pr. tur
function buildWeatherSummary(allTrips: any[], t?: TranslateFn): string | null {
  const tripsWithFish = allTrips.filter((t) => (t.fish_count ?? 0) > 0);
  if (!tripsWithFish.length) return null;

  const tideStats: Record<string, SimpleBucket> = {};
  const seasonStats: Record<string, SimpleBucket> = {};
  const todStats: Record<string, SimpleBucket> = {};
  const airTempStats: Record<string, SimpleBucket> = {};
  const waterTempStats: Record<string, SimpleBucket> = {};
  const coastWindStats: Record<string, SimpleBucket> = {};
  const windSpeedStats: Record<string, SimpleBucket> = {};
  const durationStats: Record<string, SimpleBucket> = {};
  const movementStats: Record<string, SimpleBucket> = {};

  // NYT: spot-statistik (hvilket spot giver flest fisk)
  const spotStats: Record<string, SimpleBucket> = {};

  // NYT: vindrets-statistik (Nord, Sydvest osv.)
  const windDirStats: Record<string, SimpleBucket> = {};

  const sunOffset = {
    sumMinutes: 0,
    count: 0,
    sunriseCount: 0,
    sunsetCount: 0,
  };

  const getTripLocation = (t: any): { lat: number; lng: number } | null => {
    if (Number.isFinite(t.spot_lat) && Number.isFinite(t.spot_lng)) {
      return { lat: t.spot_lat, lng: t.spot_lng };
    }
    if (t.path_json) {
      try {
        const parsed = JSON.parse(t.path_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          const lat =
            typeof first.lat === "number"
              ? first.lat
              : typeof first.latitude === "number"
              ? first.latitude
              : null;
          const lng =
            typeof first.lng === "number"
              ? first.lng
              : typeof first.longitude === "number"
              ? first.longitude
              : null;
          if (lat != null && lng != null) return { lat, lng };
        }
      } catch {
        // ignore parse error
      }
    }
    return null;
  };

  for (const trip of tripsWithFish) {
    const fishCount = trip.fish_count ?? 0;

    let meta: any = {};
    let evaluation: any = null;

    try {
      meta = trip.meta_json ? JSON.parse(trip.meta_json) : {};
    } catch {
      meta = {};
    }

    evaluation =
      meta?.evaluation ||
      meta?.summary?.evaluation ||
      (meta && meta.source ? meta : null);

    // Normalisering af evaluation-felter (som før)
    if (evaluation) {
      if (evaluation.seaTempC && !evaluation.waterTempC) {
        evaluation.waterTempC = evaluation.seaTempC;
      }
      if (evaluation.waterLevelCm && !evaluation.waterLevelCM) {
        evaluation.waterLevelCM = evaluation.waterLevelCm;
      }
      if (evaluation.seaTempSeries && !evaluation.waterTempSeries) {
        evaluation.waterTempSeries = evaluation.seaTempSeries;
      }
      if (!evaluation.waterLevelSeries && evaluation.waterLevelCmSeries) {
        evaluation.waterLevelSeries = evaluation.waterLevelCmSeries;
      }
    }

    // Vejr-værdier (trip-niveau)
    const wl =
      evaluation?.waterLevelCM?.avg ??
      evaluation?.waterLevelCm?.avg ??
      null;
    const airT = evaluation?.airTempC?.avg ?? null;
    const waterT = evaluation?.waterTempC?.avg ?? null;
    const windMs = evaluation?.windMS?.avg ?? null;
    const cwRaw: string | null = evaluation?.coastWind?.category ?? null;
    const cw = coastWindLabel(cwRaw);

    // Prøv vindretning i grader (flere mulige felter)
    const windDirDeg: number | null =
      (evaluation?.windDirDeg?.avg ??
        evaluation?.windDeg?.avg ??
        evaluation?.windFromDirDeg?.avg ??
        evaluation?.windFromDir?.avg ??
        null) ?? null;

    const windDirKey =
      windDirDeg != null && Number.isFinite(windDirDeg)
        ? windDirLabelFromDeg(windDirDeg, t)
        : null;

    const tideKey = waterLevelBucket(wl, t);
    const airKey = tempBucketLabel(airT, t);
    const waterKey = tempBucketLabel(waterT, t);
    const windSpeedKey = windSpeedBucketLabel(windMs, t);
    const durationLabel =
      durationBucketLabel(
        Number.isFinite(trip.duration_sec)
          ? trip.duration_sec
          : trip.start_ts && trip.end_ts
          ? Math.max(
              0,
              (new Date(trip.end_ts).getTime() - new Date(trip.start_ts).getTime()) /
                1000
            )
          : null,
        t
      ) ?? null;
    const moveLabel = movementLabel(trip.distance_m, trip.duration_sec, t);
    const tripLocation = getTripLocation(trip);

    // Fangst-timestamps:
    // 1) Prøver fish_events_json (ISO-strenge eller ms)
    // 2) Hvis ikke, falder vi tilbage til start_ts og fordeler fishCount dér
    let catchMs: number[] = [];

    if (trip.fish_events_json) {
      try {
        const raw = JSON.parse(trip.fish_events_json);
        if (Array.isArray(raw)) {
          for (const ev of raw) {
            if (typeof ev === "string") {
              const ts = Date.parse(ev);
              if (!Number.isNaN(ts)) catchMs.push(ts);
            } else if (typeof ev === "number" && Number.isFinite(ev)) {
              catchMs.push(ev);
            }
          }
        }
      } catch {
        // ignorer parse-fejl
      }
    }

    if (!catchMs.length && fishCount > 0 && trip.start_ts) {
      const base = new Date(trip.start_ts).getTime();
      for (let i = 0; i < fishCount; i++) {
        catchMs.push(base);
      }
    }

    if (!catchMs.length) {
      continue;
    }

    // Spotnavn til statistik
    const spotName: string | null = trip.spot_name ?? null;

    // Nu kører vi én gang pr. fangst-event
    for (const ts of catchMs) {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;

      const month = d.getMonth();
      const hour = d.getHours();

      // Årstid fra fangst-tid
      if (month != null && Number.isFinite(month)) {
        const seasonKey = seasonFromMonth(month, t);
        if (!seasonStats[seasonKey]) {
          seasonStats[seasonKey] = { trips: 0, fish: 0 };
        }
        seasonStats[seasonKey].trips += 1;
        seasonStats[seasonKey].fish += 1;
      }

      // Tid på dagen fra fangst-tid
      if (hour != null && Number.isFinite(hour)) {
        const todKey = timeOfDayBucket(hour, t);
        if (!todStats[todKey]) {
          todStats[todKey] = { trips: 0, fish: 0 };
        }
        todStats[todKey].trips += 1;
        todStats[todKey].fish += 1;
      }

      // Vejr-bøtter: vægtes pr. fangst (evaluation er stadig pr. tur)
      if (tideKey) {
        if (!tideStats[tideKey]) tideStats[tideKey] = { trips: 0, fish: 0 };
        tideStats[tideKey].trips += 1;
        tideStats[tideKey].fish += 1;
      }

      if (airKey) {
        if (!airTempStats[airKey]) airTempStats[airKey] = { trips: 0, fish: 0 };
        airTempStats[airKey].trips += 1;
        airTempStats[airKey].fish += 1;
      }

      if (waterKey) {
        if (!waterTempStats[waterKey])
          waterTempStats[waterKey] = { trips: 0, fish: 0 };
        waterTempStats[waterKey].trips += 1;
        waterTempStats[waterKey].fish += 1;
      }

      if (windSpeedKey) {
        if (!windSpeedStats[windSpeedKey])
          windSpeedStats[windSpeedKey] = { trips: 0, fish: 0 };
        windSpeedStats[windSpeedKey].trips += 1;
        windSpeedStats[windSpeedKey].fish += 1;
      }

      if (cw) {
        if (!coastWindStats[cw]) coastWindStats[cw] = { trips: 0, fish: 0 };
        coastWindStats[cw].trips += 1;
        coastWindStats[cw].fish += 1;
      }

      // NYT: spot-statistik (en gang pr. fangst)
      if (spotName) {
        if (!spotStats[spotName]) {
          spotStats[spotName] = { trips: 0, fish: 0 };
        }
        spotStats[spotName].trips += 1;
        spotStats[spotName].fish += 1;
      }

      // NYT: vindretning i grader (Nord/Sydvest osv.)
      if (windDirKey) {
        if (!windDirStats[windDirKey]) {
          windDirStats[windDirKey] = { trips: 0, fish: 0 };
        }
        windDirStats[windDirKey].trips += 1;
        windDirStats[windDirKey].fish += 1;
      }

      // Tur-længde
      if (durationLabel) {
        if (!durationStats[durationLabel]) {
          durationStats[durationLabel] = { trips: 0, fish: 0 };
        }
        durationStats[durationLabel].trips += 1;
        durationStats[durationLabel].fish += 1;
      }

      // Bevægelse / stående
      if (moveLabel) {
        if (!movementStats[moveLabel]) {
          movementStats[moveLabel] = { trips: 0, fish: 0 };
        }
        movementStats[moveLabel].trips += 1;
        movementStats[moveLabel].fish += 1;
      }

      // Solopgang/-nedgang offset
      if (tripLocation) {
        try {
          const times = SunCalc.getTimes(d, tripLocation.lat, tripLocation.lng);
          const sunrise = times.sunrise?.getTime() ?? null;
          const sunset = times.sunset?.getTime() ?? null;
          const catchTs = d.getTime();
          const diffs: { label: "sunrise" | "sunset"; diff: number }[] = [];
          if (sunrise != null) diffs.push({ label: "sunrise", diff: catchTs - sunrise });
          if (sunset != null) diffs.push({ label: "sunset", diff: catchTs - sunset });
          if (diffs.length) {
            diffs.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
            const nearest = diffs[0];
            sunOffset.sumMinutes += nearest.diff / 60000;
            sunOffset.count += 1;
            if (nearest.label === "sunrise") sunOffset.sunriseCount += 1;
            if (nearest.label === "sunset") sunOffset.sunsetCount += 1;
          }
        } catch {
          // ignore suncalc errors
        }
      }
    }
  }

  // MIN_TRIPS = minimum antal fangst-events i en bøtte,
  // før vi stoler på den
  const MIN_TRIPS = 3;

  const bestTide = pickBestBucket(tideStats, MIN_TRIPS);
  const bestSeason = pickBestBucket(seasonStats, MIN_TRIPS);
  const bestTod = pickBestBucket(todStats, MIN_TRIPS);
  const bestAir = pickBestBucket(airTempStats, MIN_TRIPS);
  const bestWater = pickBestBucket(waterTempStats, MIN_TRIPS);
  const bestCoastWind = pickBestBucket(coastWindStats, MIN_TRIPS);
  const bestWindSpeed = pickBestBucket(windSpeedStats, MIN_TRIPS);
  const bestDuration = pickBestBucket(durationStats, MIN_TRIPS);
  const bestMovement = pickBestBucket(movementStats, MIN_TRIPS);

  // NYT: bedste spot (flest fisk)
  const bestSpot = pickBestBucket(spotStats, MIN_TRIPS);

  // NYT: bedste vindretning (Nord, Sydvest osv.)
  const bestWindDir = pickBestBucket(windDirStats, MIN_TRIPS);

  const lines: string[] = [];
  const unknown = t ? t("unknown") : "ukendt";

  // ØVERST: Spot-navn
  if (bestSpot && bestSpot.label !== unknown) {
    lines.push(`${t ? t("spotLabel") : "Spot"}: ${bestSpot.label}`);
  }

  // Vejr (samlet tæt)
  if (bestTide && bestTide.label !== unknown) {
    lines.push(bestTide.label);
  }
  if (bestWindSpeed && bestWindSpeed.label !== unknown) {
    const ws = bestWindSpeed.label;
    // Capitalize first letter and add "styrke" for wind
    lines.push(ws.charAt(0).toUpperCase() + ws.slice(1));
  }
  if (bestWindDir && bestWindDir.label !== unknown) {
    lines.push(`${t ? t("windDirection") : "Vindretning"}: ${bestWindDir.label}`);
  }
  if (bestCoastWind) {
    const key = bestCoastWind.label.toLowerCase();
    if (key.includes("fraland") || key.includes("offshore")) {
      lines.push(t ? t("atOffshoreWind") : "Ved fralandsvind");
    } else if (key.includes("påland") || key.includes("på-land") || key.includes("onshore")) {
      lines.push(t ? t("atOnshoreWind") : "Ved pålandsvind");
    } else if (key.includes("side") || key.includes("langs") || key.includes("tvaers")) {
      lines.push(t ? t("atSideWind") : "Ved sidevind");
    } else {
      lines.push(`${t ? t("windRelativeToCoast") : "Vind ift. kyst"}: ${bestCoastWind.label}`);
    }
  }
  if (bestWater && bestWater.label !== unknown) {
    lines.push(`${t ? t("seaTemp") : "Havtemperatur"}: ${bestWater.label}`);
  }
  if (bestAir && bestAir.label !== unknown) {
    lines.push(`${t ? t("airTemp") : "Lufttemperatur"}: ${bestAir.label}`);
  }

  // Tid på dagen + årstid + solrelation
  if (bestTod) {
    lines.push(`${t ? t("inThe") : "Om"} ${bestTod.label.toLowerCase()}`);
  }
  if (bestSeason) {
    lines.push(`${t ? t("inThe") : "Om"} ${bestSeason.label.toLowerCase()}`);
  }
  if (sunOffset.count > 0) {
    const avg = sunOffset.sumMinutes / sunOffset.count;
    const event =
      sunOffset.sunriseCount >= sunOffset.sunsetCount
        ? (t ? t("sunrise") : "solopgang")
        : (t ? t("sunset") : "solnedgang");
    const dir = avg < 0 ? (t ? t("minBefore") : "min før") : (t ? t("minAfter") : "min efter");
    const minutes = Math.round(Math.abs(avg));
    lines.push(`${t ? t("typicalMinutes") : "Typisk"} ${minutes} ${dir} ${event}`);
  }

  // Tur-setup
  if (bestDuration) {
    lines.push(`${t ? t("tripLength") : "Turlængde"}: ${bestDuration.label} ${t ? t("givesMostFish") : "giver flest fisk"}`);
  }
  if (bestMovement) {
    const mv = bestMovement.label.toLowerCase();
    if (mv.includes("affiskning") || mv.includes("fishing")) {
      lines.push(`${t ? t("mostFishAt") : "Flest fisk ved"} ${t ? t("fishingWater") : "affiskning af vand"}`);
    } else if (mv.includes("still") || mv.includes("standing")) {
      lines.push(`${t ? t("mostFishAt") : "Flest fisk ved"} ${t ? t("standingStill") : "stillestående/rolig placering"}`);
    } else {
      lines.push(`${t ? t("mostFishAt") : "Flest fisk ved"} ${bestMovement.label.toLowerCase()}`);
    }
  }

  // Prognose-match guide (hint til brugeren)
  const forecastHints: string[] = [];
  if (bestWindSpeed && bestWindSpeed.label !== unknown) {
    forecastHints.push(bestWindSpeed.label);
  }
  if (bestTide && bestTide.label !== unknown) {
    forecastHints.push(bestTide.label);
  }
  if (bestWater && bestWater.label !== unknown) {
    forecastHints.push(`${t ? t("seaTemp") : "Havtemp"} ${bestWater.label}`);
  }
  if (forecastHints.length) {
    lines.push(
      `${t ? t("forecastLookFor") : "Prognose: kig efter"} ${forecastHints.slice(0, 3).join(", ")} ${t ? t("forBestMatch") : "for bedste match"}`
    );
  }

  if (!lines.length) return null;
  return lines.join("\n");
}

function patternIcon(line: string): string {
  const lower = line.toLowerCase();

  if (lower.startsWith("spot:")) return "location-outline";
  if (lower.includes("prognose")) return "trending-up-outline";
  if (lower.includes("turlængde")) return "timer-outline";

  if (lower.includes("flest fisk")) {
    if (lower.includes("affiskning")) return "walk-outline";
    if (lower.includes("stillestående") || lower.includes("rolig"))
      return "pause-circle-outline";
    return "fish-outline";
  }

  if (lower.includes("solopgang") || lower.includes("solnedgang"))
    return "sunny-outline";

  if (lower.includes("havtemp") || lower.includes("havtemperatur"))
    return "water-outline";
  if (lower.includes("lufttemp") || lower.includes("lufttemperatur"))
    return "thermometer-outline";

  if (lower.includes("vindretning")) return "compass-outline";
  if (lower.includes("vind") || lower.includes("vindstyrke"))
    return "flag-outline";

  if (
    lower.includes("vandstand") ||
    lower.includes("højvande") ||
    lower.includes("lavvande")
  )
    return "water-outline";

  if (lower.includes("morgen") || lower.includes("formiddag")) return "time-outline";
  if (lower.includes("eftermiddag") || lower.includes("aften") || lower.includes("nat"))
    return "time-outline";

  if (
    lower.includes("foråret") ||
    lower.includes("sommeren") ||
    lower.includes("efteråret") ||
    lower.includes("vinteren") ||
    lower.includes("hele året")
  ) {
    if (lower.includes("sommer")) return "sunny-outline";
    if (lower.includes("vinter")) return "cloud-outline";
    return "leaf-outline";
  }

  return "information-circle-outline";
}

// ============================================================================
// Resten af filen (tracking, statistik, UI)
// ============================================================================

export default function Track() {
  const { t } = useLanguage();
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [sec, setSec] = useState(0);
  const [region, setRegion] = useState<Region>(DEFAULT_TRACK_REGION);
  const [liveWeather, setLiveWeather] = useState<{
    tempC: number | null;
    windMS: number | null;
    windDirDeg: number | null;
    waterLevelCM: number | null;
    waveHeightM: number | null;
    trend: "up" | "down" | "flat" | null;
  } | null>(null);
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveFetchedAt, setLiveFetchedAt] = useState<number | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const waterArrowAnim = useRef(new Animated.Value(0)).current;

  const hasGoogleMapsKey =
    Platform.OS !== "android"
      ? true
      : Boolean(Constants.expoConfig?.extra?.mapsApiKey);
  const trackingUsesOsmTiles =
    Platform.OS === "android" && !hasGoogleMapsKey;
  const trackingMapProvider =
    Platform.OS === "android"
      ? hasGoogleMapsKey
        ? PROVIDER_GOOGLE
        : PROVIDER_DEFAULT
      : undefined;
  const trackingMapType = trackingUsesOsmTiles ? "none" : "standard";

  // Fangst-tidsstempler
  const [catchMarks, setCatchMarks] = useState<number[]>([]);
  // Cursor til realtime visning
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  // Hvilken markør er valgt til slet
  const [selectedCatchIndex, setSelectedCatchIndex] = useState<number | null>(
    null
  );

  const [fishModal, setFishModal] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);

  const [recent, setRecent] = useState<any[]>([]);
  const [daysFilter, setDaysFilter] = useState<number>(14);

  const thisYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([thisYear]);
  const [year, setYear] = useState<number>(thisYear);
  const [yearStats, setYearStats] = useState<any | null>(null);
  const [allStats, setAllStats] = useState<any | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [yearGraphData, setYearGraphData] = useState<GraphPoint[]>([]);
  const [allTimeGraphData, setAllTimeGraphData] = useState<GraphPoint[]>([]);

  const [permissionModalVisible, setPermissionModalVisible] =
    useState(false);

  const [yearWeatherSummary, setYearWeatherSummary] =
    useState<string | null>(null);
  const [allTimeWeatherSummary, setAllTimeWeatherSummary] =
    useState<string | null>(null);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [catchToastVisible, setCatchToastVisible] = useState(false);
  const [seasonPickerVisible, setSeasonPickerVisible] = useState(false);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState("all");
  const [spotsModalVisible, setSpotsModalVisible] = useState(false);
  const [spotsWithVisits, setSpotsWithVisits] = useState<
    Array<SpotRow & { visitCount: number; fishCount: number }>
  >([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const lastLiveFetchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!liveWeather || liveWeather.trend === null) return;
    if (liveWeather.trend === "flat") {
      waterArrowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waterArrowAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(waterArrowAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveWeather?.trend, waterArrowAnim]);

  const fetchLiveWeather = useCallback(
    async (lat: number, lon: number) => {
      if (liveFetching) return;
      setLiveFetching(true);
      setLiveError(null);
      try {
        const edr = await getSpotForecastEdr(lat, lon);
        if (!edr) throw new Error("Ingen EDR-data");
        const now = Date.now();
        const wind = pickNearest(edr.windSpeedSeries, now);
        const windDir = pickNearest(edr.windDirSeries, now);
        const temp = pickNearest(edr.airTempSeries, now);
        const wlPoint = pickNearest(edr.waterLevelSeries, now);
        const wavePoint = pickNearest(edr.waveHeightSeries, now);

        let trend: "up" | "down" | "flat" | null = null;
        if (edr.waterLevelSeries && edr.waterLevelSeries.length >= 2) {
          const first = edr.waterLevelSeries[0].v;
          const last = edr.waterLevelSeries[edr.waterLevelSeries.length - 1].v;
          const diff = last - first;
          if (diff > 0.5) trend = "up";
          else if (diff < -0.5) trend = "down";
          else trend = "flat";
        }

        setLiveWeather({
          tempC: temp?.v ?? null,
          windMS: wind?.v ?? null,
          windDirDeg: windDir?.v ?? null,
          waterLevelCM: wlPoint?.v ?? null,
          waveHeightM: wavePoint?.v ?? null,
          trend,
        });
        setLiveFetchedAt(now);
      } catch (e) {
        // console.log("Kunne ikke hente live-vejr", e);
        setLiveError("Kan ikke hente vejr lige nu");
      } finally {
        setLiveFetching(false);
      }
    },
    [liveFetching]
  );

  const fetchLiveFromDevice = useCallback(async () => {
    const now = Date.now();
    if (lastLiveFetchRef.current && now - lastLiveFetchRef.current < 5 * 60 * 1000) {
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLiveError("Lokation ikke givet");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      lastLiveFetchRef.current = now;
      fetchLiveWeather(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      // console.log("Live vejr lokationsfejl", e);
      setLiveError("Kan ikke hente vejr lige nu");
    }
  }, [fetchLiveWeather]);

  useEffect(() => {
    fetchLiveFromDevice();
    const id = setInterval(fetchLiveFromDevice, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchLiveFromDevice]);

  const renderFishPattern = (summary?: string | null) => {
    if (!summary) {
      return (
        <View style={styles.fishPatternChipWrap}>
          <View style={styles.fishPatternChip}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={THEME.graphYellow}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.fishPatternChipText}>
              Ingen data endnu for valgt årstid.
            </Text>
          </View>
        </View>
      );
    }

    const items = summary.split("\n").filter(Boolean);
    return (
      <View style={styles.fishPatternChipWrap}>
        {items.map((line, idx) => (
          <View key={idx} style={styles.fishPatternChip}>
            <Ionicons
              name={patternIcon(line)}
              size={14}
              color={THEME.graphYellow}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.fishPatternChipText}>{line}</Text>
          </View>
        ))}
      </View>
    );
  };
  const seasonOptions = [
    { key: "all", label: t("wholeYear") },
    { key: "spring", label: t("spring") },
    { key: "summer", label: t("summer") },
    { key: "autumn", label: t("autumn") },
    { key: "winter", label: t("winter") },
  ];
  const getSeasonLabel = (key: string) =>
    seasonOptions.find((s) => s.key === key)?.label ?? t("wholeYear");
  const filterOptions = getFilterOptions(t);

  const reminderIdRef = useRef<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const catchToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startIsoRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const endIsoRef = useRef<string | null>(null);

  const buildLocationUpdateOptions = useCallback(
    (): Location.LocationTaskOptions => ({
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
      timeInterval: 4000,
      pausesUpdatesAutomatically: false,
      ...(Platform.OS === "android"
        ? {
            foregroundService: {
              notificationTitle: "Tracking kører",
              notificationBody: "Stop turen når du er færdig.",
            },
          }
        : {
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.Fitness,
          }),
    }),
    []
  );

  const handlePositionUpdate = useCallback((pos: Location.LocationObject) => {
    const p: Pt = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      t:
        typeof pos.timestamp === "number" && Number.isFinite(pos.timestamp)
          ? pos.timestamp
          : Date.now(),
    };

    setPoints((arr) => {
      if (arr.length === 0) {
        setDistanceM(0);
        return [p];
      }
      const last = arr[arr.length - 1];
      const step = haversine(last, p);
      if (step < MIN_WAYPOINT_DISTANCE) {
        return arr;
      }
      const dtMs = Math.max(1, p.t - last.t);
      const speed = step / (dtMs / 1000);
      if (step > MAX_WAYPOINT_DISTANCE || speed > MAX_WAYPOINT_SPEED_MS) {
        return arr;
      }
      const newDist = step;
      setDistanceM((m) => m + newDist);
      return [...arr, p];
    });
  }, []);

  const clearStoredTrack = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        TRACK_BUFFER_KEY,
        TRACK_META_KEY,
        TRACK_ACTIVE_KEY,
      ]);
    } catch (e) {
      // console.log("Kunne ikke rydde track storage:", e);
    }
  }, []);

  const loadStoredTrack = useCallback(async (): Promise<Pt[]> => {
    try {
      const raw = await AsyncStorage.getItem(TRACK_BUFFER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr as Pt[];
    } catch (e) {
      // console.log("Kunne ikke hente track buffer:", e);
      return [];
    }
  }, []);

  const hydrateTrackFromStorage = useCallback(async () => {
    try {
      const [bufRaw, metaRaw, activeRaw] = await Promise.all([
        AsyncStorage.getItem(TRACK_BUFFER_KEY),
        AsyncStorage.getItem(TRACK_META_KEY),
        AsyncStorage.getItem(TRACK_ACTIVE_KEY),
      ]);

      if (bufRaw) {
        const pts = JSON.parse(bufRaw) as Pt[];
        if (Array.isArray(pts) && pts.length) {
          setPoints(pts);
          setDistanceM(computeDistance(pts));
          const last = pts[pts.length - 1];
          setRegion({
            latitude: last.latitude,
            longitude: last.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          });
        }
      }

      if (metaRaw && activeRaw === "1") {
        const meta = JSON.parse(metaRaw);
        if (meta?.startIso) {
          startIsoRef.current = meta.startIso;
          sessionIdRef.current = meta.sessionId ?? null;
          setRunning(true);
        }
      }
    } catch (e) {
      // console.log("Hydration fejl:", e);
    }
  }, []);

  const ensureBackgroundTracking = useCallback(async () => {
    if (!startIsoRef.current) return;
    try {
      const bgPerm = await Location.getBackgroundPermissionsAsync();
      if (bgPerm.status !== "granted") return;

      const started = await Location.hasStartedLocationUpdatesAsync(
        TRACK_TASK_NAME
      );
      if (!started) {
        await Location.startLocationUpdatesAsync(
          TRACK_TASK_NAME,
          buildLocationUpdateOptions()
        );
      }

      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 4000,
          },
          handlePositionUpdate
        );
      }
    } catch (e) {
      // console.log("Kunne ikke genskabe tracking:", e);
    }
  }, [buildLocationUpdateOptions, handlePositionUpdate]);

  const getMergedPoints = useCallback(async (): Promise<Pt[]> => {
    const stored = await loadStoredTrack();
    const merged = [...points, ...stored];
    if (!merged.length) return [];
    merged.sort((a, b) => a.t - b.t);
    const seen = new Set<string>();
    const deduped: Pt[] = [];
    for (const p of merged) {
      const key = `${p.latitude}|${p.longitude}|${p.t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }
    return deduped;
  }, [points, loadStoredTrack]);

  const refreshLists = useCallback(async () => {
    setRecent(await listTrips(50, daysFilter));
  }, [daysFilter]);

  function buildGraphs(allTrips: any[], selectedYear: number) {
    const monthNames = [
      t("jan"),
      t("feb"),
      t("mar"),
      t("apr"),
      t("may"),
      t("jun"),
      t("jul"),
      t("aug"),
      t("sep"),
      t("oct"),
      t("nov"),
      t("dec"),
    ];
    const months: number[] = new Array(12).fill(0);

    allTrips.forEach((t) => {
      const ts = t.start_ts;
      if (!ts) return;
      const d = new Date(ts);
      if (d.getFullYear() !== selectedYear) return;
      const m = d.getMonth();
      const fish = t.fish_count ?? 0;
      months[m] += fish;
    });

    const yearData: GraphPoint[] = months.map((val, idx) => ({
      label: monthNames[idx],
      value: val,
    }));
    setYearGraphData(yearData);

    const perYear: Record<string, number> = {};
    allTrips.forEach((t) => {
      const ts = t.start_ts;
      if (!ts) return;
      const d = new Date(ts);
      const y = String(d.getFullYear());
      const fish = t.fish_count ?? 0;
      perYear[y] = (perYear[y] ?? 0) + fish;
    });

    const allYears = Object.keys(perYear).sort(
      (a, b) => Number(a) - Number(b)
    );
    const allData: GraphPoint[] = allYears.map((y) => ({
      label: y,
      value: perYear[y],
    }));
    setAllTimeGraphData(allData);
  }

async function refreshYearsAndStats(
    selectedYear?: number,
    seasonKey = selectedSeasonKey
  ) {
    const ys = await listYears();
    setYears(ys.length ? ys : [thisYear]);

    const targetYear = selectedYear ?? thisYear;
    setYear(targetYear);
    setYearStats(await statsTrips(targetYear));
    setAllStats(await statsTrips());

    const allTrips = await listTrips(1000, 0);
    buildGraphs(allTrips, targetYear);

    const yearTrips = allTrips.filter((t) => {
      const ts = t.start_ts;
      if (!ts) return false;
      const d = new Date(ts);
      return d.getFullYear() === targetYear;
    });

    const filteredYearTrips = filterTripsBySeason(yearTrips, seasonKey);
    const filteredAllTrips = filterTripsBySeason(allTrips, seasonKey);

    const yearSummary = buildWeatherSummary(filteredYearTrips, t);
    const allSummary = buildWeatherSummary(filteredAllTrips, t);

    setYearWeatherSummary(yearSummary);
    setAllTimeWeatherSummary(allSummary);
  }

  async function loadSpotsWithVisits() {
    setLoadingSpots(true);
    try {
      const spots = await listSpots();
      const allTrips = await listTrips(10000, 0);

      const spotsData = spots.map((spot) => {
        const tripsAtSpot = allTrips.filter((t) => t.spot_id === spot.id);
        const visitCount = tripsAtSpot.length;
        const fishCount = tripsAtSpot.reduce((sum, t) => {
          if (t.fish_events_json) {
            try {
              const parsed = JSON.parse(t.fish_events_json);
              if (Array.isArray(parsed)) return sum + parsed.length;
            } catch {}
          }
          return sum + (t.fish_count ?? 0);
        }, 0);
        return { ...spot, visitCount, fishCount };
      });

      spotsData.sort((a, b) => b.visitCount - a.visitCount);
      setSpotsWithVisits(spotsData);
    } catch (e) {
      // console.log("Fejl ved hentning af spots:", e);
    } finally {
      setLoadingSpots(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await syncOfflineTrips();
        } catch (e) {
          // console.log("Fejl ved sync af offline ture:", e);
        }
        await hydrateTrackFromStorage();
        await refreshLists();
        await refreshYearsAndStats();
      })();
      return () => {};
    }, [refreshLists, hydrateTrackFromStorage])
  );

  useEffect(() => {
    if (!running) return;
    ensureBackgroundTracking();
  }, [running, ensureBackgroundTracking]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hydrateTrackFromStorage();
        if (running) {
          ensureBackgroundTracking();
        }
      }
    });
    return () => sub.remove();
  }, [hydrateTrackFromStorage, ensureBackgroundTracking, running]);

  useEffect(() => {
    if (running) return;
    hydrateTrackFromStorage();
  }, [running, hydrateTrackFromStorage]);

  useEffect(() => {
    return () => {
      if (watchRef.current) watchRef.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      if (catchToastTimerRef.current) {
        clearTimeout(catchToastTimerRef.current);
        catchToastTimerRef.current = null;
      }
      cancelReminder();
    };
  }, []);

  useEffect(() => {
    // Rehent summaries når årstid skiftes
    refreshYearsAndStats(year, selectedSeasonKey);
  }, [selectedSeasonKey]);

  useEffect(() => {
    if (!running || !startIsoRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const update = () => {
      if (!startIsoRef.current) return;
      const startMs = new Date(startIsoRef.current).getTime();
      const diffSec = Math.max(
        0,
        Math.floor((Date.now() - startMs) / 1000)
      );
      setSec(diffSec);
    };

    update();
    const id = setInterval(update, 1000);
    timerRef.current = id as any;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  async function scheduleReminder(hours: number) {
    if (!hours) return;
    try {
      const Notifications = await ensureNotificationsConfigured();
      if (!Notifications) return; // Expo Go Android -> no-op

      const perms = await Notifications.requestPermissionsAsync();
      if (perms.status !== "granted") return;

      await cancelReminder();

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Tracking kører stadig",
          body: "Husk at stoppe turen, når du er færdig.",
        },
        trigger: { seconds: hours * 3600, repeats: true },
      });
      reminderIdRef.current = id;
    } catch (e) {
      // console.log("Fejl i scheduleReminder:", e);
    }
  }

  async function cancelReminder() {
    const id = reminderIdRef.current;
    if (!id) {
      return;
    }
    try {
      const Notifications = await ensureNotificationsConfigured();
      if (!Notifications) return; // Expo Go Android -> no-op
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (e) {
      // console.log("Fejl i cancelReminder:", e);
    }
    reminderIdRef.current = null;
  }

  function confirmStart() {
    if (starting || running) return;
    setStarting(true);
    const resetState = () => {
      setRunning(false);
      setPoints([]);
      setDistanceM(0);
      setSec(0);
      startIsoRef.current = null;
      sessionIdRef.current = null;
      endIsoRef.current = null;
      setCatchMarks([]);
      setCursorMs(null);
      setSelectedCatchIndex(null);
    };

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          setPermissionModalVisible(true);
          resetState();
          await clearStoredTrack();
          if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
          }
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          Alert.alert(
            "Placering er slukket",
            "Taend for GPS i Indstillinger og proev igen."
          );
          resetState();
          await clearStoredTrack();
          if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
          }
          return;
        }

        let backgroundGranted = false;
        try {
          const bgPerm = await Location.requestBackgroundPermissionsAsync();
          backgroundGranted = bgPerm.status === "granted";
        } catch (err) {
          // console.log("Kunne ikke forespoerge baggrundstilladelse:", err);
          backgroundGranted = false;
        }
        if (!backgroundGranted) {
          Alert.alert(
            "Baggrundstilladelse mangler",
            "Tracking koerer kun i forgrunden. Vaelg 'Allow all the time' i Indstillinger for baggrund."
          );
        }

        if (watchRef.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
        try {
          const started = await Location.hasStartedLocationUpdatesAsync(
            TRACK_TASK_NAME
          );
          if (started) {
            await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
          }
        } catch (err) {
          // console.log("Kunne ikke stoppe BG tracking:", err);
        }
        await clearStoredTrack();

        const startIso = new Date().toISOString();
        const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        startIsoRef.current = startIso;
        sessionIdRef.current = sessionId;
        endIsoRef.current = null;
        setSec(0);
        setDistanceM(0);
        setCatchMarks([]);
        setCursorMs(null);
        setSelectedCatchIndex(null);

        let loc: Location.LocationObject | null = null;
        try {
          loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch (err) {
          // console.log("Kunne ikke hente start-position:", err);
        }

        if (!loc) {
          try {
            loc = await Location.getLastKnownPositionAsync();
          } catch (err) {
            // console.log("Kunne ikke hente sidste kendte position:", err);
          }
        }

        const initialPoints: Pt[] = [];
        if (loc) {
          const r: Region = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          };
          setRegion(r);

          const firstPoint = {
            latitude: r.latitude,
            longitude: r.longitude,
            t:
              typeof loc.timestamp === "number" &&
              Number.isFinite(loc.timestamp)
                ? loc.timestamp
                : Date.now(),
          };
          initialPoints.push(firstPoint);
        }
        setPoints(initialPoints);

        await AsyncStorage.setItem(
          TRACK_BUFFER_KEY,
          JSON.stringify(initialPoints)
        );
        await AsyncStorage.setItem(
          TRACK_META_KEY,
          JSON.stringify({ startIso, sessionId })
        );
        await AsyncStorage.setItem(TRACK_ACTIVE_KEY, "1");

        const locationUpdateOptions = buildLocationUpdateOptions();

        if (backgroundGranted) {
          try {
            await Location.startLocationUpdatesAsync(
              TRACK_TASK_NAME,
              locationUpdateOptions
            );
          } catch (err) {
            // console.log("Kunne ikke starte BG tracking:", err);
            Alert.alert(
              "Baggrundstracking fejlede",
              "Tracking koerer kun i forgrunden."
            );
          }
        }

        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 4000,
          },
          handlePositionUpdate
        );

        setRunning(true);
        cancelReminder();
      } catch (e) {
        // console.log("Fejl ved start af tracking:", e);
        const errMessage = e instanceof Error ? e.message : String(e);
        Alert.alert(
          "Tracking kunne ikke starte",
          `Fejl: ${errMessage}`
        );
        if (watchRef.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        try {
          const started = await Location.hasStartedLocationUpdatesAsync(
            TRACK_TASK_NAME
          );
          if (started) {
            await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
          }
        } catch (err) {
          // console.log("Kunne ikke stoppe BG tracking:", err);
        }
        resetState();
        await clearStoredTrack();
      } finally {
        setStarting(false);
      }
    })();
  }

  function markCatchNow() {
    if (!startIsoRef.current) return;
    const now = Date.now();
    const startMs = new Date(startIsoRef.current).getTime();
    if (now <= startMs) return;
    setCatchMarks((prev) => [...prev, now]);
    setCatchToastVisible(true);
    if (catchToastTimerRef.current) {
      clearTimeout(catchToastTimerRef.current);
    }
    catchToastTimerRef.current = setTimeout(() => {
      setCatchToastVisible(false);
      catchToastTimerRef.current = null;
    }, 1200);
  }

  async function stop() {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    try {
      await AsyncStorage.setItem(TRACK_ACTIVE_KEY, "0");
    } catch (e) {
      // console.log("Kunne ikke opdatere tracking-flag:", e);
    }
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        TRACK_TASK_NAME
      );
      if (started) {
        await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
      }
    } catch (e) {
      // console.log("Kunne ikke stoppe BG tracking:", e);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    endIsoRef.current = new Date().toISOString();
    // sæt cursor til slut som default
    if (endIsoRef.current) {
      setCursorMs(new Date(endIsoRef.current).getTime());
    }
    setFishModal(true);
  }

  async function confirmFish() {
    // Luk modalerne straks uanset net
    setFishModal(false);
    setStopConfirmVisible(false);
    setCancelConfirmVisible(false);
    if (savingTrip) return;
    setSavingTrip(true);
    const fish = catchMarks.length;

    const startIso =
      startIsoRef.current ||
      new Date(Date.now() - sec * 1000).toISOString();
    const endIso =
      endIsoRef.current || new Date().toISOString();

    const duration_sec = Math.max(
      0,
      Math.floor(
        (new Date(endIso).getTime() - new Date(startIso).getTime()) /
          1000
      )
    );

    const pathToSave = await getMergedPoints();

    const basePayload: SaveTripPayload = {
      start_ts: startIso,
      end_ts: endIso,
      duration_sec,
      distance_m: Math.round(distanceM),
      fish_count: fish,
      path_json: JSON.stringify(pathToSave),
      meta_json: null,
      needs_dmi: true,
      // vigtig: gem rå fangst-tidsstempler (ms) så fiskemønster kan bruge dem
      catch_marks_ms: catchMarks,
    };

    // Kør gem i baggrunden; UI er allerede lukket
    (async () => {
      let tripSaved = false;
      try {
        let evaluation: any = null;

        // Prøv DMI; hvis offline/fejl → queue med needs_dmi
        try {
          const ev = await evaluateTripWithDmi({
            startIso,
            endIso,
            points: pathToSave,
          });
          if (ev) evaluation = ev;
        } catch (e: any) {
          // console.log("Fejl ved DMI-evaluering (online-forsøg):", e?.message || e);
        }

        if (!evaluation) {
          await queueOfflineTrip({ ...basePayload, needs_dmi: true });
          tripSaved = true;
        } else {
          try {
            await saveTrip({
              ...basePayload,
              meta_json: JSON.stringify({ evaluation }),
              needs_dmi: false,
            } as any);
            tripSaved = true;
          } catch (e) {
            // console.log("Kunne ikke gemme tur online, køer til offline:", e);
            await queueOfflineTrip({
              ...basePayload,
              meta_json: JSON.stringify({ evaluation }),
              needs_dmi: false,
            });
            tripSaved = true;
          }
        }

        await clearStoredTrack();
        setPoints([]);
        setSec(0);
        setDistanceM(0);
        startIsoRef.current = null;
        sessionIdRef.current = null;
        endIsoRef.current = null;
        setCatchMarks([]);
        setCursorMs(null);
        setSelectedCatchIndex(null);

        try {
          await refreshLists();
          await refreshYearsAndStats(year);
        } catch (e) {
          // console.log("Kunne ikke opdatere lister/stats efter gem:", e);
        }
      } catch (e) {
        // Failsafe: Hvis alt andet fejler, prøv at køe turen en sidste gang
        // console.log("Kritisk fejl ved gem af tur, forsøger failsafe:", e);
        if (!tripSaved) {
          try {
            await queueOfflineTrip({ ...basePayload, needs_dmi: true });
            // console.log("Failsafe: Tur køet til offline sync");
          } catch (queueError) {
            console.error("KRITISK: Kunne ikke gemme tur - hverken online eller offline!", queueError);
            // Her kunne man evt. vise en alert til brugeren
          }
        }
      } finally {
        setSavingTrip(false);
      }
    })();
  }

  function cancelFish() {
    setFishModal(false);
    setPoints([]);
    setSec(0);
    setDistanceM(0);
    startIsoRef.current = null;
    sessionIdRef.current = null;
    endIsoRef.current = null;
    setCatchMarks([]);
    setCursorMs(null);
    setSelectedCatchIndex(null);
    clearStoredTrack();
  }

  // --- tidslinje-beregninger ---
  const tripStartMs = startIsoRef.current
    ? new Date(startIsoRef.current).getTime()
    : null;
  const tripEndMs = endIsoRef.current
    ? new Date(endIsoRef.current).getTime()
    : tripStartMs
    ? tripStartMs + sec * 1000
    : null;
  const durationMs =
    tripStartMs != null && tripEndMs != null
      ? Math.max(1, tripEndMs - tripStartMs)
      : 1;
  const timelineWidth = width - 80;

  const effectiveCursorMs =
    cursorMs ??
    (tripEndMs ??
      tripStartMs ??
      null);

  function handleTimelineTouch(e: any) {
    if (tripStartMs == null || tripEndMs == null) return;
    const x = e.nativeEvent.locationX;
    const usableWidth = Math.max(1, timelineWidth - 16);
    const rel = Math.min(1, Math.max(0, (x - 8) / usableWidth));
    const ms = tripStartMs + rel * durationMs;
    setCursorMs(ms);
    setSelectedCatchIndex(null);
  }

  function addCatchAtCursor() {
    if (tripStartMs == null || tripEndMs == null) return;
    const ms = effectiveCursorMs ?? tripStartMs + durationMs / 2;
    setCatchMarks((prev) => [...prev, ms]);
  }

  function removeSelectedCatch() {
    if (selectedCatchIndex == null) return;
    setCatchMarks((prev) =>
      prev.filter((_, idx) => idx !== selectedCatchIndex)
    );
    setSelectedCatchIndex(null);
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      {catchToastVisible && (
        <View pointerEvents="box-none" style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <View style={styles.toastIcon}>
              <Ionicons name="checkmark" size={18} color={THEME.bg} />
            </View>
            <Text style={styles.toastText}>{t("catchRegistered")}</Text>
          </View>
        </View>
      )}
      <ScrollView
        style={{ flex: 1, backgroundColor: THEME.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* === LIVE TRACKING CARD === */}
        <View style={styles.heroCard}>
          {/* Header med status */}
          <View style={styles.heroHeader}>
            <View style={styles.heroTitleRow}>
              <View style={[styles.statusIndicator, running && styles.statusIndicatorActive]}>
                <View style={[styles.statusDot, running && styles.statusDotActive]} />
              </View>
              <Text style={styles.heroTitle}>{t("liveTracking")}</Text>
            </View>
            {running && (
              <View style={styles.activeBadge}>
                <View style={styles.activePulse} />
                <Text style={styles.activeBadgeText}>{t("active")}</Text>
              </View>
            )}
          </View>

          {/* Kort */}
          <View style={styles.mapContainer}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={DEFAULT_TRACK_REGION}
              region={region}
              onRegionChangeComplete={setRegion}
              customMapStyle={MAP_STYLE}
              userInterfaceStyle={MAP_UI_STYLE}
              provider={trackingMapProvider}
              mapType={trackingMapType}
            >
              {trackingUsesOsmTiles && (
                <UrlTile
                  urlTemplate={OSM_TILE_URL}
                  maximumZ={19}
                  tileSize={256}
                  zIndex={0}
                />
              )}
              {points.length > 0 && (
                <>
                  <Polyline
                    coordinates={points.map((p) => ({
                      latitude: p.latitude,
                      longitude: p.longitude,
                    }))}
                    strokeWidth={4}
                    strokeColor={THEME.danger}
                  />
                  <Marker
                    coordinate={{
                      latitude: points[points.length - 1].latitude,
                      longitude: points[points.length - 1].longitude,
                    }}
                    pinColor="white"
                  />
                </>
              )}
            </MapView>

            {/* Stats overlay */}
            <View style={styles.mapOverlay}>
              <View style={styles.overlayStatBox}>
                <Ionicons name="time-outline" size={14} color={THEME.graphYellow} />
                <View>
                  <Text style={styles.overlayLabel}>{t("time")}</Text>
                  <Text style={styles.overlayValue}>{fmtTime(sec)}</Text>
                </View>
              </View>
              <View style={styles.overlayStatBox}>
                <Ionicons name="navigate-outline" size={14} color={THEME.graphYellow} />
                <View>
                  <Text style={styles.overlayLabel}>{t("distance").toUpperCase()}</Text>
                  <Text style={styles.overlayValue}>
                    {(distanceM / 1000).toFixed(2)} km
                  </Text>
                </View>
              </View>
              {running && (
                <View style={styles.overlayStatBox}>
                  <Ionicons name="fish" size={14} color={THEME.graphYellow} />
                  <View>
                    <Text style={styles.overlayLabel}>{t("catch")}</Text>
                    <Text style={styles.overlayValue}>{catchMarks.length}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Knapper */}
          <View style={styles.heroActions}>
            {!running ? (
              <Pressable
                style={[
                  styles.startButton,
                  (savingTrip || starting) && { opacity: 0.6 },
                ]}
                onPress={confirmStart}
                disabled={savingTrip || starting}
              >
                <View style={styles.startButtonInner}>
                  <View style={styles.startIconCircle}>
                    <Ionicons name="play" size={28} color="#000" />
                  </View>
                  <View style={styles.startTextContainer}>
                    <Text style={styles.startButtonText}>
                      {starting ? t("starting") : t("startFishingTrip")}
                    </Text>
                    <Text style={styles.startButtonSubtext}>
                      {t("tapToStartTracking")}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.runningActions}>
                {/* Fangst knap - stor og fremtrædende */}
                <Pressable style={styles.catchButtonLarge} onPress={markCatchNow}>
                  <View style={styles.catchIconCircle}>
                    <Ionicons name="fish" size={24} color="#000" />
                  </View>
                  <Text style={styles.catchButtonLargeText}>{t("catchBtn")}</Text>
                </Pressable>

                {/* Stop knap */}
                <Pressable
                  style={[styles.stopButtonNew, savingTrip && { opacity: 0.6 }]}
                  onPress={() => setStopConfirmVisible(true)}
                  disabled={savingTrip}
                >
                  <Ionicons name="stop-circle" size={22} color={THEME.danger} />
                  <Text style={styles.stopButtonNewText}>{t("finish")}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* === GRID STATS (Year) + FISKEMØNSTER === */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.sectionTitle}>{t("statistics")}</Text>
            <View style={styles.yearPill}>
              <Text style={styles.yearPillText}>{year}</Text>
            </View>
          </View>
          <Pressable
            style={styles.yearPickerBtn}
            onPress={() => setYearPickerVisible(true)}
          >
            <Ionicons name="calendar-outline" size={14} color={THEME.textSec} />
            <Text style={styles.yearPickerBtnText}>{t("changeYear")}</Text>
          </Pressable>
        </View>

        {yearStats ? (
          <View style={styles.card}>
            {/* 2x3 Symmetrisk grid */}
            <View style={styles.statsGridSymmetric}>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{yearStats.trips}</Text>
                <Text style={styles.statCellLabel}>{t("trips")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{yearStats.total_fish}</Text>
                <Text style={styles.statCellLabel}>{t("fish")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{yearStats.fangstrate}%</Text>
                <Text style={styles.statCellLabel}>{t("catchRate")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{yearStats.catch_trips}</Text>
                <Text style={styles.statCellLabel}>{t("catchTrips")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{yearStats.null_trips}</Text>
                <Text style={styles.statCellLabel}>{t("nullTrips")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>
                  {(yearStats.total_sec / 3600).toFixed(0)}
                </Text>
                <Text style={styles.statCellLabel}>{t("hoursLabel")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>
                  {(yearStats.total_m / 1000).toFixed(1)}
                </Text>
                <Text style={styles.statCellLabel}>{t("kmFished")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>
                  {yearStats.fish_per_hour ?? "0"}
                </Text>
                <Text style={styles.statCellLabel}>{t("fishPerHour")}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>
                  {yearStats.multi_fish_rate ?? "0"}%
                </Text>
                <Text style={styles.statCellLabel}>{t("multiFish")}</Text>
              </View>
            </View>

            {/* Fiskemønster */}
            <View style={styles.fishPatternCard}>
              <View style={styles.fishPatternHeader}>
                <Text style={styles.fishPatternTitle}>{t("fishingPattern")}</Text>
                <Pressable
                  style={styles.seasonBtn}
                  onPress={() => setSeasonPickerVisible(true)}
                >
                  <Text style={styles.seasonBtnText}>
                    {getSeasonLabel(selectedSeasonKey)}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={THEME.textSec} />
                </Pressable>
              </View>
              <View style={{ marginTop: 10 }}>
                {renderFishPattern(yearWeatherSummary)}
              </View>
            </View>

            {/* Mine Spots knap */}
            <Pressable
              style={styles.spotsButton}
              onPress={() => {
                loadSpotsWithVisits();
                setSpotsModalVisible(true);
              }}
            >
              <Ionicons name="location" size={18} color={THEME.graphYellow} />
              <Text style={styles.spotsButtonTitle}>{t("myFishingSpots")}</Text>
              <Ionicons name="chevron-forward" size={16} color={THEME.textTertiary} />
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: THEME.textSec, marginBottom: 16 }}>
            {t("noData")}
          </Text>
        )}

        {/* === GRAF (BARS) === */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="bar-chart-outline" size={16} color={THEME.textSec} />
              <Text style={styles.cardTitle}>{t("monthlyOverview")}</Text>
            </View>
          </View>
          <TripGraph label="Årsfangster" unit="" data={yearGraphData} />
        </View>

        {/* === ALL-TIME === */}
        <Pressable
          style={[styles.expandableCard, { marginTop: 24 }]}
          onPress={() => setShowAll(!showAll)}
        >
          <View style={styles.expandableHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy-outline" size={18} color={THEME.graphYellow} />
              <Text style={styles.cardTitle}>All-Time</Text>
            </View>
            <Ionicons
              name={showAll ? "chevron-up" : "chevron-down"}
              size={20}
              color={THEME.textTertiary}
            />
          </View>

          {showAll && allStats && (
            <View style={{ marginTop: 16 }}>
              {/* 2x3 Symmetrisk grid */}
              <View style={styles.statsGridSymmetric}>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{allStats.trips}</Text>
                  <Text style={styles.statCellLabel}>{t("trips")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{allStats.total_fish}</Text>
                  <Text style={styles.statCellLabel}>{t("fish")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{allStats.fangstrate}%</Text>
                  <Text style={styles.statCellLabel}>{t("catchRate")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{allStats.catch_trips}</Text>
                  <Text style={styles.statCellLabel}>{t("catchTrips")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{allStats.null_trips}</Text>
                  <Text style={styles.statCellLabel}>{t("nullTrips")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>
                    {(allStats.total_sec / 3600).toFixed(0)}
                  </Text>
                  <Text style={styles.statCellLabel}>{t("hoursLabel")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>
                    {(allStats.total_m / 1000).toFixed(0)}
                  </Text>
                  <Text style={styles.statCellLabel}>{t("kmFished")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>
                    {allStats.fish_per_hour ?? "0"}
                  </Text>
                  <Text style={styles.statCellLabel}>{t("fishPerHour")}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>
                    {allStats.multi_fish_rate ?? "0"}%
                  </Text>
                  <Text style={styles.statCellLabel}>{t("multiFish")}</Text>
                </View>
              </View>

              {/* Graf */}
              <View style={styles.allTimeGraphSection}>
                <Text style={styles.allTimeGraphTitle}>{t("catchesPerYear")}</Text>
                <TripGraph label="All-time" unit="" data={allTimeGraphData} />
              </View>

              {/* Fiskemønster */}
              <View style={styles.fishPatternCard}>
                <View style={styles.fishPatternHeader}>
                  <Text style={styles.fishPatternTitle}>{t("fishingPattern")}</Text>
                  <Pressable
                    style={styles.seasonBtn}
                    onPress={() => setSeasonPickerVisible(true)}
                  >
                    <Text style={styles.seasonBtnText}>
                      {getSeasonLabel(selectedSeasonKey)}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={THEME.textSec} />
                  </Pressable>
                </View>
                <View style={{ marginTop: 10 }}>
                  {renderFishPattern(allTimeWeatherSummary)}
                </View>
              </View>
            </View>
          )}
        </Pressable>

        {/* === SENESTE TURE === */}
        <View
          style={[styles.sectionHeader, { marginTop: 24, paddingRight: 8 }]}
        >
          <Text style={styles.sectionTitle}>{t("recentTrips")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginLeft: 8 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {filterOptions.map((option) => (
              <Pressable
                key={option.days}
                onPress={() => setDaysFilter(option.days)}
                style={[
                  styles.filterChip,
                  daysFilter === option.days &&
                    styles.filterChipActive,
                ]}
              >
                <Text
                  style={
                    daysFilter === option.days
                      ? styles.filterChipTextActive
                      : styles.filterChipText
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* === ÅRSVÆLGER MODAL === */}
        <Modal
          visible={yearPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setYearPickerVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>{t("selectYear")}</Text>
                <Pressable
                  onPress={() => setYearPickerVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={20} color={THEME.text} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {years
                  .sort((a, b) => b - a)
                  .map((y) => {
                    const active = y === year;
                    return (
                      <Pressable
                        key={y}
                        style={[
                          styles.seasonRow,
                          active && styles.seasonRowActive,
                        ]}
                        onPress={() => {
                          setYearPickerVisible(false);
                          refreshYearsAndStats(y, selectedSeasonKey);
                        }}
                      >
                        <View
                          style={[
                            styles.seasonRadio,
                            active && styles.seasonRadioActive,
                          ]}
                        />
                        <Text
                          style={
                            active
                              ? styles.seasonRowTextActive
                              : styles.seasonRowText
                          }
                        >
                          {y}
                        </Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <View style={{ gap: 12 }}>
          {recent.map((tripItem) => (
            <Link key={tripItem.id} href={`/trips/${tripItem.id}`} asChild>
              <Pressable style={styles.tripCard}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                  }}
                >
                  <View style={styles.tripIcon}>
                    <Ionicons
                      name="location"
                      size={20}
                      color={THEME.primary}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TripTitle trip={tripItem} t={t} />
                    <Text style={styles.tripSub} numberOfLines={1} ellipsizeMode="tail">
                      {(tripItem.distance_m / 1000).toFixed(2)} km •{" "}
                      {fmtTime(tripItem.duration_sec)}
                    </Text>
                    <View style={[styles.tripBadge, { marginTop: 8 }]}>
                      {tripItem.fish_count > 0 ? (
                        <>
                          <Ionicons
                            name="fish"
                            size={14}
                            color={THEME.bg}
                          />
                          <Text
                            style={[styles.tripBadgeText, { color: THEME.bg }]}
                          >
                            {tripItem.fish_count}
                          </Text>
                        </>
                      ) : (
                        <Text
                          style={[styles.tripBadgeText, { color: "#000" }]}
                        >
                          {t("noFish")}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            </Link>
          ))}
          {!recent.length && (
            <Text
              style={{
                color: THEME.textSec,
                fontStyle: "italic",
                marginTop: 10,
              }}
            >
              {t("noTripsFound")}
            </Text>
          )}
        </View>

        {/* === TUR FÆRDIG MODAL – GRID/TIMELINE-EDITOR === */}
        <Modal visible={fishModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.endTripModal}>
              {/* Header med ikon og tæller */}
              <View style={styles.endTripHeader}>
                <View style={styles.endTripTitleRow}>
                  <Ionicons name="flag" size={24} color={THEME.graphYellow} />
                  <Text style={styles.endTripTitle}>{t("finishTrip")}</Text>
                </View>
                <View style={styles.endTripCountBadge}>
                  <Text style={styles.endTripCountText}>{catchMarks.length}</Text>
                </View>
              </View>

              {/* Tidsvælger */}
              <View style={styles.endTripTimeSelector}>
                <View style={styles.endTripTimeCurrent}>
                  <Text style={styles.endTripTimeCurrentLabel}>{t("selectedTime")}</Text>
                  <Text style={styles.endTripTimeCurrentValue}>
                    {effectiveCursorMs
                      ? new Date(effectiveCursorMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Timeline */}
              <View style={styles.endTripTimelineContainer}>
                <View
                  style={[styles.endTripTimelineBar, { width: timelineWidth }]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleTimelineTouch}
                  onResponderMove={handleTimelineTouch}
                >
                  {/* Gradient baggrund */}
                  <View style={styles.endTripTimelineGradient} />

                  {/* cursor-position */}
                  {effectiveCursorMs != null &&
                    tripStartMs != null &&
                    tripEndMs != null &&
                    (() => {
                      const rel = (effectiveCursorMs - tripStartMs) / durationMs;
                      const clamped = Math.min(1, Math.max(0, rel));
                      const usableWidth = timelineWidth - 24;
                      const left = 12 + clamped * usableWidth;
                      return (
                        <View style={[styles.endTripCursor, { left }]}>
                          <View style={styles.endTripCursorLine} />
                          <View style={styles.endTripCursorDot} />
                        </View>
                      );
                    })()}

                  {/* markører */}
                  {catchMarks.map((t, idx) => {
                    if (tripStartMs == null || tripEndMs == null) return null;
                    const rel = (t - tripStartMs) / durationMs;
                    const clamped = Math.min(1, Math.max(0, rel));
                    const usableWidth = timelineWidth - 24;
                    const left = 12 + clamped * usableWidth;
                    const isSelected = selectedCatchIndex === idx;

                    const label = new Date(t).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <Pressable
                        key={`${t}-${idx}`}
                        style={[styles.endTripMarker, { left }]}
                        onPress={() => {
                          setSelectedCatchIndex(idx);
                          setCursorMs(t);
                        }}
                      >
                        <View
                          style={[
                            styles.endTripMarkerPill,
                            isSelected && styles.endTripMarkerPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.endTripMarkerText,
                              isSelected && styles.endTripMarkerTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                        <View style={styles.endTripMarkerStem} />
                        <View
                          style={[
                            styles.endTripMarkerDot,
                            isSelected && styles.endTripMarkerDotActive,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Tidsakse */}
                <View style={styles.endTripTimeAxis}>
                  <Text style={styles.endTripTimeAxisText}>
                    {tripStartMs
                      ? new Date(tripStartMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                  <Text style={styles.endTripTimeAxisText}>
                    {tripEndMs
                      ? new Date(tripEndMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.endTripActions}>
                <Pressable style={styles.endTripAddBtn} onPress={addCatchAtCursor}>
                  <Ionicons name="add" size={20} color="#000" />
                  <Text style={styles.endTripAddBtnText}>{t("addCatch")}</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.endTripDeleteBtn,
                    selectedCatchIndex == null && styles.endTripDeleteBtnDisabled,
                  ]}
                  disabled={selectedCatchIndex == null}
                  onPress={removeSelectedCatch}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={selectedCatchIndex == null ? THEME.textSec : THEME.danger}
                  />
                  <Text
                    style={[
                      styles.endTripDeleteBtnText,
                      selectedCatchIndex == null && styles.endTripDeleteBtnTextDisabled,
                    ]}
                  >
                    {t("deleteSelected")}
                  </Text>
                </Pressable>
              </View>

              {/* Hint tekst */}
              <Text style={styles.endTripHint}>
                {t("timelineHint")}
              </Text>

              {/* Footer buttons */}
              <View style={styles.endTripFooter}>
                <Pressable
                  style={styles.endTripCancelBtn}
                  onPress={() => {
                    setFishModal(false);
                    setCancelConfirmVisible(true);
                  }}
                >
                  <Text style={styles.endTripCancelBtnText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable style={styles.endTripSaveBtn} onPress={confirmFish}>
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={styles.endTripSaveBtnText}>{t("saveTrip")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === STOP-BEKRÆFTELSE (før vi åbner afslut modal) === */}
        <Modal
          visible={stopConfirmVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{t("finishTripQuestion")}</Text>
              <Text style={styles.modalText}>
                {t("stopTrackingConfirm")}
              </Text>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => setStopConfirmVisible(false)}
                >
                  <Text style={styles.ghostText}>{t("continueTrip")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.stopButton]}
                  onPress={() => {
                    setStopConfirmVisible(false);
                    stop();
                  }}
                >
                  <Text style={styles.stopButtonText}>{t("yesStop")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === ÅRSTIDSVÆLGER === */}
        <Modal visible={seasonPickerVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{t("selectSeason")}</Text>
              <View style={{ gap: 10, marginTop: 6 }}>
                {seasonOptions.map((opt) => {
                  const active = opt.key === selectedSeasonKey;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[
                        styles.seasonRow,
                        active && styles.seasonRowActive,
                      ]}
                      onPress={() => {
                        setSelectedSeasonKey(opt.key);
                        setSeasonPickerVisible(false);
                      }}
                    >
                      <View
                        style={[
                          styles.seasonRadio,
                          active && styles.seasonRadioActive,
                        ]}
                      />
                      <Text
                        style={
                          active
                            ? styles.seasonRowTextActive
                            : styles.seasonRowText
                        }
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => setSeasonPickerVisible(false)}
                >
                  <Text style={styles.ghostText}>Luk</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === ANNULLÉR-TUR BEKRÆFTELSESMODAL === */}
        <Modal
          visible={cancelConfirmVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Annullér tur</Text>
              <Text style={styles.modalText}>
                Er du sikker på at du vil annullere turen?
              </Text>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => {
                    setCancelConfirmVisible(false);
                    setFishModal(true);
                  }}
                >
                  <Text style={styles.ghostText}>Tilbage</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.stopButton]}
                  onPress={() => {
                    setCancelConfirmVisible(false);
                    cancelFish();
                  }}
                >
                  <Text style={styles.stopButtonText}>
                    Ja, annullér
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === GPS-TILLADELSE MODAL === */}
        <Modal
          visible={permissionModalVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Adgang nægtet</Text>
              <Text style={styles.modalText}>
                Appen skal bruge din position for at tracke en tur. Gå
                til dine indstillinger for at give adgang.
              </Text>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.btn, styles.primary]}
                  onPress={() => setPermissionModalVisible(false)}
                >
                  <Text style={styles.primaryText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === MINE SPOTS MODAL === */}
        <Modal
          visible={spotsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSpotsModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { maxHeight: "80%" }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Mine Fiskepladser</Text>
                <Pressable
                  onPress={() => setSpotsModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={20} color={THEME.text} />
                </Pressable>
              </View>

              {loadingSpots ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color={THEME.graphYellow} />
                  <Text style={{ color: THEME.textSec, marginTop: 12 }}>
                    Henter spots...
                  </Text>
                </View>
              ) : spotsWithVisits.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons
                    name="location-outline"
                    size={48}
                    color={THEME.textSec}
                  />
                  <Text
                    style={{
                      color: THEME.textSec,
                      marginTop: 12,
                      textAlign: "center",
                    }}
                  >
                    Du har ikke oprettet nogen fiskepladser endnu.{"\n"}
                    Gå til Spot & Vejr for at tilføje spots.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 400 }}
                  showsVerticalScrollIndicator={false}
                >
                  {spotsWithVisits.map((spot, idx) => (
                    <View
                      key={spot.id}
                      style={[
                        styles.spotListItem,
                        idx === spotsWithVisits.length - 1 && {
                          borderBottomWidth: 0,
                        },
                      ]}
                    >
                      <View style={styles.spotListIcon}>
                        <Ionicons
                          name="location"
                          size={18}
                          color={THEME.graphYellow}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.spotListName}>{spot.name}</Text>
                        {spot.notes ? (
                          <Text
                            style={styles.spotListNotes}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {spot.notes}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.spotListStats}>
                        <View style={styles.spotStatBadge}>
                          <Ionicons
                            name="navigate-outline"
                            size={12}
                            color={THEME.text}
                          />
                          <Text style={styles.spotStatText}>
                            {spot.visitCount}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.spotStatBadge,
                            { backgroundColor: THEME.graphYellow },
                          ]}
                        >
                          <Ionicons
                            name="fish-outline"
                            size={12}
                            color={THEME.bg}
                          />
                          <Text
                            style={[styles.spotStatText, { color: THEME.bg }]}
                          >
                            {spot.fishCount}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}

            </View>
          </View>
        </Modal>
      </ScrollView>

      {/* Loading overlay - udenfor ScrollView så den dækker hele skærmen */}
      {savingTrip && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.savingText}>{t("savingTrip")}</Text>
        </View>
      )}
    </>
  );
}

// --- KOMPONENTER ---

function StatBox({
  label,
  value,
  icon,
  color,
  accent,
}: {
  label: string;
  value: string;
  icon: any;
  color?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statBox, accent && styles.statBoxAccent]}>
      <View style={styles.statIconWrap}>
        <Ionicons
          name={icon}
          size={16}
          color={accent ? THEME.graphYellow : THEME.textTertiary}
        />
      </View>
      <Text
        style={[
          styles.statValue,
          color ? { color } : {},
          accent && { color: THEME.graphYellow },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// --- BAR GRAPH ---
function TripGraph({
  data,
  label,
  unit,
}: {
  data: GraphPoint[];
  label: string;
  unit?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <Text style={{ color: THEME.textSec, marginTop: 6 }}>
        Ingen data.
      </Text>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);

  if (max === 0 && min === 0) {
    return (
      <Text
        style={{
          color: THEME.textSec,
          marginTop: 6,
          fontStyle: "italic",
        }}
      >
        Ingen fangster i denne periode.
      </Text>
    );
  }

  const span = max - min || 1;
  const maxValStr = `${max}${unit ?? ""}`;
  const minValStr = `${min}${unit ?? ""}`;

  const ticks = [0.25, 0.5, 0.75, 1];
  const firstLabel = data[0]?.label ?? "";
  const lastLabel = data[data.length - 1]?.label ?? "";

  return (
    <View
      style={{ marginTop: 10, marginBottom: 8, paddingHorizontal: 4 }}
    >
      <View style={styles.graphContainer}>
        <Text style={[styles.graphLabel, { top: 0 }]}>
          {maxValStr}
        </Text>

        <View style={styles.graphGrid}>
          {ticks.map((t) => (
            <View
              key={t}
              style={[
                styles.graphGridLine,
                { bottom: `${t * 100}%`, opacity: t === 1 ? 0.2 : 0.08 },
              ]}
            />
          ))}
        </View>

        <View style={styles.sparkWrap}>
          {data.map((item, i) => {
            const rel = (item.value - min) / span;
            const barH = 10 + rel * 90;
            const isMax = item.value === max;
            const showValue = data.length <= 12 && rel > 0.45;

            return (
              <View
                key={`${item.label}-${i}`}
                style={styles.sparkBarWrapper}
              >
                {showValue && (
                  <Text style={styles.sparkValue}>{item.value}</Text>
                )}
                <View
                  style={[
                    styles.sparkBar,
                    {
                      height: barH,
                      backgroundColor: THEME.graphYellow,
                      opacity: isMax ? 1 : 0.75,
                    },
                  ]}
                />
                <Text style={styles.sparkLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.graphLabel, { bottom: 0 }]}>
          {minValStr}
        </Text>
      </View>

      <View style={styles.graphTimeRow}>
        <Text style={styles.graphTimeText}>{firstLabel}</Text>
        <Text style={styles.graphTimeText}>{lastLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  statusIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusIndicatorActive: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.danger,
  },
  statusDotActive: {
    backgroundColor: THEME.startGreen,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.startGreen,
  },
  activeBadgeText: {
    color: THEME.startGreen,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  mapContainer: {
    height: 180,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#18181B",
    position: "relative",
  },
  mapOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  overlayStatBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlayLabel: {
    color: THEME.textSec,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  overlayValue: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  heroActions: {
    marginTop: 16,
  },
  startButton: {
    backgroundColor: THEME.startGreen,
    borderRadius: 20,
    padding: 6,
    shadowColor: THEME.startGreen,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  startButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  startIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  startTextContainer: {
    flex: 1,
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  startButtonSubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },

  runningActions: {
    flexDirection: "row",
    gap: 12,
  },
  catchButtonLarge: {
    flex: 1,
    backgroundColor: THEME.graphYellow,
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: THEME.graphYellow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  catchIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  catchButtonLargeText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "800",
  },
  stopButtonNew: {
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stopButtonNewText: {
    color: THEME.danger,
    fontSize: 15,
    fontWeight: "700",
  },

  catchButton: {
    backgroundColor: THEME.startGreen,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  catchButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },

  stopButton: {
    backgroundColor: THEME.danger,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stopButtonSmall: {
    backgroundColor: THEME.danger,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stopButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
  savingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 16,
    zIndex: 9999,
  },
  savingText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  statsGridSymmetric: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    width: "33.33%",
    alignItems: "center",
    paddingVertical: 14,
  },
  statCellValue: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  statCellLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "23%",
    backgroundColor: "transparent",
    alignItems: "center",
    paddingVertical: 12,
  },
  statBoxAccent: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 12,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 14,
  },
  statValue: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  expandableCard: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  expandableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: THEME.text,
    letterSpacing: -0.3,
  },
  statsHighlight: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 16,
  },
  statsHighlightItem: {
    alignItems: "center",
    flex: 1,
  },
  statsHighlightValue: {
    fontSize: 28,
    fontWeight: "700",
    color: THEME.text,
    letterSpacing: -1,
  },
  statsHighlightLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textTertiary,
    marginTop: 4,
  },
  statsHighlightDivider: {
    width: 1,
    height: 40,
    backgroundColor: THEME.cardBorder,
  },
  allTimeGraphSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  allTimeGraphTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSec,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  fishPatternCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  fishPatternTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fishPatternSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textTertiary,
  },
  fishPatternHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fishPatternItem: {
    fontSize: 14,
    color: THEME.text,
    marginTop: 4,
  },
  fishPatternChipWrap: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  fishPatternChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1f1f23",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#2b2b32",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
    width: "100%",
  },
  fishPatternChipText: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
    flex: 1,
  },

  tripCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  tripTitleRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  tripLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    width: "100%",
  },
  tripDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    marginTop: 6,
  },
  tripSpot: {
    flex: 1,
    minWidth: 0,
    color: THEME.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "left",
  },
  tripDate: {
    color: THEME.textSec,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 0,
  },
  tripSub: {
    color: THEME.textSec,
    fontSize: 13,
    marginTop: 2,
  },
  tripBadge: {
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  tripBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 30,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  chipActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  chipText: { color: THEME.text, fontWeight: "600" },
  chipActiveText: { color: "#000", fontWeight: "700" },

  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  filterChipActive: {
    backgroundColor: THEME.graphYellow,
  },
  filterChipText: { color: THEME.textSec, fontSize: 12 },
  filterChipTextActive: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
  chipFuture: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "#2d2d33",
    opacity: 0.5,
  },
  chipFutureText: {
    color: "#888",
    fontWeight: "600",
  },

  label: { color: THEME.textSec, fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  // lidt højere til timeline-UI
  modalBoxTall: {
    width: "100%",
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    color: THEME.text,
  },
  modalText: {
    color: "#CCC",
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26262A",
  },
  btn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    flex: 1,
  },
  primary: { backgroundColor: THEME.primary },
  primaryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  ghost: { backgroundColor: "#333" },
  ghostText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  graphContainer: {
    position: "relative",
    height: 160,
    marginBottom: 16,
  },
  graphLabel: {
    position: "absolute",
    left: 0,
    fontSize: 12,
    color: THEME.textSec,
    fontWeight: "500",
    backgroundColor: "transparent",
    paddingRight: 4,
  },
  graphTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    marginTop: -4,
  },
  graphTimeText: {
    fontSize: 11,
    color: THEME.textSec,
  },
  graphGrid: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 20,
  },
  graphGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#ffffff30",
  },

  sparkWrap: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 20,
  },
  sparkBarWrapper: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "flex-end",
    height: "100%",
  },
  sparkBar: {
    width: 10,
    borderRadius: 6,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sparkLabel: {
    fontSize: 10,
    color: THEME.textSec,
    marginTop: 4,
    position: "absolute",
    bottom: -18,
  },
  sparkValue: {
    color: THEME.text,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#ffffff20",
    borderRadius: 8,
    marginBottom: 6,
  },

  // timeline-UI
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  timelineLabel: {
    color: THEME.textSec,
    fontSize: 11,
    fontWeight: "600",
  },
  timelineTime: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
  },
  timelineTimeBig: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "800",
  },
  timelineWrapper: {
    marginTop: 4,
    marginBottom: 8,
    alignItems: "center",
  },
  timelineBar: {
    height: 120,
    borderRadius: 12,
    backgroundColor: "#26262A",
    justifyContent: "center",
    paddingHorizontal: 0,
    overflow: "hidden",
    position: "relative",
  },
  timelineGridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#3A3A40",
  },
  timelineGridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#3A3A40",
  },
  timelineCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: THEME.graphYellow,
    opacity: 0.8,
  },
  timelineMarker: {
    position: "absolute",
    bottom: 14,
    alignItems: "center",
  },
  timelineMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.startGreen,
  },
  timelineMarkerDotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: THEME.startGreen,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  timelineMarkerLabelWrap: {
    marginBottom: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#00000080",
  },
  timelineMarkerLabelWrapActive: {
    backgroundColor: "#22C55E",
  },
  timelineMarkerLabel: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },
  timelineControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  addCatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1F2933",
  },
  addCatchBtnText: {
    color: THEME.startGreen,
    fontSize: 12,
    fontWeight: "700",
  },
  deleteCatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#3A1E21",
  },
  deleteCatchBtnText: {
    color: THEME.danger,
    fontSize: 12,
    fontWeight: "700",
  },

  // NY AFSLUT TUR MODAL
  endTripModal: {
    width: "100%",
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  endTripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  endTripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  endTripTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  endTripCountBadge: {
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  endTripCountText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  endTripTimeSelector: {
    alignItems: "center",
    marginBottom: 16,
  },
  endTripTimeCurrent: {
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  endTripTimeCurrentLabel: {
    fontSize: 11,
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  endTripTimeCurrentValue: {
    fontSize: 32,
    fontWeight: "700",
    color: THEME.graphYellow,
    letterSpacing: -1,
  },
  endTripTimelineContainer: {
    marginBottom: 16,
  },
  endTripTimelineBar: {
    height: 140,
    borderRadius: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "visible",
    position: "relative",
  },
  endTripTimelineGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  endTripCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 5,
  },
  endTripCursorLine: {
    position: "absolute",
    top: 0,
    bottom: 20,
    width: 2,
    backgroundColor: THEME.graphYellow,
    borderRadius: 1,
  },
  endTripCursorDot: {
    position: "absolute",
    bottom: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: THEME.graphYellow,
    borderWidth: 3,
    borderColor: THEME.card,
  },
  endTripMarker: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
    zIndex: 10,
  },
  endTripMarkerPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    marginBottom: 4,
  },
  endTripMarkerPillActive: {
    backgroundColor: THEME.startGreen,
  },
  endTripMarkerText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.startGreen,
  },
  endTripMarkerTextActive: {
    color: "#000",
  },
  endTripMarkerStem: {
    width: 2,
    height: 60,
    backgroundColor: THEME.startGreen,
    opacity: 0.5,
  },
  endTripMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: THEME.startGreen,
    marginTop: -1,
  },
  endTripMarkerDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },
  endTripTimeAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 8,
  },
  endTripTimeAxisText: {
    fontSize: 12,
    color: THEME.textSec,
  },
  endTripActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  endTripAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.graphYellow,
    paddingVertical: 14,
    borderRadius: 14,
  },
  endTripAddBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  endTripDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  endTripDeleteBtnDisabled: {
    backgroundColor: THEME.inputBg,
  },
  endTripDeleteBtnText: {
    color: THEME.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  endTripDeleteBtnTextDisabled: {
    color: THEME.textSec,
  },
  endTripHint: {
    fontSize: 13,
    color: THEME.textSec,
    textAlign: "center",
    marginBottom: 16,
  },
  endTripFooter: {
    flexDirection: "row",
    gap: 12,
  },
  endTripCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  endTripCancelBtnText: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  endTripSaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.startGreen,
  },
  endTripSaveBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },

  toastOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 20,
  },
  toastBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1720",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: THEME.startGreen,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: THEME.startGreen,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  toastText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "700",
  },
  seasonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  seasonBtnText: {
    color: THEME.textSec,
    fontSize: 12,
    fontWeight: "600",
  },
  seasonBtnSub: {
    display: "none",
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#151515",
  },
  seasonRowActive: {
    borderColor: THEME.graphYellow,
    backgroundColor: "#1E1E12",
  },
  seasonRowText: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  seasonRowTextActive: {
    color: THEME.graphYellow,
    fontSize: 15,
    fontWeight: "700",
  },
  seasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#555",
    marginRight: 10,
  },
  seasonRadioActive: {
    borderColor: THEME.graphYellow,
    backgroundColor: THEME.graphYellow,
  },
  yearPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  yearPickerBtnText: {
    color: THEME.textSec,
    fontSize: 13,
    fontWeight: "600",
  },
  yearPill: {
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  yearPillText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 13,
  },

  // === SPOTS BUTTON & MODAL ===
  spotsButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotsButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  spotsButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotsButtonTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSec,
  },
  spotsButtonSubtitle: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 2,
  },
  spotListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorder,
    gap: 12,
  },
  spotListIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotListName: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.text,
  },
  spotListNotes: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 2,
  },
  spotListStats: {
    flexDirection: "row",
    gap: 8,
  },
  spotStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.card,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotStatText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.text,
  },
});





