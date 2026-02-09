import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, signOut } from "../../lib/firebase";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { statsTrips, listTrips } from "../../lib/trips";
import { listSpots } from "../../lib/spots";
import { getUserCollectionRef } from "../../lib/firestore";
import { getDocs, deleteDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SunCalc from "suncalc";
import { useLanguage, Language } from "../../lib/i18n";

// --- TEMA ---
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  border: "#333333",
  primary: "#F59E0B",
  accent: "#F59E0B",
  danger: "#FF453A",
  success: "#22C55E",
  inputBg: "#2C2C2E",
};

// ============================================================================
// Fiskemønster helper-typer og funktioner (samme logik som Track)
// ============================================================================

type SimpleBucket = {
  trips: number; // antal fangst-events
  fish: number; // antal fisk
};

type BestBucket = {
  label: string;
  trips: number;
};

type PatternItem = {
  label: string;
  fish: number;
  share: number;
};

type PatternGroup = {
  title: string;
  items: PatternItem[];
};

type PatternReport = {
  lines: string[];
  groups: PatternGroup[];
};

type PatternStats = {
  totalFish: number;
  tideStats: Record<string, SimpleBucket>;
  seasonStats: Record<string, SimpleBucket>;
  todStats: Record<string, SimpleBucket>;
  airTempStats: Record<string, SimpleBucket>;
  waterTempStats: Record<string, SimpleBucket>;
  coastWindStats: Record<string, SimpleBucket>;
  windSpeedStats: Record<string, SimpleBucket>;
  durationStats: Record<string, SimpleBucket>;
  movementStats: Record<string, SimpleBucket>;
  spotStats: Record<string, SimpleBucket>;
  windDirStats: Record<string, SimpleBucket>;
};

function waterLevelBucket(cm?: number | null): string {
  if (cm == null || !Number.isFinite(cm)) return "ukendt";
  if (cm < -20) return "Lavvande";
  if (cm > 20) return "Højvande";
  return "Middel vandstand";
}

function seasonFromMonth(month: number): string {
  if (month >= 2 && month <= 4) return "Foråret";
  if (month >= 5 && month <= 7) return "Sommeren";
  if (month >= 8 && month <= 10) return "Efteråret";
  return "Vinteren";
}

function timeOfDayBucket(h: number): string {
  if (h >= 5 && h < 9) return "Morgenen";
  if (h >= 9 && h < 12) return "Formiddagen";
  if (h >= 12 && h < 17) return "Eftermiddagen";
  if (h >= 17 && h < 22) return "Aftenen";
  return "Natten";
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

function tempBucketLabel(t?: number | null): string {
  if (t == null || !Number.isFinite(t)) return "ukendt";
  const band = TEMP_BANDS.find((b) => t >= b.min && t < b.max);
  return band ? band.label : "ukendt";
}

function windSpeedBucketLabel(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "ukendt";
  if (ms < 4) return "svag vind";
  if (ms < 8) return "mild vind";
  if (ms < 12) return "frisk vind";
  return "hård vind";
}

function coastWindLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();

  if (v.includes("fraland")) return "fralandsvind";
  if (v.includes("påland") || v.includes("på-land")) return "pålandsvind";
  if (v.includes("side") || v.includes("langs") || v.includes("tvaers"))
    return "sidevind";
  if (v.includes("offshore")) return "fralandsvind";
  if (v.includes("onshore")) return "pålandsvind";

  if (v === "ukendt") return null;
  return raw;
}

// Vindretning fra grader -> Nord / Nordøst / ... / Nordvest
function windDirLabelFromDeg(deg: number): string {
  const d = ((deg % 360) + 360) % 360;

  if (d >= 337.5 || d < 22.5) return "Nord";
  if (d >= 22.5 && d < 67.5) return "Nordøst";
  if (d >= 67.5 && d < 112.5) return "Øst";
  if (d >= 112.5 && d < 157.5) return "Sydøst";
  if (d >= 157.5 && d < 202.5) return "Syd";
  if (d >= 202.5 && d < 247.5) return "Sydvest";
  if (d >= 247.5 && d < 292.5) return "Vest";
  return "Nordvest";
}

// Vælger bøtten med flest fisk (ikke fisk pr. tur)
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

function durationBucketLabel(durationSec?: number | null): string | null {
  if (!Number.isFinite(durationSec ?? null)) return null;
  const hrs = (durationSec as number) / 3600;
  if (hrs < 2) return "<2 timer";
  if (hrs < 4) return "2-4 timer";
  if (hrs < 6) return "4-6 timer";
  return "6+ timer";
}

function movementLabel(
  distanceM?: number | null,
  durationSec?: number | null
): string | null {
  if (
    !Number.isFinite(distanceM ?? null) ||
    !Number.isFinite(durationSec ?? null)
  )
    return null;
  const dist = distanceM as number;
  const dur = durationSec as number;
  if (dur <= 0) return null;
  const speed = dist / dur;
  if (dist <= 300) return "Stillestående/let bevægelse";
  if (dist >= 1500 || speed >= 0.35) return "Affiskning af vand";
  return "Roligt tempo";
}

function buildBucketItems(
  stats: Record<string, SimpleBucket>,
  totalFish: number,
  minTrips: number,
  limit?: number
): PatternItem[] {
  const entries = Object.entries(stats).map(([label, s]) => ({
    label,
    fish: s.fish,
    trips: s.trips,
  }));

  if (!entries.length || totalFish <= 0) return [];

  let list = entries;
  const filtered = entries.filter((e) => e.trips >= minTrips);
  if (filtered.length) list = filtered;

  let cleaned = list.filter((e) => e.label !== "ukendt");
  if (!cleaned.length) cleaned = list;

  cleaned.sort((a, b) => b.fish - a.fish || a.label.localeCompare(b.label));

  if (limit && cleaned.length > limit) {
    cleaned = cleaned.slice(0, limit);
  }

  return cleaned.map((e) => ({
    label: e.label,
    fish: e.fish,
    share: totalFish > 0 ? Math.round((e.fish / totalFish) * 100) : 0,
  }));
}

