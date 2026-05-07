// lib/dmi.ts
// Samler Climate + Ocean til én evaluering
// OPTIMIZED: SQLite persistent cache, request coalescing, stale-while-revalidate

// DMI Climate/Ocean bruges stadig af spot-weather (stationsmarkører) og salinitet-overlay
// men ikke længere til tur-evaluering (erstattet med Open-Meteo)
// DMI_EDR_BASE_URL ikke længere nødvendig - bruger Open-Meteo i stedet
import {
  getCachedWeather,
  setCachedWeather,
  clearWeatherCache,
  getCacheStats,
} from "./weatherCache";

// Re-export cache utilities for external use
export { clearWeatherCache, getCacheStats };

// In-memory cache as L1 (instant), SQLite as L2 (persistent)
const memoryCache: Map<
  string,
  { data: EdrForecast | null; ts: number }
> = new Map();
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min memory cache

// In-flight request deduplication - prevents duplicate API calls
const inFlightRequests: Map<string, Promise<EdrForecast | null>> = new Map();

/**
 * Warm up SQLite cache for faster first read.
 */
export async function warmUpDmiProxy(): Promise<void> {
  try {
    await getCacheStats();
  } catch {
    // Ignore errors
  }
}

export type Stat = {
  avg: number;
  min: number;
  max: number;
};

export type Serie = {
  ts: number;
  v: number;
};

export type DmiEvaluation = {
  source: "DMI";
  note?: string;

  // Climate-station
  stationName?: string;
  stationId?: string;

  // Ocean-station
  oceanStationName?: string;
  oceanStationId?: string;

  airTempC?: Stat;
  windMS?: Stat;
  windDirDeg?: Stat;
  waterTempC?: Stat;
  waterLevelCM?: Stat;

  airTempSeries?: Serie[];
  windSpeedSeries?: Serie[];
  waterTempSeries?: Serie[];
  waterLevelSeries?: Serie[];
  pressureSeries?: Serie[];
  humiditySeries?: Serie[];

  // Lufttryk, fugtighed og skydække stats
  pressureHPa?: Stat;
  humidityPct?: Stat;
  cloudCoverPct?: Stat;
  cloudCoverSeries?: Serie[];

  // --- NYT: kyst-/vindrelation baseret på GPS-track ---
  coastWind?: CoastWindInfo;
};

export type EvaluateTripInput = {
  startIso: string;
  endIso: string;
  points: { latitude: number; longitude: number; t: number }[];
};

function middleOfRoute(points: { latitude: number; longitude: number }[]) {
  if (!points.length) {
    return { lat: 55.5, lon: 10.5 }; // fallback midt i DK
  }
  const midIdx = Math.floor(points.length / 2);
  return {
    lat: points[midIdx].latitude,
    lon: points[midIdx].longitude,
  };
}

/**
 * Runder et timestamp ned til starten af timen.
 * DMI Climate API bruger hele timer (from: "18:00:00"), så vi skal matche det.
 */
function floorToHour(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/**
 * Runder et timestamp op til starten af næste time.
 */
function ceilToHour(ms: number): number {
  const d = new Date(ms);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1);
  }
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

// ============================================================================
// NYT AFSNIT: KYST- OG VINDRETNING BASERET PÅ GPS-TRACK
// ============================================================================

export type CoastWindCategory =
  | "langs-kysten"
  | "på-tværs-af-kysten"
  | "skrå"
  | "ukendt";

export type CoastWindInfo = {
  coastBearingDeg: number | null;   // kyst-/rute-retning (0=N, 90=Ø ...)
  windDirDegAvg: number | null;    // gennemsnitlig vindretning fra DMI
  angleDiffDeg: number | null;     // vinkel (signed) mellem vind og kystretning (-180..180)
  category: CoastWindCategory;     // grov klassifikation
};

// DMI API response types
type DmiGeoJsonFeature = {
  properties: Record<string, unknown>;
  geometry?: unknown;
};

type DmiGeoJsonResponse = {
  features?: DmiGeoJsonFeature[];
};

type DmiCoverageRanges = Record<string, { values?: (number | null)[] } | undefined>;

