// lib/patternAnalysis.ts
// Pattern analysis and statistics helpers for fishing data

import SunCalc from "suncalc";
import { getWindType, type CoastDirection } from "./spots";

// Translation function type - accepts any key→string function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TFunc = (key: any) => string;
export type Language = "da" | "en";

// ============================================================================
// Types
// ============================================================================

export type SimpleBucket = {
  trips: number;
  fish: number;
};

export type BestBucket = {
  label: string;
  trips: number;
};

export type PatternItem = {
  label: string;
  fish: number;
  share: number;
};

export type PatternGroup = {
  title: string;
  items: PatternItem[];
};

export type PatternReport = {
  lines: string[];
  groups: PatternGroup[];
};

export type PatternStats = {
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

type TempBand = {
  label: string;
  min: number;
  max: number;
};

export type SpotAgg = {
  spotId: string;
  trips: number;
  fish: number;
};

export type SpotSummary = {
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

// ============================================================================
// Constants
// ============================================================================

const TEMP_BANDS: TempBand[] = [
  { label: "0–4°C", min: 0, max: 4 },
  { label: "4–8°C", min: 4, max: 8 },
  { label: "8–12°C", min: 8, max: 12 },
  { label: "12–16°C", min: 12, max: 16 },
  { label: "16°C+", min: 16, max: 100 },
];

// ============================================================================
// Bucket/Label Functions
// ============================================================================

export function waterLevelBucket(cm?: number | null, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  if (cm == null || !Number.isFinite(cm)) return tr("unknown");
  if (cm < -20) return tr("lowWater");
  if (cm > 20) return tr("highWater");
  return tr("midWater");
}

export function seasonFromMonth(month: number, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  if (month >= 2 && month <= 4) return tr("spring");
  if (month >= 5 && month <= 7) return tr("summer");
  if (month >= 8 && month <= 10) return tr("autumn");
  return tr("winter");
}

export function timeOfDayBucket(h: number, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  if (h >= 5 && h < 9) return tr("theMorning");
  if (h >= 9 && h < 12) return tr("theLateMorning");
  if (h >= 12 && h < 17) return tr("theAfternoon");
  if (h >= 17 && h < 22) return tr("theEvening");
  return tr("theNight");
}

export function tempBucketLabel(temp?: number | null, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  if (temp == null || !Number.isFinite(temp)) return tr("unknown");
  const band = TEMP_BANDS.find((b) => temp >= b.min && temp < b.max);
  return band ? band.label : tr("unknown");
}

export function windSpeedBucketLabel(ms?: number | null, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  if (ms == null || !Number.isFinite(ms)) return tr("unknown");
  if (ms < 4) return tr("weakWind");
  if (ms < 8) return tr("mildWind");
  if (ms < 12) return tr("freshWind");
  return tr("hardWind");
}

export function coastWindLabel(raw?: string | null, t?: TFunc): string | null {
  if (!raw) return null;
  const tr = t ?? ((k: string) => k);
  const v = raw.toLowerCase();

  if (v.includes("fraland") || v.includes("offshore")) return tr("offshoreWind");
  if (v.includes("påland") || v.includes("på-land") || v.includes("onshore")) return tr("onshoreWind");
  if (v.includes("side") || v.includes("langs") || v.includes("tvaers"))
    return tr("sideWind");

  if (v === "ukendt" || v === "unknown") return null;
  return raw;
}

export function windDirLabelFromDeg(deg: number, t?: TFunc): string {
  const tr = t ?? ((k: string) => k);
  const d = ((deg % 360) + 360) % 360;

  if (d >= 337.5 || d < 22.5) return tr("north");
  if (d >= 22.5 && d < 67.5) return tr("northEast");
  if (d >= 67.5 && d < 112.5) return tr("east");
  if (d >= 112.5 && d < 157.5) return tr("southEast");
  if (d >= 157.5 && d < 202.5) return tr("south");
  if (d >= 202.5 && d < 247.5) return tr("southWest");
  if (d >= 247.5 && d < 292.5) return tr("west");
  return tr("northWest");
}

export function durationBucketLabel(durationSec?: number | null, t?: TFunc): string | null {
  if (!Number.isFinite(durationSec ?? null)) return null;
  const tr = t ?? ((k: string) => k);
  const hrs = (durationSec as number) / 3600;
  if (hrs < 2) return tr("lessThan2Hours");
  if (hrs < 4) return tr("hours2to4");
  if (hrs < 6) return tr("hours4to6");
  return tr("hours6plus");
}

export function movementLabel(
  distanceM?: number | null,
  durationSec?: number | null,
  t?: TFunc
): string | null {
  if (
    !Number.isFinite(distanceM ?? null) ||
    !Number.isFinite(durationSec ?? null)
  )
    return null;
  const tr = t ?? ((k: string) => k);
  const dist = distanceM as number;
  const dur = durationSec as number;
  if (dur <= 0) return null;
  const speed = dist / dur;
  if (dist <= 300) return tr("standingLightMovement");
  if (dist >= 1500 || speed >= 0.35) return tr("fishingTheWater");
  return tr("calmPace");
}

// ============================================================================
// Analysis Functions
// ============================================================================

export function pickBestBucket(
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

export function buildBucketItems(
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

  let cleaned = list.filter((e) => e.label !== "ukendt" && e.label !== "unknown");
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

export function buildPatternGroups(
  stats: PatternStats,
  minTrips: number,
  t?: TFunc,
  language?: Language
): PatternGroup[] {
  const tr = t ?? ((k: string) => k);
  const lang = language ?? "da";
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

  pushGroup(tr("season"), stats.seasonStats);
  pushGroup(tr("timeOfDay"), stats.todStats);
  pushGroup(tr("waterLevel"), stats.tideStats);
  pushGroup(tr("seaTemp"), stats.waterTempStats);
  pushGroup(tr("airTemp"), stats.airTempStats);
  pushGroup(tr("windSpeed"), stats.windSpeedStats);
  pushGroup(tr("windDirection"), stats.windDirStats);
  pushGroup(tr("windRelativeToCoast"), stats.coastWindStats);
  pushGroup(tr("tripDuration"), stats.durationStats);
  pushGroup(tr("movement"), stats.movementStats);

  const spotCount = Object.keys(stats.spotStats).length;
  const spotLimit = spotCount > 10 ? 10 : undefined;
  pushGroup(lang === "da" ? "Spots med flest fisk" : "Spots with most fish", stats.spotStats, spotLimit);

  return groups;
}

// ============================================================================
// Main Pattern Analysis
// ============================================================================

export function buildWeatherSummary(allTrips: any[], spots?: any[], t?: TFunc, language?: Language): PatternReport | null {
  const tr = t ?? ((k: string) => k);
  const lang = language ?? "da";
  const tripsWithFish = allTrips.filter((tp) => (tp.fish_count ?? 0) > 0);
  if (!tripsWithFish.length) return null;

  // Byg et map fra spot_id til coastDirection for hurtig lookup
  const spotCoastMap = new Map<string, CoastDirection>();
  if (spots) {
    for (const spot of spots) {
      if (spot.id && spot.coastDirection) {
        spotCoastMap.set(String(spot.id), spot.coastDirection);
      }
    }
  }

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

  const getTripLocation = (tp: any): { lat: number; lng: number } | null => {
    if (Number.isFinite(tp.spot_lat) && Number.isFinite(tp.spot_lng)) {
      return { lat: tp.spot_lat, lng: tp.spot_lng };
    }
    if (tp.path_json) {
      try {
        const parsed = JSON.parse(tp.path_json);
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

    const windDirDeg: number | null =
      (evaluation?.windDirDeg?.avg ??
        evaluation?.windDeg?.avg ??
        evaluation?.windFromDirDeg?.avg ??
        evaluation?.windFromDir?.avg ??
        null) ?? null;

    // Hent spotets kystretning - enten fra trip eller via spot lookup
    const tripSpotId = trip.spot_id ?? trip.spotId ?? null;
    const spotCoastDir: CoastDirection | null =
      trip.spot_coast_direction ??
      trip.coastDirection ??
      (tripSpotId ? spotCoastMap.get(String(tripSpotId)) : null) ??
      null;

    // Beregn vind ift. kyst fra vindretning + spotets kystretning
    let cw: string | null = null;
    if (windDirDeg != null && Number.isFinite(windDirDeg) && spotCoastDir) {
      const windType = getWindType(windDirDeg, spotCoastDir);
      cw = windType === 'offshore' ? tr('offshoreWind')
         : windType === 'onshore' ? tr('onshoreWind')
         : tr('sideWind');
    } else {
      // Fallback til gammel metode hvis vi ikke har kystretning
      const cwRaw: string | null = evaluation?.coastWind?.category ?? null;
      cw = coastWindLabel(cwRaw, tr);
    }

    const windDirKey =
      windDirDeg != null && Number.isFinite(windDirDeg)
        ? windDirLabelFromDeg(windDirDeg, tr)
        : null;

    const tideKey = waterLevelBucket(wl, tr);
    const airKey = tempBucketLabel(airT, tr);
    const waterKey = tempBucketLabel(waterT, tr);
    const windSpeedKey = windSpeedBucketLabel(windMs, tr);
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
        tr
      ) ?? null;
    const moveLabel = movementLabel(trip.distance_m, trip.duration_sec, tr);
    const tripLocation = getTripLocation(trip);

    // Catch timestamps
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
        // ignore
      }
    }

    if (!catchMs.length && fishCount > 0 && trip.start_ts) {
      const base = new Date(trip.start_ts).getTime();
      for (let i = 0; i < fishCount; i++) {
        catchMs.push(base);
      }
    }

    if (!catchMs.length) continue;

    const spotName: string | null = trip.spot_name ?? null;

    for (const ts of catchMs) {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;

      totalFish += 1;

      const month = d.getMonth();
      const hour = d.getHours();

      if (month != null && Number.isFinite(month)) {
        const seasonKey = seasonFromMonth(month, tr);
        if (!seasonStats[seasonKey]) {
          seasonStats[seasonKey] = { trips: 0, fish: 0 };
        }
        seasonStats[seasonKey].trips += 1;
        seasonStats[seasonKey].fish += 1;
      }

      if (hour != null && Number.isFinite(hour)) {
        const todKey = timeOfDayBucket(hour, tr);
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

  const unknownLabel = tr("unknown");
  const lines: string[] = [];

  if (bestSpot && bestSpot.label !== unknownLabel) {
    lines.push(`${tr("spotLabel")}: ${bestSpot.label}`);
  }

  if (bestTide && bestTide.label !== unknownLabel) {
    lines.push(bestTide.label);
  }

  if (bestWindSpeed && bestWindSpeed.label !== unknownLabel) {
    lines.push(`${tr("windSpeed")}: ${bestWindSpeed.label}`);
  }

  if (bestWindDir && bestWindDir.label !== unknownLabel) {
    lines.push(`${tr("windDirection")}: ${bestWindDir.label}`);
  }

  if (bestTod) {
    lines.push(lang === "da"
      ? `Om ${bestTod.label.toLowerCase()}`
      : `${tr("inThe")} ${bestTod.label.toLowerCase()}`);
  }

  if (bestSeason) {
    lines.push(lang === "da"
      ? `Om ${bestSeason.label.toLowerCase()}`
      : `${tr("inThe")} ${bestSeason.label.toLowerCase()}`);
  }

  if (bestWater && bestWater.label !== unknownLabel) {
    lines.push(`${tr("seaTemp")}: ${bestWater.label}`);
  }

  if (bestAir && bestAir.label !== unknownLabel) {
    lines.push(`${tr("airTemp")}: ${bestAir.label}`);
  }

  if (bestCoastWind) {
    const cwLabel = bestCoastWind.label;
    const cwLower = cwLabel.toLowerCase();
    if (cwLower.includes("fraland") || cwLower.includes("offshore")) {
      lines.push(tr("atOffshoreWind"));
    } else if (cwLower.includes("påland") || cwLower.includes("på-land") || cwLower.includes("onshore")) {
      lines.push(tr("atOnshoreWind"));
    } else if (cwLower.includes("side") || cwLower.includes("langs") || cwLower.includes("tvaers")) {
      lines.push(tr("atSideWind"));
    } else {
      lines.push(`${tr("windRelativeToCoast")}: ${cwLabel}`);
    }
  }

  if (sunOffset.count > 0) {
    const avg = sunOffset.sumMinutes / sunOffset.count;
    const event =
      sunOffset.sunriseCount >= sunOffset.sunsetCount
        ? tr("sunrise").toLowerCase()
        : tr("sunset").toLowerCase();
    const dir = avg < 0 ? tr("before") : tr("after");
    const absMinutes = Math.abs(avg);

    let timeLabel: string;
    if (absMinutes >= 90) {
      const hours = Math.round(absMinutes / 60);
      timeLabel = lang === "da"
        ? `${hours} time${hours > 1 ? "r" : ""}`
        : `${hours} hour${hours > 1 ? "s" : ""}`;
    } else if (absMinutes >= 45) {
      timeLabel = lang === "da" ? "1 time" : "1 hour";
    } else {
      const rounded = Math.round(absMinutes / 30) * 30;
      timeLabel = rounded === 0 ? tr("at") : `${rounded} min`;
    }

    if (timeLabel === tr("at")) {
      lines.push(`${tr("typicalMinutes")} ${timeLabel} ${event}`);
    } else {
      lines.push(`${tr("typicalMinutes")} ${timeLabel} ${dir} ${event}`);
    }
  }

  if (bestDuration) {
    lines.push(`${tr("tripLength")}: ${bestDuration.label} ${tr("givesMostFish")}`);
  }

  if (bestMovement) {
    const mv = bestMovement.label.toLowerCase();
    if (mv.includes("affiskning") || mv.includes("fishing the water")) {
      lines.push(`${tr("mostFishAt")} ${tr("fishingWater")}`);
    } else if (mv.includes("still") || mv.includes("standing")) {
      lines.push(`${tr("mostFishAt")} ${tr("standingStill")}`);
    } else {
      lines.push(`${tr("mostFishAt")} ${bestMovement.label.toLowerCase()}`);
    }
  }

  const forecastHints: string[] = [];
  if (bestWindSpeed && bestWindSpeed.label !== unknownLabel) {
    forecastHints.push(bestWindSpeed.label);
  }
  if (bestTide && bestTide.label !== unknownLabel) {
    forecastHints.push(bestTide.label);
  }
  if (bestWater && bestWater.label !== unknownLabel) {
    forecastHints.push(lang === "da"
      ? `Havtemp ${bestWater.label}`
      : `Sea temp ${bestWater.label}`);
  }
  if (forecastHints.length) {
    lines.push(
      `${tr("forecastLookFor")} ${forecastHints.slice(0, 3).join(", ")} ${tr("forBestMatch")}`
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
    MIN_TRIPS,
    tr,
    lang
  );

  if (!lines.length && !groups.length) return null;
  return { lines, groups };
}

// ============================================================================
// Spot Summary
// ============================================================================

export function buildSpotSummary(
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

// ============================================================================
// Utilities
// ============================================================================

export function withTimeout<T>(
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