function buildPatternGroups(
  stats: PatternStats,
  minTrips: number
): PatternGroup[] {
  const groups: PatternGroup[] = [];
  const totalFish = stats.totalFish;

  const pushGroup = (
    title: string,
    bucket: Record<string, SimpleBucket>,
    limit?: number
  ) => {
    const items = buildBucketItems(bucket, totalFish, minTrips, limit);
    if (items.length) {
      groups.push({ title, items });
    }
  };

  pushGroup("Årstid", stats.seasonStats);
  pushGroup("Tid på dagen", stats.todStats);
  pushGroup("Vandstand", stats.tideStats);
  pushGroup("Havtemperatur", stats.waterTempStats);
  pushGroup("Lufttemperatur", stats.airTempStats);
  pushGroup("Vindstyrke", stats.windSpeedStats);
  pushGroup("Vindretning", stats.windDirStats);
  pushGroup("Vind ift. kyst", stats.coastWindStats);
  pushGroup("Turlængde", stats.durationStats);
  pushGroup("Bevægelse", stats.movementStats);

  const spotCount = Object.keys(stats.spotStats).length;
  const spotLimit = spotCount > 10 ? 10 : undefined;
  pushGroup("Spots med flest fisk", stats.spotStats, spotLimit);

  return groups;
}