type DmiCoverageJson = {
  domain?: {
    axes?: {
      t?: { values?: string[] };
    };
  };
  ranges?: DmiCoverageRanges;
};

/** Hjælp: grader → radianer */
function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Hjælp: (lat,lon) → storcirkel-afstand i meter */
function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Bearing fra punkt A til B (0° = nord, 90° = øst).
 */
function bearingDeg(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ) -
    Math.sin(φ1) * Math.sin(φ2);

  let θ = Math.atan2(y, x); // -π..π
  let deg = (θ * 180) / Math.PI;
  deg = (deg + 360) % 360; // 0..360
  return deg;
}

/**
 * Estimerer kyst-/rute-retning ud fra de første ~150 m af GPS-tracket.
 * Hvis turen er for kort / stationær, returnerer den null.
 */
function computeCoastBearing(
  points: { latitude: number; longitude: number }[]
): number | null {
  if (!points || points.length < 2) return null;

  const start = points[0];
  let totalDist = 0;
  let candidate = points[points.length - 1];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const d = distanceMeters(prev, curr);
    totalDist += d;
    candidate = curr;
    if (totalDist >= 150) break; // vi har "nok" kyst/sti at regne på
  }

  // Hvis der samlet kun er bevæget sig meget lidt, giver bearing ingen mening
  if (totalDist < 30) return null;

  return bearingDeg(start, candidate);
}

/** Normaliser vinkel til intervallet -180..180 */
function wrapAngle180(angleDeg: number): number {
  let a = ((angleDeg + 540) % 360) - 180;
  return a;
}

/**
 * Kombinerer estimeret kystretning med gennemsnitlig vindretning.
 * Returnerer null hvis enten kystretning eller vindretning mangler.
 */
function computeCoastWindInfo(
  points: { latitude: number; longitude: number }[],
  windDirDegAvg?: number | null
): CoastWindInfo | null {
  const coastBearing = computeCoastBearing(points);
  if (
    coastBearing == null ||
    windDirDegAvg == null ||
    !Number.isFinite(windDirDegAvg)
  ) {
    return null;
  }

  const diff = wrapAngle180(windDirDegAvg - coastBearing);
  const diffAbs = Math.abs(diff);

  let category: CoastWindCategory;
  // 0° ≈ vind langs kysten (samme retning som din bevægelse)
  // 90° ≈ vind på tværs af kysten
  if (diffAbs <= 30) category = "langs-kysten";
  else if (diffAbs >= 60) category = "på-tværs-af-kysten";
  else category = "skrå";

  return {
    coastBearingDeg: coastBearing,
    windDirDegAvg,
    angleDiffDeg: diff,
    category,
  };
}

// ============================================================================
// EKSISTERENDE DEL: SAMLET DMI-EVALUERING (KLIMA + OCEAN)
// ============================================================================

/**
 * Samler:
 *  - Climate (vind/vejr)
 *  - Ocean (vandstand/vandtemp)
 * til én samlet DmiEvaluation.
 */
