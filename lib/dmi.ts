// lib/dmi.ts
// Samler Climate + Ocean til én evaluering
// OPTIMIZED: SQLite persistent cache, request coalescing, stale-while-revalidate

import { fetchClimateForTrip, ClimateStats } from "./dmiClimate";
import { fetchOceanForTrip, OceanStats, OCEAN_STATIONS_DK, OceanStation } from "./dmiOcean";
import { DMI_EDR_BASE_URL } from "./dmiConfig";
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

// Warm-up flag - undgå gentagne warm-up kald
let proxyWarmedUp = false;

/**
 * Pre-warm proxy Cloud Function + SQLite cache for faster first call.
 * Call this at app start to reduce cold-start latency.
 */
export async function warmUpDmiProxy(): Promise<void> {
  if (proxyWarmedUp || !DMI_EDR_BASE_URL) return;
  proxyWarmedUp = true;

  // Warm up both proxy and SQLite in parallel
  await Promise.all([
    // 1. Proxy warm-up
    (async () => {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        await fetch(`${DMI_EDR_BASE_URL}?target=/collections`, {
          method: "GET",
          signal: controller.signal,
        });
      } catch {
        // Ignore errors - this is just for warm-up
      }
    })(),

    // 2. SQLite warm-up (triggers DB initialization)
    (async () => {
      try {
        await getCacheStats();
      } catch {
        // Ignore errors
      }
    })(),
  ]);
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

  // Lufttryk og fugtighed stats
  pressureHPa?: Stat;
  humidityPct?: Stat;

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

  // Beregn varighed og udvid til minimum 2 timer hvis nødvendigt
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const durationMs = endMs - startMs;
  const MIN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 timer i ms

  let effectiveStartMs: number;
  let effectiveEndMs: number;

  if (durationMs < MIN_DURATION_MS) {
    // Udvid tidsintervallet til 2 timer, centreret omkring turen
    const centerMs = startMs + durationMs / 2;
    const halfMinDuration = MIN_DURATION_MS / 2;
    effectiveStartMs = centerMs - halfMinDuration;
    effectiveEndMs = centerMs + halfMinDuration;
  } else {
    effectiveStartMs = startMs;
    effectiveEndMs = endMs;
  }

  // Rund til hele timer for at matche DMI Climate API's timebaserede data
  effectiveStartMs = floorToHour(effectiveStartMs);
  effectiveEndMs = ceilToHour(effectiveEndMs);

  // DMI Climate data har ca. 1-2 timers forsinkelse.
  // Hvis vi spørger for tæt på "nu", får vi ingen data.
  // Sørg for at starte mindst 2 timer før nuværende tid.
  const nowMs = Date.now();
  const twoHoursAgo = floorToHour(nowMs - 2 * 60 * 60 * 1000);
  if (effectiveStartMs > twoHoursAgo) {
    effectiveStartMs = twoHoursAgo;
  }

  const effectiveStartIso = new Date(effectiveStartMs).toISOString();
  const effectiveEndIso = new Date(effectiveEndMs).toISOString();

  // OPTIMIZED: Fetch climate and ocean data in PARALLEL instead of sequential
  const [climateResult, oceanResult] = await Promise.allSettled([
    fetchClimateForTrip({ startIso: effectiveStartIso, endIso: effectiveEndIso, lat, lon }),
    fetchOceanForTrip({ startIso: effectiveStartIso, endIso: effectiveEndIso, lat, lon }),
  ]);

  const climate: ClimateStats | null = climateResult.status === 'fulfilled' ? climateResult.value : null;
  const ocean: OceanStats | null = oceanResult.status === 'fulfilled' ? oceanResult.value : null;

  const evalRes: DmiEvaluation = {
    source: "DMI",
  };

  const notes: string[] = [];

  if (!climate && !ocean) {
    evalRes.note = "Ingen DMI klima- eller ocean-data fundet for denne tur.";
    return evalRes;
  }
  if (!climate) notes.push("Ingen DMI klimadata fundet.");
  if (!ocean) notes.push("Ingen DMI ocean-data fundet.");
  if (notes.length) {
    evalRes.note = notes.join(" ");
  }

  // Climate -> DmiEvaluation
  if (climate) {
    if (climate.airTempC) evalRes.airTempC = climate.airTempC;
    if (climate.windMS) evalRes.windMS = climate.windMS;
    if (climate.windDirDeg) evalRes.windDirDeg = climate.windDirDeg;
    if (climate.pressureHPa) evalRes.pressureHPa = climate.pressureHPa;
    if (climate.humidityPct) evalRes.humidityPct = climate.humidityPct;

    if (climate.series && climate.series.length) {
      evalRes.airTempSeries = climate.series
        .filter((p) => typeof p.airTempC === "number")
        .map((p) => ({ ts: p.ts, v: p.airTempC as number }));

      evalRes.windSpeedSeries = climate.series
        .filter((p) => typeof p.windMS === "number")
        .map((p) => ({ ts: p.ts, v: p.windMS as number }));

      evalRes.pressureSeries = climate.series
        .filter((p) => typeof p.pressureHPa === "number")
        .map((p) => ({ ts: p.ts, v: p.pressureHPa as number }));

      evalRes.humiditySeries = climate.series
        .filter((p) => typeof p.humidityPct === "number")
        .map((p) => ({ ts: p.ts, v: p.humidityPct as number }));
    }

    if (climate.stationName) evalRes.stationName = climate.stationName;
    if (climate.stationId) evalRes.stationId = climate.stationId;
  }

  // Ocean -> DmiEvaluation
  if (ocean) {
    if (ocean.waterTempC) evalRes.waterTempC = ocean.waterTempC;
    if (ocean.waterLevelCM) evalRes.waterLevelCM = ocean.waterLevelCM;

    if (ocean.stationName) evalRes.oceanStationName = ocean.stationName;
    if (ocean.stationId) evalRes.oceanStationId = ocean.stationId;

    if (ocean.series && ocean.series.length) {
      evalRes.waterTempSeries = ocean.series
        .filter((p) => typeof p.waterTempC === "number")
        .map((p) => ({ ts: p.ts, v: p.waterTempC as number }));

      evalRes.waterLevelSeries = ocean.series
        .filter((p) => typeof p.waterLevelCM === "number")
        .map((p) => ({ ts: p.ts, v: p.waterLevelCM as number }));
    }
  }

  // --- NYT: kyst-/vindrelation baseret på GPS-track ---
  if (evalRes.windDirDeg?.avg != null) {
    const cw = computeCoastWindInfo(points, evalRes.windDirDeg.avg);
    if (cw) {
      evalRes.coastWind = cw;
    }
  }

  return evalRes;
}