// Fiskemønster – fish_events_json + spots + vindretning
function buildWeatherSummary(allTrips: any[]): PatternReport | null {
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
  const spotStats: Record<string, SimpleBucket> = {};
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

  const sunCache = new Map<
    string,
    { sunrise: number | null; sunset: number | null }
  >();

  const getSunTimes = (d: Date, loc: { lat: number; lng: number }) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${loc.lat.toFixed(
      3
    )}|${loc.lng.toFixed(3)}`;
    const cached = sunCache.get(key);
    if (cached) return cached;
    const times = SunCalc.getTimes(d, loc.lat, loc.lng);
    const value = {
      sunrise: times.sunrise?.getTime() ?? null,
      sunset: times.sunset?.getTime() ?? null,
    };
    sunCache.set(key, value);
    return value;
  };

  let totalFish = 0;

  for (const t of tripsWithFish) {
    const fishCount = t.fish_count ?? 0;

    let meta: any = {};
    let evaluation: any = null;

    try {
      meta = t.meta_json ? JSON.parse(t.meta_json) : {};
    } catch {
      meta = {};
    }

    evaluation =
      meta?.evaluation ||
      meta?.summary?.evaluation ||
      (meta && meta.source ? meta : null);

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

    const wl =
      evaluation?.waterLevelCM?.avg ??
      evaluation?.waterLevelCm?.avg ??
      null;
    const airT = evaluation?.airTempC?.avg ?? null;
    const waterT = evaluation?.waterTempC?.avg ?? null;
    const windMs = evaluation?.windMS?.avg ?? null;
    const cwRaw: string | null = evaluation?.coastWind?.category ?? null;
    const cw = coastWindLabel(cwRaw);

    const windDirDeg: number | null =
      (evaluation?.windDirDeg?.avg ??
        evaluation?.windDeg?.avg ??
        evaluation?.windFromDirDeg?.avg ??
        evaluation?.windFromDir?.avg ??
        null) ?? null;

    const windDirKey =
      windDirDeg != null && Number.isFinite(windDirDeg)
        ? windDirLabelFromDeg(windDirDeg)
        : null;

    const tideKey = waterLevelBucket(wl);
    const airKey = tempBucketLabel(airT);
    const waterKey = tempBucketLabel(waterT);
    const windSpeedKey = windSpeedBucketLabel(windMs);
    const durationLabel =
      durationBucketLabel(
        Number.isFinite(t.duration_sec)
          ? t.duration_sec
          : t.start_ts && t.end_ts
          ? Math.max(
              0,
              (new Date(t.end_ts).getTime() - new Date(t.start_ts).getTime()) /
                1000
            )
          : null
      ) ?? null;
    const moveLabel = movementLabel(t.distance_m, t.duration_sec);
    const tripLocation = getTripLocation(t);

    // fangst-tidsstempler
    let catchMs: number[] = [];

    if (t.fish_events_json) {
      try {
        const raw = JSON.parse(t.fish_events_json);
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
        // ignorer
      }
    }

    if (!catchMs.length && fishCount > 0 && t.start_ts) {
      const base = new Date(t.start_ts).getTime();
      for (let i = 0; i < fishCount; i++) {
        catchMs.push(base);
      }
    }

    if (!catchMs.length) continue;

    const spotName: string | null = t.spot_name ?? null;

    for (const ts of catchMs) {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;

      totalFish += 1;

      const month = d.getMonth();
      const hour = d.getHours();

      if (month != null && Number.isFinite(month)) {
        const seasonKey = seasonFromMonth(month);
        if (!seasonStats[seasonKey]) {
          seasonStats[seasonKey] = { trips: 0, fish: 0 };
        }
        seasonStats[seasonKey].trips += 1;
        seasonStats[seasonKey].fish += 1;
      }

      if (hour != null && Number.isFinite(hour)) {
        const todKey = timeOfDayBucket(hour);
        if (!todStats[todKey]) {
          todStats[todKey] = { trips: 0, fish: 0 };
        }
        todStats[todKey].trips += 1;
        todStats[todKey].fish += 1;
      }

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

      if (spotName) {
        if (!spotStats[spotName]) {
          spotStats[spotName] = { trips: 0, fish: 0 };
        }
        spotStats[spotName].trips += 1;
        spotStats[spotName].fish += 1;
      }

      if (windDirKey) {
        if (!windDirStats[windDirKey]) {
          windDirStats[windDirKey] = { trips: 0, fish: 0 };
        }
        windDirStats[windDirKey].trips += 1;
        windDirStats[windDirKey].fish += 1;
      }

      if (durationLabel) {
        if (!durationStats[durationLabel]) {
          durationStats[durationLabel] = { trips: 0, fish: 0 };
        }
        durationStats[durationLabel].trips += 1;
        durationStats[durationLabel].fish += 1;
      }

      if (moveLabel) {
        if (!movementStats[moveLabel]) {
          movementStats[moveLabel] = { trips: 0, fish: 0 };
        }
        movementStats[moveLabel].trips += 1;
        movementStats[moveLabel].fish += 1;
      }

      if (tripLocation) {
        try {
          const times = getSunTimes(d, tripLocation);
          const sunrise = times.sunrise ?? null;
          const sunset = times.sunset ?? null;
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

  if (totalFish <= 0) return null;

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
  const bestSpot = pickBestBucket(spotStats, MIN_TRIPS);
  const bestWindDir = pickBestBucket(windDirStats, MIN_TRIPS);

  const lines: string[] = [];

  if (bestSpot && bestSpot.label !== "ukendt") {
    lines.push(`Spot: ${bestSpot.label}`);
  }

  if (bestTide && bestTide.label !== "ukendt") {
    lines.push(bestTide.label);
  }

  if (bestWindSpeed && bestWindSpeed.label !== "ukendt") {
    const ws = bestWindSpeed.label;
    lines.push(
      ws.endsWith("vind") ? `${ws[0].toUpperCase()}${ws.slice(1)}styrke` : ws
    );
  }

  if (bestWindDir && bestWindDir.label !== "ukendt") {
    lines.push(`Vindretning: ${bestWindDir.label}`);
  }

  if (bestTod) {
    lines.push(`Om ${bestTod.label.toLowerCase()}`);
  }

  if (bestSeason) {
    lines.push(`Om ${bestSeason.label.toLowerCase()}`);
  }

  if (bestWater && bestWater.label !== "ukendt") {
    lines.push(`Havtemperatur: ${bestWater.label}`);
  }

  if (bestAir && bestAir.label !== "ukendt") {
    lines.push(`Lufttemperatur: ${bestAir.label}`);
  }

  if (bestCoastWind) {
    const key = bestCoastWind.label.toLowerCase();
    if (key.includes("fraland")) {
      lines.push("Ved fralandsvind");
    } else if (key.includes("påland") || key.includes("på-land")) {
      lines.push("Ved pålandsvind");
    } else if (key.includes("side") || key.includes("langs") || key.includes("tvaers")) {
      lines.push("Ved sidevind");
    } else {
      lines.push(`Vind ift. kyst: ${bestCoastWind.label}`);
    }
  }

  if (sunOffset.count > 0) {
    const avg = sunOffset.sumMinutes / sunOffset.count;
    const event =
      sunOffset.sunriseCount >= sunOffset.sunsetCount
        ? "solopgang"
        : "solnedgang";
    const dir = avg < 0 ? "før" : "efter";
    const minutes = Math.round(Math.abs(avg));
    lines.push(`Typisk ${minutes} min ${dir} ${event}`);
  }

  if (bestDuration) {
    lines.push(`Turlængde: ${bestDuration.label} giver flest fisk`);
  }

  if (bestMovement) {
    const mv = bestMovement.label.toLowerCase();
    if (mv.includes("affiskning")) {
      lines.push("Flest fisk ved affiskning af vand");
    } else if (mv.includes("still")) {
      lines.push("Flest fisk ved stillestående/rolig placering");
    } else {
      lines.push(`Flest fisk ved ${bestMovement.label.toLowerCase()}`);
    }
  }

  const forecastHints: string[] = [];
  if (bestWindSpeed && bestWindSpeed.label !== "ukendt") {
    forecastHints.push(bestWindSpeed.label);
  }
  if (bestTide && bestTide.label !== "ukendt") {
    forecastHints.push(bestTide.label);
  }
  if (bestWater && bestWater.label !== "ukendt") {
    forecastHints.push(`Havtemp ${bestWater.label}`);
  }
  if (forecastHints.length) {
    lines.push(
      `Prognose: kig efter ${forecastHints.slice(0, 3).join(", ")} for bedste match`
    );
  }

  const groups = buildPatternGroups(
    {
      totalFish,
      tideStats,
      seasonStats,
      todStats,
      airTempStats,
      waterTempStats,
      coastWindStats,
      windSpeedStats,
      durationStats,
      movementStats,
      spotStats,
      windDirStats,
    },
    MIN_TRIPS
  );

  if (!lines.length && !groups.length) return null;
  return { lines, groups };
}

// ---------------------------------------------------------------------------
// Spot-statistik til PDF (besøgte spots / bedste spots pr. tur)
// ---------------------------------------------------------------------------

type SpotAgg = {
  spotId: string;
  trips: number;
  fish: number;
};

type SpotSummary = {
  totalSpots: number;
  mostVisited: {
    name: string;
    trips: number;
    fish: number;
    avg: number;
  };
  bestCatch: {
    name: string;
    trips: number;
    fish: number;
    avg: number;
  };
};

function buildSpotSummary(
  trips: any[],
  spots: any[]
): SpotSummary | null {
  const agg: Record<string, SpotAgg> = {};

  for (const t of trips) {
    const rawId =
      t.spot_id ??
      t.spotId ??
      t.spotID ??
      null;

    if (rawId === null || rawId === undefined) continue;

    const id = String(rawId);

    if (!agg[id]) {
      agg[id] = { spotId: id, trips: 0, fish: 0 };
    }
    agg[id].trips += 1;
    agg[id].fish += t.fish_count ?? 0;
  }

  const list = Object.values(agg);
  if (!list.length) return null;

  const withMeta = list.map((s) => {
    const spot = spots.find((sp: any) => String(sp.id) === s.spotId);
    const name = spot?.name || `Spot #${s.spotId}`;
    const avg = s.fish / Math.max(s.trips, 1);
    return { ...s, name, avg };
  });

  const mostVisited = withMeta.reduce((a, b) =>
    b.trips > a.trips ? b : a
  );

  const bestCatch = withMeta.reduce((a, b) =>
    b.avg > a.avg ? b : a
  );

  return {
    totalSpots: withMeta.length,
    mostVisited: {
      name: mostVisited.name,
      trips: mostVisited.trips,
      fish: mostVisited.fish,
      avg: mostVisited.avg,
    },
    bestCatch: {
      name: bestCatch.name,
      trips: bestCatch.trips,
      fish: bestCatch.fish,
      avg: bestCatch.avg,
    },
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ============================================================================
// Selve settings-skærmen
// ============================================================================

type ReportChoice = "year" | "all" | "both";

export default function SettingsScreen() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState(auth.currentUser?.email);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteDoneModalVisible, setDeleteDoneModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const { language, setLanguage, t } = useLanguage();

  const thisYear = new Date().getFullYear();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserEmail(user?.email);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {}
  };

  const deleteAllUserData = async () => {
    if (!auth.currentUser) {
      Alert.alert(
        "Ikke logget ind",
        "Du skal være logget ind for at slette dine data."
      );
      return;
    }

    setDeleteLoading(true);
    try {
      const collections = ["trips", "catches", "spots"];

      for (const name of collections) {
        const colRef = getUserCollectionRef(name);
        const snapshot = await getDocs(colRef);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(docSnap.ref);
        }
      }

      // Slet offline-ture gemt lokalt
      try {
        await AsyncStorage.removeItem("offline_trips_v2");
      } catch {}

      setDeleteModalVisible(false);
      setDeleteConfirmText("");
      setDeleteDoneModalVisible(true);
    } catch (err: any) {
      console.error("Fejl ved sletning af data:", err);
      Alert.alert(
        "Fejl",
        err?.message ?? "Kunne ikke slette alle dine data. Prøv igen."
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDeleteData = () => {
    if (deleteConfirmText.trim() !== "Bekræft") {
      Alert.alert(
        "Bekræft sletning",
        'Skriv "Bekræft" i feltet for at slette alle dine data.'
      );
      return;
    }
    deleteAllUserData();
  };

  const generateReport = async (choice: ReportChoice) => {
    if (reportLoading) return;
    setReportLoading(true);

    try {
      const year = new Date().getFullYear();

      const yearStats: any = await withTimeout(
        statsTrips(year),
        15000,
        "statsTrips(year)"
      );
      const allStats: any = await withTimeout(
        statsTrips(),
        15000,
        "statsTrips(all)"
      );

      const allTripsArr: any[] = await withTimeout(
        listTrips(1000, 0),
        20000,
        "listTrips"
      );
      const yearTripsArr = allTripsArr.filter((t) => {
        if (!t.start_ts) return false;
        const d = new Date(t.start_ts);
        return d.getFullYear() === year;
      });

      const allSpots: any[] = await withTimeout(
        listSpots(),
        15000,
        "listSpots"
      );

      const dateStr = new Date().toLocaleDateString("da-DK");

      const safe = (v: any, fallback = "0") =>
        v === null || v === undefined ? fallback : String(v);

      // ÅR
      const yearTrips = safe(yearStats?.trips, 0);
      const yearFish = safe(yearStats?.total_fish, 0);
      const yearKm = ((yearStats?.total_m ?? 0) / 1000).toFixed(1);
      const yearHours = ((yearStats?.total_sec ?? 0) / 3600).toFixed(1);
      const yearNullTrips = safe(yearStats?.null_trips, 0);
      const yearCatchTrips = safe(yearStats?.catch_trips, 0);
      const yearFangstrate = safe(yearStats?.fangstrate ?? "0", "0");
      const yearFishPerHour = safe(yearStats?.fish_per_hour ?? "0", "0");
      const yearMulti =
        yearStats?.multi_fish_rate != null
          ? `${yearStats.multi_fish_rate}%`
          : "0%";

      // ALL TIME
      const allTrips = safe(allStats?.trips, 0);
      const allFish = safe(allStats?.total_fish, 0);
      const allKm = ((allStats?.total_m ?? 0) / 1000).toFixed(1);
      const allHours = ((allStats?.total_sec ?? 0) / 3600).toFixed(1);
      const allNullTrips = safe(allStats?.null_trips, 0);
      const allCatchTrips = safe(allStats?.catch_trips, 0);
      const allFangstrate = safe(allStats?.fangstrate ?? "0", "0");
      const allFishPerHour = safe(allStats?.fish_per_hour ?? "0", "0");
      const allMulti =
        allStats?.multi_fish_rate != null
          ? `${allStats.multi_fish_rate}%`
          : "0%";

      const yearPatternReport =
        yearTripsArr.length > 0 ? buildWeatherSummary(yearTripsArr) : null;
      const allTimePatternReport =
        allTripsArr.length > 0 ? buildWeatherSummary(allTripsArr) : null;

      const yearSpotSummary = buildSpotSummary(yearTripsArr, allSpots);
      const allSpotSummary = buildSpotSummary(allTripsArr, allSpots);

      const renderPatternLines = (lines: string[], hasGroups: boolean) => {
        if (!lines.length) {
          const msg = hasGroups
            ? "Ingen samlet opsummering endnu."
            : "Ingen fiskemønstre endnu.";
          return `<div class="pattern-empty">${msg}</div>`;
        }
        return `<ul class="pattern-list">${lines
          .map((line) => `<li>${line}</li>`)
          .join("")}</ul>`;
      };

      const renderPatternGroups = (groups: PatternGroup[]) => {
        if (!groups.length) return "";
        return `
          <div class="pattern-detail-title">Fordeling af fangster</div>
          <div class="pattern-grid">
            ${groups
              .map((group) => {
                const rows = group.items
                  .map(
                    (item) =>
                      `<div class="pattern-row"><span>${item.label}</span><span>${item.fish} fisk (${item.share}%)</span></div>`
                  )
                  .join("");
                return `
                  <div class="pattern-group">
                    <div class="pattern-group-title">${group.title}</div>
                    <div class="pattern-rows">${rows}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      };

      let sectionsHtml = "";

      // ÅRSSEKTION
      try {
        if (choice === "year" || choice === "both") {
          sectionsHtml += `
          <section class="section">
            <h2>Statistik (${year})</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Ture</div>
                <div class="stat-value">${yearTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fangstture</div>
                <div class="stat-value">${yearCatchTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Nulture</div>
                <div class="stat-value">${yearNullTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fisk</div>
                <div class="stat-value">${yearFish}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Km fisket</div>
                <div class="stat-value">${yearKm}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Timer fisket</div>
                <div class="stat-value">${yearHours}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fangstrate</div>
                <div class="stat-value">${yearFangstrate}%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fisk pr. time</div>
                <div class="stat-value">${yearFishPerHour}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Mere end én fisk pr. fangsttur</div>
                <div class="stat-value">${yearMulti}</div>
              </div>
            </div>
        `;

          if (yearSpotSummary) {
            sectionsHtml += `
            <div class="spot-card">
              <div class="spot-title">Spots (${year})</div>
              <div class="spot-subtitle">
                Besøgte spots: ${yearSpotSummary.totalSpots}
              </div>
              <ul class="spot-list">
                <li>Mest besøgt: ${yearSpotSummary.mostVisited.name} (${yearSpotSummary.mostVisited.trips} ture, ${yearSpotSummary.mostVisited.fish} fisk)</li>
                <li>Bedste spot (fisk pr. tur): ${yearSpotSummary.bestCatch.name} (${yearSpotSummary.bestCatch.fish} fisk på ${yearSpotSummary.bestCatch.trips} ture – ${yearSpotSummary.bestCatch.avg.toFixed(
                  1
                )} fisk/tur)</li>
              </ul>
            </div>
          `;
          }

          if (yearPatternReport) {
            sectionsHtml += `
            <div class="pattern-card">
              <div class="pattern-title">Fiskemønster (${year})</div>
              <div class="pattern-subtitle">Du fanger flest fisk under disse forhold:</div>
              ${renderPatternLines(
                yearPatternReport.lines,
                yearPatternReport.groups.length > 0
              )}
              ${renderPatternGroups(yearPatternReport.groups)}
            </div>
          `;
          }

          sectionsHtml += `</section>`;
        }
      } catch (e) {
        console.log("Fejl i år-sektion til PDF:", e);
      }

      // ALL-TIME SEKTION
      try {
        if (choice === "all" || choice === "both") {
          sectionsHtml += `
          <section class="section">
            <h2>All Time statistik</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Ture</div>
                <div class="stat-value">${allTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fangstture</div>
                <div class="stat-value">${allCatchTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Nulture</div>
                <div class="stat-value">${allNullTrips}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fisk</div>
                <div class="stat-value">${allFish}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Km fisket</div>
                <div class="stat-value">${allKm}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Timer fisket</div>
                <div class="stat-value">${allHours}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fangstrate</div>
                <div class="stat-value">${allFangstrate}%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Fisk pr. time</div>
                <div class="stat-value">${allFishPerHour}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Mere end én fisk pr. fangsttur</div>
                <div class="stat-value">${allMulti}</div>
              </div>
            </div>
        `;

          if (allSpotSummary) {
            sectionsHtml += `
            <div class="spot-card">
              <div class="spot-title">Spots (All Time)</div>
              <div class="spot-subtitle">
                Besøgte spots: ${allSpotSummary.totalSpots}
              </div>
              <ul class="spot-list">
                <li>Mest besøgt: ${allSpotSummary.mostVisited.name} (${allSpotSummary.mostVisited.trips} ture, ${allSpotSummary.mostVisited.fish} fisk)</li>
                <li>Bedste spot (fisk pr. tur): ${allSpotSummary.bestCatch.name} (${allSpotSummary.bestCatch.fish} fisk på ${allSpotSummary.bestCatch.trips} ture – ${allSpotSummary.bestCatch.avg.toFixed(
                  1
                )} fisk/tur)</li>
              </ul>
            </div>
          `;
          }

          if (allTimePatternReport) {
            sectionsHtml += `
            <div class="pattern-card">
              <div class="pattern-title">Fiskemønster (All Time)</div>
              <div class="pattern-subtitle">Du fanger flest fisk under disse forhold:</div>
              ${renderPatternLines(
                allTimePatternReport.lines,
                allTimePatternReport.groups.length > 0
              )}
              ${renderPatternGroups(allTimePatternReport.groups)}
            </div>
          `;
          }

          sectionsHtml += `</section>`;
        }
      } catch (e) {
        console.log("Fejl i all-time sektion til PDF:", e);
      }

      // PDF – alt tekst sort, lys baggrund
      const html = `
        <!DOCTYPE html>
        <html lang="da">
        <head>
          <meta charset="utf-8" />
          <title>Fiskerapport</title>
          <style>
            
            
            :root {
              --bg: #ffffff;
              --card-bg: #F8FAFC;
              --accent: #F59E0B;
              --accent-soft: rgba(245,158,11,0.14);
              --text: #0b0f14;
              --text-muted: #475569;
              --border: #E2E8F0;
              --border-strong: #CBD5E1;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 28px 24px;
              font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
              background: var(--bg);
              color: var(--text);
              line-height: 1.45;
            }
            h1, h2, h3 {
              margin: 0 0 8px 0;
              font-weight: 700;
              letter-spacing: 0.01em;
              color: var(--text);
            }
            h1 { font-size: 24px; }
            h2 { font-size: 18px; }
            h3 { font-size: 14px; }
            p, li, span, div {
              color: var(--text);
            }
            .page {
              max-width: 860px;
              margin: 0 auto;
            }
            .header {
              margin-bottom: 18px;
              padding-bottom: 10px;
              border-bottom: 1px solid var(--border);
              position: relative;
            }
            .header::after {
              content: "";
              display: block;
              height: 2px;
              background: var(--accent);
              opacity: 0.35;
              margin-top: 10px;
            }
            .app-name {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.22em;
              color: var(--text-muted);
              margin-bottom: 6px;
            }
            .title-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 8px;
            }
            .accent-pill {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              padding: 5px 10px;
              border-radius: 999px;
              border: 1px solid var(--accent);
              color: var(--accent);
              background: transparent;
            }
            .meta {
              font-size: 12px;
              color: var(--text-muted);
              margin-top: 6px;
              line-height: 1.4;
            }
            .meta span {
              display: inline-block;
              margin-right: 12px;
            }
            .section {
              background: var(--card-bg);
              border-radius: 16px;
              padding: 14px 16px 16px;
              border: 1px solid var(--border);
              margin-bottom: 16px;
              break-inside: avoid;
            }
            .section h2 {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 10px;
            }
            .section h2::before {
              content: "";
              width: 6px;
              height: 16px;
              border-radius: 999px;
              background: var(--accent);
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
              gap: 8px;
              margin-top: 6px;
              margin-bottom: 10px;
            }
            .stat-card {
              padding: 10px 12px;
              border-radius: 12px;
              background: #ffffff;
              border: 1px solid var(--border);
              position: relative;
            }
            .stat-card::after {
              content: "";
              position: absolute;
              top: 8px;
              right: 8px;
              width: 6px;
              height: 6px;
              border-radius: 999px;
              background: var(--accent);
              opacity: 0.4;
            }
            .stat-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.14em;
              color: var(--text-muted);
              margin-bottom: 2px;
            }
            .stat-value {
              font-size: 16px;
              font-weight: 700;
              color: var(--text);
              font-variant-numeric: tabular-nums;
            }
            .pattern-card {
              margin-top: 10px;
              padding: 10px 12px;
              border-radius: 12px;
              background: #ffffff;
              border: 1px dashed var(--border);
            }
            .pattern-title {
              font-size: 12px;
              font-weight: 600;
              margin-bottom: 4px;
              color: var(--text);
            }
            .pattern-subtitle {
              font-size: 11px;
              color: var(--text-muted);
              margin-bottom: 6px;
            }
            .pattern-list {
              margin: 0;
              padding-left: 18px;
              font-size: 11px;
              line-height: 1.4;
            }
            .pattern-list li {
              margin-bottom: 2px;
            }
            .pattern-empty {
              font-size: 11px;
              color: var(--text-muted);
              margin-top: 6px;
            }
            .pattern-detail-title {
              margin-top: 10px;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: var(--text-muted);
            }
            .pattern-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
              gap: 10px;
              margin-top: 6px;
            }
            .pattern-group {
              border: 1px solid var(--border);
              border-radius: 10px;
              padding: 8px 10px;
              background: #ffffff;
              break-inside: avoid;
            }
            .pattern-group-title {
              font-size: 11px;
              font-weight: 600;
              margin-bottom: 6px;
              color: var(--text);
            }
            .pattern-rows {
              display: grid;
              gap: 4px;
            }
            .pattern-row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              font-size: 11px;
              color: var(--text);
              padding-bottom: 4px;
              border-bottom: 1px solid var(--border);
            }
            .pattern-row:last-child {
              border-bottom: none;
              padding-bottom: 0;
            }
            .pattern-row span:last-child {
              color: var(--text-muted);
              font-variant-numeric: tabular-nums;
              white-space: nowrap;
            }
            .spot-card {
              margin-top: 10px;
              padding: 10px 12px;
              border-radius: 12px;
              background: #ffffff;
              border: 1px solid var(--border);
            }
            .spot-title {
              font-size: 12px;
              font-weight: 600;
              margin-bottom: 4px;
              color: var(--text);
            }
            .spot-subtitle {
              font-size: 11px;
              color: var(--text-muted);
              margin-bottom: 4px;
            }
            .spot-list {
              margin: 0;
              padding-left: 18px;
              font-size: 11px;
              line-height: 1.4;
            }
            .spot-list li {
              margin-bottom: 2px;
            }
            @media print {
              body { padding: 0; }
              .section { background: #ffffff; }
              .stat-card, .pattern-card, .spot-card { background: #ffffff; }
              .header::after { opacity: 0.25; }
            }


          </style>
        </head>
        <body>
          <div class="page">
            <!--
              <div class="app-name">Havørred Logbog</div>
              <div class="title-row">
                <h1>Din statistikrapport</h1>
                <div class="accent-pill">Personlig fangstrapport</div>
              </div>
              <div class="meta">
                <span>Genereret: ${dateStr}</span>
              </div>
            -->

            ${sectionsHtml}
          </div>
        </body>
        </html>
      `;

      const { uri } = await withTimeout(
        Print.printToFileAsync({
          html,
          base64: false,
        }),
        20000,
        "printToFileAsync"
      );

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Del eller gem din statistikrapport",
        });
      } else {
        Alert.alert(
          "PDF genereret",
          "PDF-rapporten er lavet, men deling er ikke understøttet på denne enhed.\n\nSti:\n" +
            uri
        );
      }
    } catch (err: any) {
      console.error("Fejl ved PDF-generering:", err);
      Alert.alert(
        "Fejl",
        err?.message ?? "Kunne ikke generere statistikrapporten."
      );
    } finally {
      setReportLoading(false);
    }
  };

  const handleDownloadReport = () => {
    if (reportLoading) return;
    setReportModalVisible(true);
  };

  const handleReportChoice = (choice: ReportChoice) => {
    setReportModalVisible(false);
    generateReport(choice);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={THEME.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Ionicons name="settings-outline" size={20} color={THEME.accent} />
            <Text style={styles.headerTitle}>Indstillinger</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Profil Sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konto</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="person" size={18} color={THEME.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>
                  {userEmail || "Ikke logget ind"}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={THEME.success} />
            </View>
          </View>
        </View>

        {/* Info Sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Om appen</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(161, 161, 170, 0.15)" }]}>
                <Ionicons name="information" size={18} color={THEME.textSec} />
              </View>
              <Text style={[styles.label, { flex: 1 }]}>Version</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>v1.0.0</Text>
              </View>
            </View>
            <View style={styles.cardDivider} />
            <Pressable
              onPress={() => setPrivacyModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={[styles.iconContainer, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
                <Ionicons name="shield-checkmark" size={18} color={THEME.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Privatlivspolitik</Text>
                <Text style={styles.value}>
                  Læs hvordan dine data behandles
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
            <View style={styles.cardDivider} />
            <Pressable
              onPress={() => setLanguageModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={[styles.iconContainer, { backgroundColor: "rgba(96, 165, 250, 0.15)" }]}>
                <Ionicons name="language" size={18} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("language")}</Text>
                <Text style={styles.value}>
                  {t("languageDesc")}
                </Text>
              </View>
              <View style={styles.languageBadge}>
                <Text style={styles.languageFlag}>{language === "da" ? "🇩🇰" : "🇬🇧"}</Text>
                <Text style={styles.languageCode}>{language.toUpperCase()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
          </View>
        </View>

        {/* Rapport / logbog */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eksporter</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="document-text" size={18} color={THEME.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PDF-statistik</Text>
                <Text style={styles.value}>
                  Download en personlig rapport med alle dine fangstdata
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                onPress={handleDownloadReport}
                disabled={reportLoading}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed || reportLoading ? { opacity: 0.85 } : null,
                ]}
              >
                {reportLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="download" size={18} color="#000" />
                    <Text style={styles.actionBtnText}>Download rapport</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* Import sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Importer</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(96, 165, 250, 0.15)" }]}>
                <Ionicons name="cloud-upload" size={18} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Manuel import</Text>
                <Text style={styles.value}>
                  Tilføj gamle data til din statistik fra tidligere sæsoner
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                onPress={() => router.push("/manual-import")}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed ? { opacity: 0.85 } : null,
                ]}
              >
                <Ionicons name="add-circle" size={18} color={THEME.text} />
                <Text style={styles.secondaryBtnText}>Åbn import</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* DATA / Slet data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(255, 69, 58, 0.15)" }]}>
                <Ionicons name="trash" size={18} color={THEME.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Slet alle data</Text>
                <Text style={styles.value}>
                  Fjern alle ture, fangster og spots permanent
                </Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Pressable
                onPress={() => {
                  setDeleteConfirmText("");
                  setDeleteModalVisible(true);
                }}
                style={({ pressed }) => [
                  styles.dangerActionBtn,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="warning" size={18} color={THEME.danger} />
                <Text style={styles.dangerActionBtnText}>Slet data</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Log ud */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={THEME.danger} />
          <Text style={styles.logoutText}>Log ud</Text>
        </Pressable>

      </ScrollView>

      {/* Privatlivspolitik modal */}
      <Modal
        transparent
        visible={privacyModalVisible}
        animationType="slide"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Privatlivspolitik</Text>
            <ScrollView style={{ maxHeight: 420, marginBottom: 12 }}>
              <Text style={styles.modalText}>
                Dataansvarlig: Havoerred Logbog (kontakt: support@havoerred-logbog.dk).
                Opdater kontaktoplysningerne hvis de ændres.
              </Text>

              <Text style={styles.modalText}>
                Formål og behandlingsgrundlag (GDPR art. 6(1)(b/f/a)):
                {"\n"}• Konto og login via Firebase Authentication (opfyldelse af aftalen om at levere appen).
                {"\n"}• Gemme ture, fangster, noter og spots i Firestore og lokalt (aftale).
                {"\n"}• Lokation under aktive ture for rute, distance, varighed og statistik (samtykke til lokation + aftale).
                {"\n"}• Notifikationer om tracking/status (samtykke når du aktiverer notifikationer).
                {"\n"}• Generering af vejrdata/rapporter til dig (legitim interesse/aftale).
              </Text>

              <Text style={styles.modalText}>
                Kategorier af data:
                {"\n"}• Konto: email, UID fra Firebase.
                {"\n"}• Ture/fangster: start-/sluttid, rute (GPS-punkter), distance, varighed, fangster, noter, spots (navn/position).
                {"\n"}• Enhedsdata til funktioner: push-token til notifikationer, cache/lagring offline.
              </Text>

              <Text style={styles.modalText}>
                Lokation: Indsamles kun når du starter en tur (forgrund og baggrund). Ikke aktiv når ingen tur kører. Baggrundslokation bruges kun til den igangværende tur.
              </Text>

              <Text style={styles.modalText}>
                Modtagere/databehandlere:
                {"\n"}• Google/Firebase (Authentication, Firestore, Cloud Messaging).
                {"\n"}• Google Maps/Place tiles til kortvisning.
                {"\n"}• DMI (vejrdata baseret på turens position).
                {"\n"}• Expo/Google for push-notifikationer og app-opdateringer (EAS/OTA).
                {"\n"}Ingen annonceringsnetværk bruges.
              </Text>

              <Text style={styles.modalText}>
                Overførsler uden for EU/EØS: Firebase/Google og Expo kan behandle data i/uden for EU. Overførsler sker med standardkontraktbestemmelser (SCC) fra udbyderne.
              </Text>

              <Text style={styles.modalText}>
                Opbevaring:
                {"\n"}• Dine data bevares, indtil du sletter dem eller lukker din konto.
                {"\n"}• Offline-cache på enheden slettes, hvis du vælger "Slet data" eller afinstallerer appen.
              </Text>

              <Text style={styles.modalText}>
                Dine rettigheder (kontakt os for at bruge dem):
                {"\n"}• Indsigt, berigtigelse, sletning, begrænsning, dataportabilitet og indsigelse.
                {"\n"}• Tilbagetræk samtykke til lokation/notifikationer i appens indstillinger eller OS-indstillinger.
                {"\n"}• Klage til Datatilsynet (www.datatilsynet.dk).
              </Text>

              <Text style={styles.modalText}>
                Sikkerhed: Data lagres i Firebase med adgangskontrol. Lokale data ligger i appens lagring (AsyncStorage) og er ikke delt med andre apps.
              </Text>

              <Text style={styles.modalText}>
                Automatiske afgørelser/profilering: Ingen.
              </Text>

              <Text style={[styles.modalText, { fontStyle: "italic" }]}>
                Senest opdateret: 17. december 2025.
              </Text>
            </ScrollView>
            <Pressable
              onPress={() => setPrivacyModalVisible(false)}
              style={({ pressed }) => [
                styles.choiceBtn,
                { marginTop: 4, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.choiceBtnText}>Luk</Text>
            </Pressable>
          </View>
        </View>
      </Modal>


      {/* Slet-data modal */}
      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (deleteLoading) return;
          setDeleteModalVisible(false);
          setDeleteConfirmText("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Slet alle dine data</Text>
            <Text style={styles.modalText}>
              Denne handling kan ikke fortrydes. Alle dine ture, fangster,
              spots og offline-data bliver slettet permanent.
            </Text>
            <Text style={[styles.modalText, { marginTop: 8 }]}>
              Skriv{" "}
              <Text style={{ fontWeight: "700", color: THEME.text }}>
                Bekræft
              </Text>{" "}
              herunder for at fortsætte.
            </Text>

            <TextInput
              style={styles.confirmInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Bekræft"
              placeholderTextColor={THEME.textSec}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              style={({ pressed }) => [
                styles.deleteConfirmBtn,
                { opacity: pressed || deleteLoading ? 0.9 : 1 },
                deleteConfirmText.trim() !== "Bekræft" || deleteLoading
                  ? { opacity: 0.4 }
                  : null,
              ]}
              disabled={
                deleteConfirmText.trim() !== "Bekræft" || deleteLoading
              }
              onPress={handleConfirmDeleteData}
            >
              {deleteLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.deleteConfirmText}>Slet alle data</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                if (deleteLoading) return;
                setDeleteModalVisible(false);
                setDeleteConfirmText("");
              }}
            >
              <Text style={styles.modalCancelText}>Annullér</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Efter-sletning modal (pæn UI) */}
      <Modal
        transparent
        visible={deleteDoneModalVisible}
        animationType="fade"
        onRequestClose={() => setDeleteDoneModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View
              style={{
                alignSelf: "center",
                marginBottom: 10,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(34,197,94,0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={26} color="#22C55E" />
            </View>
            <Text style={styles.modalTitle}>Dine data er slettet</Text>
            <Text style={styles.modalText}>
              Alle dine ture, fangster, spots og offline-data i appen er nu
              fjernet. Du kan stadig bruge appen og begynde forfra med nye ture.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => setDeleteDoneModalVisible(false)}
            >
              <Text style={styles.choiceBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PDF-valg modal */}
      <Modal
        transparent
        visible={reportModalVisible}
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Download statistik</Text>
            <Text style={styles.modalText}>
              Vælg hvilken statistik du vil eksportere som PDF-logbog.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("year")}
            >
              <Text style={styles.choiceBtnText}>
                {thisYear} – indeværende år
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("all")}
            >
              <Text style={styles.choiceBtnText}>All Time</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("both")}
            >
              <Text style={styles.choiceBtnText}>
                {thisYear} + All Time
              </Text>
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setReportModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Sprog-valg modal */}
      <Modal
        transparent
        visible={languageModalVisible}
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("language")}</Text>
            <Text style={styles.modalText}>
              {t("languageDesc")}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.languageOption,
                language === "da" && styles.languageOptionActive,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => {
                setLanguage("da");
                setLanguageModalVisible(false);
              }}
            >
              <Text style={styles.languageOptionFlag}>🇩🇰</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>Dansk</Text>
                <Text style={styles.languageOptionSubtitle}>Danish</Text>
              </View>
              {language === "da" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.success} />
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.languageOption,
                language === "en" && styles.languageOptionActive,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => {
                setLanguage("en");
                setLanguageModalVisible(false);
              }}
            >
              <Text style={styles.languageOptionFlag}>🇬🇧</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>English</Text>
                <Text style={styles.languageOptionSubtitle}>Engelsk</Text>
              </View>
              {language === "en" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.success} />
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setLanguageModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    paddingVertical: 8,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSec,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  cardDivider: {
    height: 1,
    backgroundColor: THEME.cardBorder,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 0,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.text,
  },
  value: {
    fontSize: 13,
    color: THEME.textSec,
    marginTop: 2,
    lineHeight: 18,
  },
  versionBadge: {
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSec,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  actionBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 14,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  dangerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    borderRadius: 14,
    paddingVertical: 12,
  },
  dangerActionBtnText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  dangerBtn: {
    backgroundColor: THEME.danger,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  logoutBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderRadius: 16,
    padding: 16,
  },
  logoutText: {
    color: THEME.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  footerText: {
    textAlign: "center",
    color: THEME.textSec,
    fontSize: 12,
    marginTop: 24,
  },

  // Modal til valg af rapport / slet data / besked
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalText: {
    color: THEME.textSec,
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  // (how-to modal fjernet)
  trackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  trackCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    padding: 10,
    marginBottom: 10,
  },
  trackBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  trackBtnPrimary: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: THEME.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackBtnGhost: {
    width: 64,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  trackList: {
    gap: 6,
  },
  statsRows: {
    gap: 6,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pdfBtnMock: {
    height: 34,
    borderRadius: 10,
    backgroundColor: THEME.primary,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  choiceBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  modalCancelText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "500",
  },
  confirmInput: {
    marginTop: 10,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.text,
    fontSize: 16,
  },
  deleteConfirmBtn: {
    backgroundColor: THEME.danger,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  deleteConfirmText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  languageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 4,
  },
  languageFlag: {
    fontSize: 16,
  },
  languageCode: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.text,
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  languageOptionActive: {
    borderColor: THEME.success,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  languageOptionFlag: {
    fontSize: 28,
  },
  languageOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.text,
  },
  languageOptionSubtitle: {
    fontSize: 13,
    color: THEME.textSec,
    marginTop: 2,
  },
});
