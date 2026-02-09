// lib/dmi.ts
// Samler Climate + Ocean til én evaluering

import { fetchClimateForTrip, ClimateStats } from "./dmiClimate";
import { fetchOceanForTrip, OceanStats } from "./dmiOcean";
import { DMI_EDR_BASE_URL } from "./dmiConfig";

// Enkel cache (kort TTL) til spot-EDR, så gentagne opslag ikke kalder API'et konstant
const edrCache: Map<
  string,
  { data: EdrForecast | null; ts: number; ttl: number }
> = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min

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

  let climate: ClimateStats | null = null;
  let ocean: OceanStats | null = null;

  try {
    climate = await fetchClimateForTrip({ startIso, endIso, lat, lon });
  } catch (e) {
    console.log("Fejl i fetchClimateForTrip:", e);
  }

  try {
    ocean = await fetchOceanForTrip({ startIso, endIso, lat, lon });
  } catch (e) {
    console.log("Fejl i fetchOceanForTrip:", e);
  }

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

    if (climate.series && climate.series.length) {
      evalRes.airTempSeries = climate.series
        .filter((p) => typeof p.airTempC === "number")
        .map((p) => ({ ts: p.ts, v: p.airTempC as number }));

      evalRes.windSpeedSeries = climate.series
        .filter((p) => typeof p.windMS === "number")
        .map((p) => ({ ts: p.ts, v: p.windMS as number }));
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
};

/**
 * Fælles helper til EDR-kald via proxy.
 */