export async function evaluateTripWithDmi(
  input: EvaluateTripInput
): Promise<DmiEvaluation | null> {
  const { startIso, endIso, points } = input;

  if (!points.length) {
    return {
      source: "DMI",
      note: "Ingen GPS-punkter på turen – ingen DMI-data.",
    };
  }

  const { lat, lon } = middleOfRoute(points);

  // Beregn tidsvindue (udvid korte ture til min 2 timer)
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const durationMs = endMs - startMs;
  const MIN_DURATION_MS = 2 * 60 * 60 * 1000;

  let effectiveStartMs: number;
  let effectiveEndMs: number;

  if (durationMs < MIN_DURATION_MS) {
    const centerMs = startMs + durationMs / 2;
    effectiveStartMs = centerMs - MIN_DURATION_MS / 2;
    effectiveEndMs = centerMs + MIN_DURATION_MS / 2;
  } else {
    effectiveStartMs = startMs;
    effectiveEndMs = endMs;
  }

  effectiveStartMs = floorToHour(effectiveStartMs);
  effectiveEndMs = ceilToHour(effectiveEndMs);

  // Open-Meteo bruger YYYY-MM-DD datoer
  const startDate = new Date(effectiveStartMs).toISOString().slice(0, 10);
  const endDate = new Date(effectiveEndMs).toISOString().slice(0, 10);

  // Vælg forecast API (recent) eller archive API (>92 dage)
  const daysAgo = (Date.now() - effectiveStartMs) / (24 * 60 * 60 * 1000);
  const weatherBase = daysAgo > 90
    ? "https://archive-api.open-meteo.com/v1/archive"
    : OPEN_METEO_WEATHER;

  // 2 parallelle requests til Open-Meteo (~250ms total)
  const weatherUrl = `${weatherBase}?latitude=${lat}&longitude=${lon}`
    + `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover`
    + `&wind_speed_unit=ms&start_date=${startDate}&end_date=${endDate}&timezone=auto`
    + `&apikey=${OPEN_METEO_API_KEY}`
    + (daysAgo <= 90 ? `&models=dmi_seamless` : "");

  const marineUrl = `${OPEN_METEO_MARINE}?latitude=${lat}&longitude=${lon}`
    + `&hourly=sea_surface_temperature,sea_level_height_msl`
    + `&start_date=${startDate}&end_date=${endDate}&timezone=auto`
    + `&apikey=${OPEN_METEO_API_KEY}`;

  const [weatherResult, marineResult] = await Promise.allSettled([
    fetchOpenMeteo(weatherUrl),
    fetchOpenMeteo(marineUrl),
  ]);

  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const marine = marineResult.status === "fulfilled" ? marineResult.value : null;

  const evalRes: DmiEvaluation = { source: "DMI" };

  if (!weather?.hourly?.time && !marine?.hourly?.time) {
    evalRes.note = "Ingen vejrdata fundet for denne tur.";
    return evalRes;
  }

  // Filtrer til turens tidsvindue
  const filterToTrip = (
    times: string[],
    values: (number | null)[]
  ): Serie[] => {
    const series: Serie[] = [];
    for (let i = 0; i < times.length; i++) {
      const ts = new Date(times[i]).getTime();
      if (ts >= effectiveStartMs && ts <= effectiveEndMs && values[i] != null) {
        series.push({ ts, v: values[i]! });
      }
    }
    return series;
  };

  const buildStat = (series: Serie[]): Stat | undefined => {
    if (!series.length) return undefined;
    let min = series[0].v, max = series[0].v, sum = 0;
    for (const s of series) {
      if (s.v < min) min = s.v;
      if (s.v > max) max = s.v;
      sum += s.v;
    }
    return { avg: sum / series.length, min, max };
  };

  // Weather → DmiEvaluation
  if (weather?.hourly?.time) {
    const h = weather.hourly;
    const times = h.time as string[];

    const tempSeries = filterToTrip(times, (h.temperature_2m || []) as (number | null)[]);
    const windSeries = filterToTrip(times, (h.wind_speed_10m || []) as (number | null)[]);
    const dirSeries = filterToTrip(times, (h.wind_direction_10m || []) as (number | null)[]);
    const humSeries = filterToTrip(times, (h.relative_humidity_2m || []) as (number | null)[]);
    const presSeries = filterToTrip(times, (h.surface_pressure || []) as (number | null)[]);
    const cloudSeries = filterToTrip(times, (h.cloud_cover || []) as (number | null)[]);

    if (tempSeries.length) { evalRes.airTempSeries = tempSeries; evalRes.airTempC = buildStat(tempSeries); }
    if (windSeries.length) { evalRes.windSpeedSeries = windSeries; evalRes.windMS = buildStat(windSeries); }
    if (dirSeries.length) { evalRes.windDirDeg = buildStat(dirSeries); }
    if (humSeries.length) { evalRes.humiditySeries = humSeries; evalRes.humidityPct = buildStat(humSeries); }
    if (presSeries.length) { evalRes.pressureSeries = presSeries; evalRes.pressureHPa = buildStat(presSeries); }
    if (cloudSeries.length) { evalRes.cloudCoverSeries = cloudSeries; evalRes.cloudCoverPct = buildStat(cloudSeries); }

    // Open-Meteo som "station"
    evalRes.stationName = "Open-Meteo (HARMONIE 2km)";
    evalRes.stationId = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // Marine → DmiEvaluation
  if (marine?.hourly?.time) {
    const m = marine.hourly;
    const times = m.time as string[];

    const sstSeries = filterToTrip(times, (m.sea_surface_temperature || []) as (number | null)[]);
    const levelSeries = filterToTrip(times, (m.sea_level_height_msl || []) as (number | null)[]);

    // Konverter vandstand m → cm
    const levelCmSeries = levelSeries.map((s) => ({ ts: s.ts, v: s.v * 100 }));

    if (sstSeries.length) { evalRes.waterTempSeries = sstSeries; evalRes.waterTempC = buildStat(sstSeries); }
    if (levelCmSeries.length) { evalRes.waterLevelSeries = levelCmSeries; evalRes.waterLevelCM = buildStat(levelCmSeries); }

    evalRes.oceanStationName = "Open-Meteo Marine";
    evalRes.oceanStationId = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // Kyst-/vindrelation baseret på GPS-track
  if (evalRes.windDirDeg?.avg != null) {
    const cw = computeCoastWindInfo(points, evalRes.windDirDeg.avg);
    if (cw) evalRes.coastWind = cw;
  }

  return evalRes;
}

// --- Forecast (via Open-Meteo, ~200ms, DMI HARMONIE model) ---

export type StacForecastFile = {
  id: string;
  datetime: string;
  modelRun?: string;
  downloadUrl?: string;
};

export type PointStacForecast = {
  harmonieFiles: StacForecastFile[];
  dkssFiles: StacForecastFile[];
};

export type EdrForecast = {
  airTempSeries: Serie[];
  windSpeedSeries: Serie[];
  windDirSeries: Serie[];
  gustWindSeries: Serie[];        // Vindstød m/s
  waterLevelSeries: Serie[];
  waveHeightSeries: Serie[];
  wavePeriodSeries: Serie[];      // Bølgeperiode (s)
  waveDirSeries: Serie[];         // Bølgeretning (grader)
  waterTempSeries: Serie[];       // Vandtemperatur fra DKSS (°C)
  currentSpeedSeries: Serie[];
  humiditySeries: Serie[];
  pressureSeries: Serie[];
  cloudCoverSeries: Serie[];
  precipitationSeries: Serie[];   // Nedbør i mm/h
  dewPointSeries: Serie[];        // Dugpunkt °C
  visibilitySeries: Serie[];      // Sigtbarhed km
  uvIndexSeries: Serie[];         // UV-indeks
  oceanFallbackStation?: string;
};

// --- Open-Meteo API (customer subscription) ---
const OPEN_METEO_API_KEY = "uwsI1lSZ2idaPwlD";
const OPEN_METEO_WEATHER = "https://customer-api.open-meteo.com/v1/forecast";
const OPEN_METEO_MARINE = "https://customer-marine-api.open-meteo.com/v1/marine";

type OpenMeteoHourly = {
  time?: string[];
  [key: string]: (number | null)[] | string[] | undefined;
};

async function fetchOpenMeteo(url: string, timeoutMs = 5000): Promise<{ hourly?: OpenMeteoHourly } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Punktprognose til SpotWeather (luft, vind, vandstand, bølger).
 * OPTIMIZED: Memory cache + request coalescing
 */
export async function getSpotForecastEdr(
  lat: number,
  lon: number
): Promise<EdrForecast | null> {
  // Simple cache key (4 decimaler = ~11m præcision)
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;

  // L1: Check memory cache (instant)
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.ts < MEMORY_CACHE_TTL_MS) {
    return memoryCached.data;
  }

  // Check for in-flight request (prevents duplicate API calls)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // Create fetch promise
  const fetchPromise = (async (): Promise<EdrForecast | null> => {
    try {
      // L2: Check SQLite cache
      try {
        const sqliteCached = await getCachedWeather(lat, lon);
        if (sqliteCached) {
          const raw = JSON.parse(sqliteCached.data);
          // Sikr at nye felter har defaults (cache kan stamme fra ældre version)
          const parsedData: EdrForecast = {
            airTempSeries: raw.airTempSeries ?? [],
            windSpeedSeries: raw.windSpeedSeries ?? [],
            windDirSeries: raw.windDirSeries ?? [],
            gustWindSeries: raw.gustWindSeries ?? [],
            waterLevelSeries: raw.waterLevelSeries ?? [],
            waveHeightSeries: raw.waveHeightSeries ?? [],
            wavePeriodSeries: raw.wavePeriodSeries ?? [],
            waveDirSeries: raw.waveDirSeries ?? [],
            waterTempSeries: raw.waterTempSeries ?? [],
            currentSpeedSeries: raw.currentSpeedSeries ?? [],
            humiditySeries: raw.humiditySeries ?? [],
            pressureSeries: raw.pressureSeries ?? [],
            cloudCoverSeries: raw.cloudCoverSeries ?? [],
            precipitationSeries: raw.precipitationSeries ?? [],
            dewPointSeries: raw.dewPointSeries ?? [],
            visibilitySeries: raw.visibilitySeries ?? [],
            uvIndexSeries: raw.uvIndexSeries ?? [],
            oceanFallbackStation: raw.oceanFallbackStation,
          };
          memoryCache.set(cacheKey, { data: parsedData, ts: Date.now() });

          if (!sqliteCached.isStale) {
            // Fresh cache - return immediately
            return parsedData;
          }

          // Stale cache - return stale data NOW, refresh in background
          fetchWeatherFromApi(lat, lon, cacheKey).catch(() => {});
          return parsedData;
        }
      } catch {
        // Ignore SQLite errors, continue to API
      }

      // No cache at all - must fetch from API
      const result = await fetchWeatherFromApi(lat, lon, cacheKey);
      return result;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Henter vejr + marine data fra Open-Meteo (~200ms parallelt).
 * Bruger DMI's eget HARMONIE-model via Open-Meteo (dmi_seamless, 2km opløsning).
 */
async function fetchWeatherFromApi(
  lat: number,
  lon: number,
  cacheKey: string
): Promise<EdrForecast | null> {
  // 2 parallelle requests (~200ms hver, parallelt = ~250ms total)
  const weatherUrl = `${OPEN_METEO_WEATHER}?latitude=${lat}&longitude=${lon}`
    + `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,`
    + `relative_humidity_2m,surface_pressure,cloud_cover,precipitation,`
    + `dew_point_2m,visibility,uv_index`
    + `&wind_speed_unit=ms&forecast_days=3&timezone=auto`
    + `&apikey=${OPEN_METEO_API_KEY}`
    + `&models=dmi_seamless`;

  const marineUrl = `${OPEN_METEO_MARINE}?latitude=${lat}&longitude=${lon}`
    + `&hourly=wave_height,wave_period,wave_direction,`
    + `ocean_current_velocity,ocean_current_direction,`
    + `sea_surface_temperature,sea_level_height_msl`
    + `&forecast_days=3&timezone=auto`
    + `&apikey=${OPEN_METEO_API_KEY}`;

  const [weather, marine] = await Promise.all([
    fetchOpenMeteo(weatherUrl),
    fetchOpenMeteo(marineUrl),
  ]);

  const result: EdrForecast = {
    airTempSeries: [],
    windSpeedSeries: [],
    windDirSeries: [],
    gustWindSeries: [],
    waterLevelSeries: [],
    waveHeightSeries: [],
    wavePeriodSeries: [],
    waveDirSeries: [],
    waterTempSeries: [],
    currentSpeedSeries: [],
    humiditySeries: [],
    pressureSeries: [],
    cloudCoverSeries: [],
    precipitationSeries: [],
    dewPointSeries: [],
    visibilitySeries: [],
    uvIndexSeries: [],
  };

  // 1) Parse vejrdata (Open-Meteo: °C, m/s, hPa, %, mm direkte)
  if (weather?.hourly?.time) {
    const h = weather.hourly;
    const times = h.time as string[];
    const temp = h.temperature_2m as (number | null)[] | undefined;
    const wind = h.wind_speed_10m as (number | null)[] | undefined;
    const wdir = h.wind_direction_10m as (number | null)[] | undefined;
    const gust = h.wind_gusts_10m as (number | null)[] | undefined;
    const hum = h.relative_humidity_2m as (number | null)[] | undefined;
    const pres = h.surface_pressure as (number | null)[] | undefined;
    const cloud = h.cloud_cover as (number | null)[] | undefined;
    const precip = h.precipitation as (number | null)[] | undefined;
    const dew = h.dew_point_2m as (number | null)[] | undefined;
    const vis = h.visibility as (number | null)[] | undefined;
    const uvi = h.uv_index as (number | null)[] | undefined;

    for (let i = 0; i < times.length; i++) {
      const ts = new Date(times[i]).getTime();
      if (!Number.isFinite(ts)) continue;

      if (temp?.[i] != null) result.airTempSeries.push({ ts, v: temp[i]! });
      if (wind?.[i] != null) result.windSpeedSeries.push({ ts, v: wind[i]! });
      if (wdir?.[i] != null) result.windDirSeries.push({ ts, v: wdir[i]! });
      if (gust?.[i] != null) result.gustWindSeries.push({ ts, v: gust[i]! });
      if (hum?.[i] != null) result.humiditySeries.push({ ts, v: hum[i]! });
      if (pres?.[i] != null) result.pressureSeries.push({ ts, v: pres[i]! });
      if (cloud?.[i] != null) result.cloudCoverSeries.push({ ts, v: cloud[i]! });
      if (precip?.[i] != null) result.precipitationSeries.push({ ts, v: precip[i]! });
      if (dew?.[i] != null) result.dewPointSeries.push({ ts, v: dew[i]! });
      if (vis?.[i] != null) result.visibilitySeries.push({ ts, v: vis[i]! / 1000 }); // m → km
      if (uvi?.[i] != null) result.uvIndexSeries.push({ ts, v: uvi[i]! });
    }
  }

  // 2) Parse marine data (bølger, vandtemp, vandstand, havstrøm)
  if (marine?.hourly?.time) {
    const m = marine.hourly;
    const times = m.time as string[];
    const waveH = m.wave_height as (number | null)[] | undefined;
    const waveP = m.wave_period as (number | null)[] | undefined;
    const waveD = m.wave_direction as (number | null)[] | undefined;
    const sst = m.sea_surface_temperature as (number | null)[] | undefined;
    const level = m.sea_level_height_msl as (number | null)[] | undefined;
    const curVel = m.ocean_current_velocity as (number | null)[] | undefined;

    for (let i = 0; i < times.length; i++) {
      const ts = new Date(times[i]).getTime();
      if (!Number.isFinite(ts)) continue;

      if (waveH?.[i] != null) result.waveHeightSeries.push({ ts, v: waveH[i]! });
      if (waveP?.[i] != null) result.wavePeriodSeries.push({ ts, v: waveP[i]! });
      if (waveD?.[i] != null) result.waveDirSeries.push({ ts, v: waveD[i]! });
      if (sst?.[i] != null) result.waterTempSeries.push({ ts, v: sst[i]! });
      if (level?.[i] != null) result.waterLevelSeries.push({ ts, v: level[i]! * 100 }); // m → cm
      if (curVel?.[i] != null) result.currentSpeedSeries.push({ ts, v: curVel[i]! / 3.6 }); // km/h → m/s
    }
  }

  // Store in memory cache
  memoryCache.set(cacheKey, { data: result, ts: Date.now() });

  // Store in SQLite cache (non-blocking)
  setCachedWeather(lat, lon, JSON.stringify(result)).catch(() => {});

  return result;
}

/**
 * STAC – pt. kun stub, så du kan bygge videre senere,
 * uden at app'en fejler på import.
 */
export async function getStacForecastForPoint(
  lat: number,
  lon: number
): Promise<PointStacForecast> {
  // Her kan du senere koble til forecastdata/STAC hvis du får brug for fil-lister.
  return { harmonieFiles: [], dkssFiles: [] };
}