// --- Forecast EDR (DMI punktprognose via Cloud Function proxy) ---

const EDR_BASE_URL = DMI_EDR_BASE_URL;

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
  waterLevelSeries: Serie[];
  waveHeightSeries: Serie[];
  currentSpeedSeries: Serie[];
  humiditySeries: Serie[];
  pressureSeries: Serie[];
  cloudCoverSeries: Serie[];
  precipitationSeries: Serie[];  // Nedbør i mm
  oceanFallbackStation?: string; // Navn på station hvis ocean-data kom fra fallback
};

/**
 * Fælles helper til EDR-kald via proxy.
 * OPTIMIZED: Tilføjet timeout så langsomme requests ikke blokerer.
 */
async function fetchEdrData(pathAndQuery: string, timeoutMs: number = 8000) {
  try {
    if (!EDR_BASE_URL) {
      return null;
    }

    const proxyUrl = `${EDR_BASE_URL}?target=${encodeURIComponent(
      pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`
    )}`;

    // Timeout med AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(proxyUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return null;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timeoutId);
      return null;
    }
  } catch (e) {
    return null;
  }
}

/**
 * Tjekker om HARMONIE CoverageJSON har gyldige data.
 */
function harmonieHasData(result: DmiCoverageJson | null): boolean {
  if (!result?.domain?.axes?.t?.values?.length) return false;
  if (!result?.ranges) return false;

  const ranges = result.ranges;
  for (const key of Object.keys(ranges)) {
    const vals = ranges[key]?.values;
    if (vals && vals.length > 0 && vals.some(v => v != null)) {
      return true;
    }
  }
  return false;
}

/**
 * Tjekker om ocean GeoJSON har gyldige data.
 */
function oceanGeoJsonHasData(result: DmiGeoJsonResponse | null, paramName: string): boolean {
  if (!result?.features?.length) return false;
  return result.features.some(f => f.properties?.[paramName] != null);
}

/**
 * Henter ALT vejr- og havdata.
 * Simpel implementering: prøver original koordinat først,
 * og kun ÉN fallback koordinat (~3km mod havet) hvis data mangler.
 */
async function fetchAllDataWithNearbySearch(
  lat: number,
  lon: number
): Promise<{
  harmonieMain: DmiCoverageJson | null;
  harmonieExtras: DmiCoverageJson | null;
  waterLevel: DmiGeoJsonResponse | null;
  waveHeight: DmiGeoJsonResponse | null;
  nearbyInfo: {
    weatherNearby: boolean;
    oceanNearby: boolean;
  };
}> {
  const geoOpts = "&crs=crs84&f=GeoJSON";
  const covOpts = "&crs=crs84&f=CoverageJSON";
  const coords = `coords=POINT(${lon.toFixed(4)} ${lat.toFixed(4)})`;

  // 1) Hent alle data fra original koordinat parallelt (4 requests)
  const [harmonieMain, harmonieExtras, waterLevel, waveHeight] = await Promise.all([
    fetchEdrData(`/collections/harmonie_dini_sf/position?${coords}&parameter-name=temperature-2m,wind-speed,wind-dir${covOpts}`) as Promise<DmiCoverageJson | null>,
    fetchEdrData(`/collections/harmonie_dini_sf/position?${coords}&parameter-name=total-precipitation,relative-humidity-2m,total-cloud-cover${covOpts}`) as Promise<DmiCoverageJson | null>,
    fetchEdrData(`/collections/dkss_nsbs/position?${coords}&parameter-name=sea-mean-deviation${geoOpts}`) as Promise<DmiGeoJsonResponse | null>,
    fetchEdrData(`/collections/wam_nsb/position?${coords}&parameter-name=significant-wave-height${geoOpts}`) as Promise<DmiGeoJsonResponse | null>,
  ]);

  // Tjek hvad vi mangler
  const hasWeather = harmonieHasData(harmonieMain);
  const hasWaterLevel = oceanGeoJsonHasData(waterLevel, "sea-mean-deviation");
  const hasWaveHeight = oceanGeoJsonHasData(waveHeight, "significant-wave-height");

  // Hvis vi har alt, returner med det samme
  if (hasWeather && hasWaterLevel && hasWaveHeight) {
    return {
      harmonieMain,
      harmonieExtras,
      waterLevel,
      waveHeight,
      nearbyInfo: { weatherNearby: false, oceanNearby: false },
    };
  }

  // 2) Prøv ÉN fallback koordinat (~3km mod syd-øst, typisk mod havet i DK)
  const fallbackLat = lat - 0.03;
  const fallbackLon = lon + 0.03;
  const fallbackCoords = `coords=POINT(${fallbackLon.toFixed(4)} ${fallbackLat.toFixed(4)})`;

  // Kun hent det vi mangler
  const fallbackPromises: Promise<unknown>[] = [];
  const fallbackTypes: string[] = [];

  if (!hasWeather) {
    fallbackPromises.push(
      fetchEdrData(`/collections/harmonie_dini_sf/position?${fallbackCoords}&parameter-name=temperature-2m,wind-speed,wind-dir${covOpts}`)
    );
    fallbackTypes.push("weather");
  }
  if (!hasWaterLevel) {
    fallbackPromises.push(
      fetchEdrData(`/collections/dkss_nsbs/position?${fallbackCoords}&parameter-name=sea-mean-deviation${geoOpts}`)
    );
    fallbackTypes.push("waterLevel");
  }
  if (!hasWaveHeight) {
    fallbackPromises.push(
      fetchEdrData(`/collections/wam_nsb/position?${fallbackCoords}&parameter-name=significant-wave-height${geoOpts}`)
    );
    fallbackTypes.push("waveHeight");
  }

  const fallbackResults = await Promise.all(fallbackPromises);

  // Saml resultater
  let finalWeather = harmonieMain;
  let finalExtras = harmonieExtras;
  let finalWaterLevel = waterLevel;
  let finalWaveHeight = waveHeight;
  let weatherNearby = false;
  let oceanNearby = false;

  fallbackTypes.forEach((type, i) => {
    const result = fallbackResults[i];
    if (type === "weather" && harmonieHasData(result as DmiCoverageJson)) {
      finalWeather = result as DmiCoverageJson;
      weatherNearby = true;
    } else if (type === "waterLevel" && oceanGeoJsonHasData(result as DmiGeoJsonResponse, "sea-mean-deviation")) {
      finalWaterLevel = result as DmiGeoJsonResponse;
      oceanNearby = true;
    } else if (type === "waveHeight" && oceanGeoJsonHasData(result as DmiGeoJsonResponse, "significant-wave-height")) {
      finalWaveHeight = result as DmiGeoJsonResponse;
      oceanNearby = true;
    }
  });

  // Hent ekstra vejrparametre fra fallback hvis vejret kom derfra
  if (weatherNearby && finalWeather) {
    finalExtras = await fetchEdrData(
      `/collections/harmonie_dini_sf/position?${fallbackCoords}&parameter-name=total-precipitation,relative-humidity-2m,total-cloud-cover${covOpts}`
    ) as DmiCoverageJson | null;
  }

  return {
    harmonieMain: finalWeather,
    harmonieExtras: finalExtras,
    waterLevel: finalWaterLevel,
    waveHeight: finalWaveHeight,
    nearbyInfo: { weatherNearby, oceanNearby },
  };
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
      // L2: Check SQLite cache (async, non-blocking)
      try {
        const sqliteCached = await getCachedWeather(lat, lon);
        if (sqliteCached && !sqliteCached.isStale) {
          const parsedData = JSON.parse(sqliteCached.data) as EdrForecast;
          memoryCache.set(cacheKey, { data: parsedData, ts: Date.now() });
          return parsedData;
        }
      } catch {
        // Ignore SQLite errors, continue to API
      }

      // Fetch from API
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
 * Actual API fetch - søger i nærliggende koordinater hvis data mangler.
 */
async function fetchWeatherFromApi(
  lat: number,
  lon: number,
  cacheKey: string
): Promise<EdrForecast | null> {
  // Hent data med automatisk søgning i nærliggende koordinater
  const allData = await fetchAllDataWithNearbySearch(lat, lon);

  const harmonieJson = allData.harmonieMain;
  const extrasJson = allData.harmonieExtras;
  const waterLevelJson = allData.waterLevel;
  const waveHeightJson = allData.waveHeight;

  const result: EdrForecast = {
    airTempSeries: [],
    windSpeedSeries: [],
    windDirSeries: [],
    waterLevelSeries: [],
    waveHeightSeries: [],
    currentSpeedSeries: [],
    humiditySeries: [],
    pressureSeries: [],
    cloudCoverSeries: [],
    precipitationSeries: [],
  };

  // 1) Vejr (HARMONIE - CoverageJSON)
  const parseCoverage = (json: DmiCoverageJson | null, seriesHandler: (ts: number, ranges: DmiCoverageRanges, i: number, keys: Record<string, string | undefined>) => void) => {
    if (
      !json ||
      !json.domain ||
      !json.domain.axes ||
      !json.domain.axes.t ||
      !Array.isArray(json.domain.axes.t.values) ||
      !json.ranges
    ) {
      return;
    }
    const times: string[] = json.domain.axes.t.values;
    const ranges = json.ranges;
    const keys: Record<string, string | undefined> = {
      tempKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("temperature")
      ),
      windKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("wind-speed")
      ),
      dirKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("wind-dir")
      ),
      humidityKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("humidity")
      ),
      pressureKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("pressure")
      ),
      cloudKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("cloud")
      ),
      precipKey: Object.keys(ranges).find((k) =>
        k.toLowerCase().includes("precip") || k.toLowerCase().includes("rain")
      ),
    };

    times.forEach((t, i) => {
      const ts = new Date(t).getTime();
      seriesHandler(ts, ranges, i, keys);
    });
  };

  // Temp/vind + fugt/tryk/skydække hvis tilgængeligt
  // Prøv CoverageJSON format først
  parseCoverage(harmonieJson, (ts, ranges, i, keys) => {
    if (keys.tempKey && ranges[keys.tempKey]?.values?.[i] != null) {
      let val = ranges[keys.tempKey]!.values![i] as number;
      if (val > 200) val -= 273.15;
      result.airTempSeries.push({ ts, v: val });
    }
    if (keys.windKey && ranges[keys.windKey]?.values?.[i] != null) {
      const val = ranges[keys.windKey]!.values![i] as number;
      result.windSpeedSeries.push({ ts, v: val });
    }
    if (keys.dirKey && ranges[keys.dirKey]?.values?.[i] != null) {
      const val = ranges[keys.dirKey]!.values![i] as number;
      result.windDirSeries.push({ ts, v: val });
    }
    if (keys.humidityKey && ranges[keys.humidityKey]?.values?.[i] != null) {
      const raw = ranges[keys.humidityKey]!.values![i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.humiditySeries.push({ ts, v: val });
    }
    if (keys.pressureKey && ranges[keys.pressureKey]?.values?.[i] != null) {
      let val = ranges[keys.pressureKey]!.values![i] as number;
      if (val > 2000) val = val / 100;
      result.pressureSeries.push({ ts, v: val });
    }
    if (keys.cloudKey && ranges[keys.cloudKey]?.values?.[i] != null) {
      const raw = ranges[keys.cloudKey]!.values![i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.cloudCoverSeries.push({ ts, v: val });
    }
    if (keys.precipKey && ranges[keys.precipKey]?.values?.[i] != null) {
      const raw = ranges[keys.precipKey]!.values![i] as number;
      // precipitation-rate er typisk i kg/m²/s, konverter til mm/h
      // 1 kg/m²/s = 3600 mm/h
      const val = raw < 0.01 ? raw * 3600 : raw;
      result.precipitationSeries.push({ ts, v: val });
    }
  });

  // Parse ekstra vejrparametre (nedbør, fugt, sky) fra separat request
  parseCoverage(extrasJson, (ts, ranges, i, keys) => {
    if (keys.humidityKey && ranges[keys.humidityKey]?.values?.[i] != null) {
      const raw = ranges[keys.humidityKey]!.values![i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.humiditySeries.push({ ts, v: val });
    }
    if (keys.cloudKey && ranges[keys.cloudKey]?.values?.[i] != null) {
      const raw = ranges[keys.cloudKey]!.values![i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.cloudCoverSeries.push({ ts, v: val });
    }
    if (keys.precipKey && ranges[keys.precipKey]?.values?.[i] != null) {
      const raw = ranges[keys.precipKey]!.values![i] as number;
      const val = raw < 0.01 ? raw * 3600 : raw;
      result.precipitationSeries.push({ ts, v: val });
    }
  });

  // 2) Vandstand (DKSS)
  if (waterLevelJson && Array.isArray(waterLevelJson.features)) {
    waterLevelJson.features.forEach((f: DmiGeoJsonFeature) => {
      const props = f.properties || {};
      const ts = Date.parse(
        String(props.datetime ??
          props.step ??
          props.time ??
          props.timestamp ??
          props.validTime ??
          "")
      );

      // DMI kan kalde den både ved navn og intern kode
      const val =
        props["sea-mean-deviation"] !== undefined
          ? props["sea-mean-deviation"]
          : props["82-0.0-1"];

      if (Number.isFinite(ts) && typeof val === "number" && !Number.isNaN(val)) {
        // m → cm
        result.waterLevelSeries.push({ ts, v: val * 100 });
      }
    });

    result.waterLevelSeries.sort((a, b) => a.ts - b.ts);
  }

  // 3) Bølger (WAM)
  if (waveHeightJson && Array.isArray(waveHeightJson.features)) {
    waveHeightJson.features.forEach((f: DmiGeoJsonFeature) => {
      const props = f.properties || {};
      const ts = Date.parse(
        String(props.datetime ??
          props.step ??
          props.time ??
          props.timestamp ??
          props.validTime ??
          "")
      );
      const val = props["significant-wave-height"];

      if (Number.isFinite(ts) && typeof val === "number" && !Number.isNaN(val)) {
        // m
        result.waveHeightSeries.push({ ts, v: val });
      }
    });

    result.waveHeightSeries.sort((a, b) => a.ts - b.ts);
  }

  // Tilføj info hvis data kom fra nærliggende koordinater
  if (allData.nearbyInfo.oceanNearby) {
    result.oceanFallbackStation = "nærliggende position";
  }

  // OPTIMIZED: All weather parameters (incl. precipitation, clouds, humidity) are fetched in one request
  // and parsed automatically by parseCoverage above - no separate requests necessary

  // Store in memory cache (instant access)
  memoryCache.set(cacheKey, { data: result, ts: Date.now() });

  // Store in SQLite cache (non-blocking, fire and forget)
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