async function fetchEdrData(pathAndQuery: string) {
  try {
    if (!EDR_BASE_URL) {
      console.log("EDR proxy URL mangler");
      return null;
    }

    const proxyUrl = `${EDR_BASE_URL}?target=${encodeURIComponent(
      pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`
    )}`;

    console.log("[dmiEdr] fetch", proxyUrl);

    const res = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("EDR fejlstatus:", res.status, proxyUrl);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.log("EDR fetch-fejl:", (e as Error)?.message || e, pathAndQuery);
    return null;
  }
}

/**
 * Henter Vejr (HARMONIE) som CoverageJSON.
 */
async function fetchHarmonieData(pointCoords: string, params: string) {
  // Prøv først CoverageJSON, fallback til GeoJSON
  const targetCoverage =
    `/collections/harmonie_dini_sf/position?${pointCoords}` +
    `&parameter-name=${params}&crs=crs84&f=CoverageJSON`;

  const coverageResult = await fetchEdrData(targetCoverage);
  if (coverageResult && coverageResult.domain) {
    return coverageResult;
  }

  // Fallback: prøv GeoJSON format
  const targetGeo =
    `/collections/harmonie_dini_sf/position?${pointCoords}` +
    `&parameter-name=${params}&crs=crs84&f=GeoJSON`;
  return fetchEdrData(targetGeo);
}

/**
 * Henter Hav (DKSS/WAM) som GeoJSON (vandstand + bølger).
 * Optimeret: kun 2 requests i stedet for 3
 */
export async function fetchOceanAndWaveData(pointCoords: string) {
  const opts = "&crs=crs84&f=GeoJSON";

  // Kun nsbs (mest dækkende) + bølger - parallelt
  const [dkss, wam] = await Promise.all([
    fetchEdrData(
      `/collections/dkss_nsbs/position?${pointCoords}&parameter-name=sea-mean-deviation${opts}`
    ),
    fetchEdrData(
      `/collections/wam_nsb/position?${pointCoords}&parameter-name=significant-wave-height${opts}`
    ),
  ]);

  return {
    waterLevelResult: dkss || null,
    waveHeightResult: wam || null,
  };
}

/**
 * Punktprognose til SpotWeather (luft, vind, vandstand, bølger).
 */
export async function getSpotForecastEdr(
  lat: number,
  lon: number
): Promise<EdrForecast | null> {
  // Brug cache for hurtigere gentagne opslag
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = edrCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return cached.data;
  }

  const pointCoords = `coords=POINT(${lon.toFixed(4)} ${lat.toFixed(4)})`;

  // Kør ALLE requests parallelt - kun 3 kald total for maksimal hastighed
  const [harmonieJson, oceanData] = await Promise.all([
    // temp, vind (cloud-cover er ikke tilgængelig i harmonie_dini_sf)
    fetchHarmonieData(pointCoords, "temperature-2m,wind-speed,wind-dir"),
    // ocean + bølger direkte (ingen fallback for hastighed)
    fetchOceanAndWaveData(pointCoords),
  ]);

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
  };

  // 1) Vejr (HARMONIE - CoverageJSON)
  const parseCoverage = (json: any, seriesHandler: (ts: number, ranges: any, i: number, keys: Record<string, string | undefined>) => void) => {
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
      let val = ranges[keys.tempKey].values[i] as number;
      if (val > 200) val -= 273.15;
      result.airTempSeries.push({ ts, v: val });
    }
    if (keys.windKey && ranges[keys.windKey]?.values?.[i] != null) {
      const val = ranges[keys.windKey].values[i] as number;
      result.windSpeedSeries.push({ ts, v: val });
    }
    if (keys.dirKey && ranges[keys.dirKey]?.values?.[i] != null) {
      const val = ranges[keys.dirKey].values[i] as number;
      result.windDirSeries.push({ ts, v: val });
    }
    if (keys.humidityKey && ranges[keys.humidityKey]?.values?.[i] != null) {
      const raw = ranges[keys.humidityKey].values[i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.humiditySeries.push({ ts, v: val });
    }
    if (keys.pressureKey && ranges[keys.pressureKey]?.values?.[i] != null) {
      let val = ranges[keys.pressureKey].values[i] as number;
      if (val > 2000) val = val / 100;
      result.pressureSeries.push({ ts, v: val });
    }
    if (keys.cloudKey && ranges[keys.cloudKey]?.values?.[i] != null) {
      const raw = ranges[keys.cloudKey].values[i] as number;
      const val = raw > 1 ? raw : raw * 100;
      result.cloudCoverSeries.push({ ts, v: val });
    }
  });

  // Fallback: prøv GeoJSON format hvis CoverageJSON ikke gav data
  if (
    result.airTempSeries.length === 0 &&
    harmonieJson &&
    Array.isArray(harmonieJson.features)
  ) {
    harmonieJson.features.forEach((f: any) => {
      const props = f.properties || {};
      const ts = Date.parse(
        props.datetime ?? props.step ?? props.time ?? props.timestamp ?? ""
      );
      if (!Number.isFinite(ts)) return;

      // Temperatur
      const temp =
        props["temperature-2m"] ?? props["temperature_2m"] ?? props.temperature;
      if (typeof temp === "number" && !Number.isNaN(temp)) {
        let val = temp;
        if (val > 200) val -= 273.15;
        result.airTempSeries.push({ ts, v: val });
      }

      // Vind hastighed
      const windSpeed =
        props["wind-speed"] ?? props["wind_speed"] ?? props.windSpeed;
      if (typeof windSpeed === "number" && !Number.isNaN(windSpeed)) {
        result.windSpeedSeries.push({ ts, v: windSpeed });
      }

      // Vind retning
      const windDir = props["wind-dir"] ?? props["wind_dir"] ?? props.windDir;
      if (typeof windDir === "number" && !Number.isNaN(windDir)) {
        result.windDirSeries.push({ ts, v: windDir });
      }

      // Skydække
      const cloud =
        props["cloud-cover"] ?? props["cloud_cover"] ?? props.cloudCover;
      if (typeof cloud === "number" && !Number.isNaN(cloud)) {
        const val = cloud > 1 ? cloud : cloud * 100;
        result.cloudCoverSeries.push({ ts, v: val });
      }
    });

    // Sortér serier
    result.airTempSeries.sort((a, b) => a.ts - b.ts);
    result.windSpeedSeries.sort((a, b) => a.ts - b.ts);
    result.windDirSeries.sort((a, b) => a.ts - b.ts);
    result.cloudCoverSeries.sort((a, b) => a.ts - b.ts);
  }

  // 2) Vandstand/bølger
  const dkss = oceanData?.waterLevelResult;
  if (dkss && Array.isArray(dkss.features)) {
    dkss.features.forEach((f: any) => {
      const props = f.properties || {};
      const ts = Date.parse(
        props.datetime ??
          props.step ??
          props.time ??
          props.timestamp ??
          props.validTime ??
          ""
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

  // 3) Bølger (WAM - GeoJSON)
  const wam = oceanData?.waveHeightResult;
  if (wam && Array.isArray(wam.features)) {
    wam.features.forEach((f: any) => {
      const props = f.properties || {};
      const ts = Date.parse(
        props.datetime ??
          props.step ??
          props.time ??
          props.timestamp ??
          props.validTime ??
          ""
      );
      const val = props["significant-wave-height"];

      if (Number.isFinite(ts) && typeof val === "number" && !Number.isNaN(val)) {
        // m
        result.waveHeightSeries.push({ ts, v: val });
      }
    });

    result.waveHeightSeries.sort((a, b) => a.ts - b.ts);
  }

  // Gem i cache
  edrCache.set(cacheKey, { data: result, ts: Date.now(), ttl: DEFAULT_TTL_MS });

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
