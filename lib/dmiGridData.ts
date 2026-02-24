// lib/dmiGridData.ts
// Simple, fast grid data fetching for ocean overlays

import { DMI_EDR_BASE_URL } from "./dmiConfig";
// TEMP disabled: import { filterSeaPoints, isLandDataLoaded } from "./coastCutter";

// --- Types ---

export interface GridCell {
  lat: number;
  lng: number;
}

export interface CurrentCell extends GridCell {
  speed: number;
  direction: number;
}

export interface CurrentPolygonCell extends GridCell {
  speed: number;
  latDelta: number;
  lngDelta: number;
}

export interface SalinityCell extends GridCell {
  salinity: number;
  latDelta?: number;
  lngDelta?: number;
}

export interface WaveCell extends GridCell {
  height: number;
  latDelta?: number;
  lngDelta?: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface OceanGridData {
  timestamp: number;
  forecastTime: string;
  currents: CurrentCell[];
  currentPolygons: CurrentPolygonCell[];
  salinity: SalinityCell[];
  waves: WaveCell[];
  bounds: BoundingBox;
}

export interface FetchGridOptions {
  includeCurrents?: boolean;
  includeSalinity?: boolean;
  includeWaves?: boolean;
  /** ISO timestamp for prognose-tidspunkt (default: næste hele time) */
  datetime?: string;
}

// --- Color scales ---

export const CURRENT_COLORS = [
  "#1e3a5f", "#1e4d7a", "#1e6091", "#2073a8", "#2586bf",
  "#3399cc", "#47b3a0", "#5cc974", "#7dd94d", "#a8e026",
  "#d4e600", "#f0c800", "#f5a000", "#f57600", "#f54040",
];

export const SALINITY_COLORS = [
  "rgba(16, 185, 129, 0.75)", "rgba(34, 197, 94, 0.75)", "rgba(74, 222, 128, 0.75)",
  "rgba(134, 239, 172, 0.75)", "rgba(147, 197, 253, 0.75)", "rgba(96, 165, 250, 0.75)",
  "rgba(59, 130, 246, 0.75)", "rgba(99, 102, 241, 0.75)", "rgba(139, 92, 246, 0.75)",
  "rgba(168, 85, 247, 0.75)", "rgba(217, 70, 239, 0.75)", "rgba(244, 114, 182, 0.75)",
  "rgba(251, 146, 60, 0.75)", "rgba(249, 115, 22, 0.75)", "rgba(239, 68, 68, 0.75)",
];

// Bølge farver: grøn (rolig) -> gul -> orange -> rød (høje bølger)
export const WAVE_COLORS = [
  "rgba(34, 197, 94, 0.7)", "rgba(74, 222, 128, 0.7)", "rgba(134, 239, 172, 0.7)",
  "rgba(250, 204, 21, 0.7)", "rgba(234, 179, 8, 0.7)", "rgba(202, 138, 4, 0.7)",
  "rgba(249, 115, 22, 0.7)", "rgba(234, 88, 12, 0.7)", "rgba(194, 65, 12, 0.7)",
  "rgba(239, 68, 68, 0.7)", "rgba(220, 38, 38, 0.7)", "rgba(185, 28, 28, 0.7)",
];

export function getCurrentSpeedColor(speed: number): string {
  // speed in m/s, 0-5 km/h range med stejl kurve (gul ved ~1 km/h)
  const speedKmh = speed * 3.6;
  // Power 0.25 giver stejl kurve i starten: gul ved 1 km/h, rød ved 5 km/h
  const normalized = Math.min(1, speedKmh / 5.0);
  const idx = Math.min(14, Math.floor(Math.pow(normalized, 0.25) * 14));
  return CURRENT_COLORS[idx];
}

export function getCurrentSpeedColorRgba(speed: number, opacity: number = 0.5): string {
  const hex = getCurrentSpeedColor(speed);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function getSalinityColor(psu: number): string {
  const idx = Math.max(0, Math.min(14, Math.floor((psu - 5) / 2)));
  return SALINITY_COLORS[idx];
}

export function getWaveHeightColor(heightM: number): string {
  // 0-3 m skala
  const idx = Math.max(0, Math.min(11, Math.floor((heightM / 3) * 11)));
  return WAVE_COLORS[idx];
}

export function cellToCoords(cell: GridCell & { latDelta?: number; lngDelta?: number }): { latitude: number; longitude: number }[] {
  const halfLat = (cell.latDelta || 0.1) / 2;
  const halfLng = (cell.lngDelta || 0.1) / 2;
  return [
    { latitude: cell.lat - halfLat, longitude: cell.lng - halfLng },
    { latitude: cell.lat - halfLat, longitude: cell.lng + halfLng },
    { latitude: cell.lat + halfLat, longitude: cell.lng + halfLng },
    { latitude: cell.lat + halfLat, longitude: cell.lng - halfLng },
  ];
}

// --- Simple cache (per datetime) ---
let cache: { data: OceanGridData; bounds: BoundingBox; ts: number; datetime: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function isInCache(bounds: BoundingBox, datetime: string): boolean {
  if (!cache) return false;
  if (cache.datetime !== datetime) return false;
  if (Date.now() - cache.ts > CACHE_TTL) return false;

  // Tjek om bounds er inden i cached bounds (med 25% margin for pan tolerance)
  const latMargin = (cache.bounds.maxLat - cache.bounds.minLat) * 0.25;
  const lngMargin = (cache.bounds.maxLng - cache.bounds.minLng) * 0.25;

  return (
    bounds.minLat >= cache.bounds.minLat + latMargin &&
    bounds.maxLat <= cache.bounds.maxLat - latMargin &&
    bounds.minLng >= cache.bounds.minLng + lngMargin &&
    bounds.maxLng <= cache.bounds.maxLng - lngMargin
  );
}

export function clearGridCache(): void {
  cache = null;
}

export function getAvailableForecastTimes(): string[] {
  return cache?.data.forecastTime ? [cache.data.forecastTime] : [];
}

export function getCachedGridData(bounds: BoundingBox, options: FetchGridOptions = {}): OceanGridData | null {
  const datetime = options.datetime || getNextHourISO();
  if (!isInCache(bounds, datetime) || !cache) return null;

  const { includeCurrents = true, includeSalinity = true, includeWaves = false } = options;

  const inBounds = (c: GridCell) =>
    c.lat >= bounds.minLat && c.lat <= bounds.maxLat &&
    c.lng >= bounds.minLng && c.lng <= bounds.maxLng;

  // Filter to visible bounds
  const currents = includeCurrents ? cache.data.currents.filter(inBounds) : [];
  const currentPolygons = includeCurrents ? cache.data.currentPolygons.filter(inBounds) : [];
  const salinity = includeSalinity ? cache.data.salinity.filter(inBounds) : [];
  const waves = includeWaves ? cache.data.waves.filter(inBounds) : [];

  // Hvis filtreret data er tom men vi bad om data, returner null for at trigge ny fetch
  const hasRequestedData =
    (includeCurrents && currents.length > 0) ||
    (includeSalinity && salinity.length > 0) ||
    (includeWaves && waves.length > 0);

  if (!hasRequestedData && (includeCurrents || includeSalinity || includeWaves)) {
    return null;
  }

  return { ...cache.data, currents, currentPolygons, salinity, waves, bounds };
}

// --- Fetch ---

function getNextHourISO(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return now.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export async function fetchOceanGridData(
  bounds: BoundingBox,
  options: FetchGridOptions = {}
): Promise<OceanGridData | null> {
  const { includeCurrents = true, includeSalinity = true, includeWaves = false } = options;
  const datetime = options.datetime || getNextHourISO();

  // Return from cache if available AND has data
  if (isInCache(bounds, datetime) && cache) {
    const cached = getCachedGridData(bounds, options);
    if (cached) return cached;
  }

  if (!DMI_EDR_BASE_URL) return null;

  // Expand bounds significantly for pan tolerance (100% = dobbelt område i hver retning)
  const latPad = (bounds.maxLat - bounds.minLat) * 1.0;
  const lngPad = (bounds.maxLng - bounds.minLng) * 1.0;
  const fetchBounds: BoundingBox = {
    minLat: Math.max(-90, bounds.minLat - latPad),
    maxLat: Math.min(90, bounds.maxLat + latPad),
    minLng: Math.max(-180, bounds.minLng - lngPad),
    maxLng: Math.min(180, bounds.maxLng + lngPad),
  };

  const bbox = `${fetchBounds.minLng.toFixed(3)},${fetchBounds.minLat.toFixed(3)},${fetchBounds.maxLng.toFixed(3)},${fetchBounds.maxLat.toFixed(3)}`;

  // Separate fetches for different data sources
  const fetchPromises: Promise<OceanGridData | null>[] = [];

  // Ocean data (strøm, salinitet) fra DKSS
  if (includeCurrents || includeSalinity) {
    const oceanParams: string[] = [];
    if (includeCurrents) oceanParams.push("current-u", "current-v");
    if (includeSalinity) oceanParams.push("salinity");

    const oceanCollections = ["dkss_idw", "dkss_nsbs"];
    const oceanFetches = oceanCollections.map(collection => {
      const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=${oceanParams.join(",")}&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
      const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;
      return tryFetchCollection(proxyUrl, collection, fetchBounds, bounds, datetime, options);
    });
    fetchPromises.push(Promise.any(oceanFetches).catch(() => null));
  }

  // Bølge data fra WAM
  if (includeWaves) {
    const waveParams = ["significant-wave-height"];
    const waveCollections = ["wam_dw", "wam_nsb"];
    const waveFetches = waveCollections.map(collection => {
      const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=${waveParams.join(",")}&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
      const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;
      return tryFetchCollection(proxyUrl, collection, fetchBounds, bounds, datetime, { ...options, includeCurrents: false, includeSalinity: false, includeWaves: true });
    });
    fetchPromises.push(Promise.any(waveFetches).catch(() => null));
  }

  if (fetchPromises.length === 0) return null;

  // Vent på alle fetches og merge resultater
  const results = await Promise.all(fetchPromises);
  const validResults = results.filter((r): r is OceanGridData => r !== null);

  // Hvis ingen results overhovedet (alle fejlede helt), returner tom data i stedet for null
  if (validResults.length === 0) {
    // Alle datakilder fejlede - returner tom data
    return {
      timestamp: Date.now(),
      forecastTime: "",
      currents: [],
      currentPolygons: [],
      salinity: [],
      waves: [],
      bounds: fetchBounds,
    };
  }

  // Merge alle resultater
  const merged: OceanGridData = {
    timestamp: Date.now(),
    forecastTime: validResults[0]?.forecastTime || "",
    currents: validResults.flatMap(r => r.currents),
    currentPolygons: validResults.flatMap(r => r.currentPolygons),
    salinity: validResults.flatMap(r => r.salinity),
    waves: validResults.flatMap(r => r.waves),
    bounds: fetchBounds,
  };

  // Cache merged result
  cache = { data: merged, bounds: fetchBounds, ts: Date.now(), datetime };

  return getCachedGridData(bounds, options);
}

async function tryFetchCollection(
  proxyUrl: string,
  collection: string,
  fetchBounds: BoundingBox,
  bounds: BoundingBox,
  datetime: string,
  options: FetchGridOptions,
  timeoutMs: number = 5000
): Promise<OceanGridData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const cube = await res.json();
    const data = parseCube(cube, options);

    // Cache it
    cache = { data: { ...data, bounds: fetchBounds }, bounds: fetchBounds, ts: Date.now(), datetime };

    return getCachedGridData(bounds, options);
  } catch (err) {
    // Ignorer timeout/abort fejl
    return null;
  }
}

/** Genererer liste af prognose-tidspunkter (næste 48 timer, hver time) */
export function getForecastTimeOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];

  // Start fra nuværende hele time (UTC)
  const now = new Date();
  const utcHour = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0, 0, 0
  ));

  for (let h = 0; h <= 48; h++) {
    const time = new Date(utcHour.getTime() + h * 60 * 60 * 1000);
    const iso = time.toISOString().replace(/\.\d{3}Z$/, ".000Z");

    // Label viser LOKAL tid (dansk)
    const label = time.toLocaleString("da-DK", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    options.push({ label, value: iso });
  }

  return options;
}

function parseCube(cube: any, options: FetchGridOptions): OceanGridData {
  const { includeCurrents = true, includeSalinity = true, includeWaves = false } = options;
  const rawCurrents: CurrentCell[] = [];
  const currentPolygons: CurrentPolygonCell[] = [];
  const rawSalinity: SalinityCell[] = [];
  const rawWaves: WaveCell[] = [];
  let forecastTime = "";

  const emptyResult: OceanGridData = {
    timestamp: Date.now(), forecastTime, currents: [], currentPolygons: [],
    salinity: [], waves: [], bounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
  };

  if (!cube?.domain?.axes || !cube?.ranges) return emptyResult;

  const { x: xAxis, y: yAxis, t: tAxis } = cube.domain.axes;
  if (tAxis?.values?.[0]) forecastTime = tAxis.values[0];
  if (!xAxis || !yAxis) return emptyResult;

  const xStart = xAxis.start ?? 0;
  const xStop = xAxis.stop ?? 0;
  const xNum = xAxis.num ?? 1;
  const yStart = yAxis.start ?? 0;
  const yStop = yAxis.stop ?? 0;
  const yNum = yAxis.num ?? 1;

  const xStep = xNum > 1 ? (xStop - xStart) / (xNum - 1) : 0;
  const yStep = yNum > 1 ? (yStop - yStart) / (yNum - 1) : 0;

  // Ocean data
  const uVals = cube.ranges["current-u"]?.values;
  const vVals = cube.ranges["current-v"]?.values;
  const salVals = cube.ranges["salinity"]?.values;

  // Wave data
  const waveHeightVals = cube.ranges["significant-wave-height"]?.values || cube.ranges["hs"]?.values || cube.ranges["swh"]?.values || cube.ranges["wave-height"]?.values;

  // Saml ALLE gyldige DMI punkter først
  for (let yi = 0; yi < yNum; yi++) {
    for (let xi = 0; xi < xNum; xi++) {
      const idx = yi * xNum + xi;
      const lat = yStart + yi * yStep;
      const lng = xStart + xi * xStep;

      // Havstrøm
      if (includeCurrents && uVals && vVals) {
        const u = uVals[idx];
        const v = vVals[idx];
        if (u != null && v != null) {
          const speed = Math.sqrt(u * u + v * v);
          const direction = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
          rawCurrents.push({ lat, lng, speed, direction });
          currentPolygons.push({ lat, lng, speed, latDelta: yStep, lngDelta: xStep });
        }
      }

      // Salinitet
      if (includeSalinity && salVals) {
        const sal = salVals[idx];
        if (sal != null) {
          rawSalinity.push({ lat, lng, salinity: sal });
        }
      }

      // Bølger
      if (includeWaves && waveHeightVals) {
        const height = waveHeightVals[idx];
        if (height != null) {
          rawWaves.push({ lat, lng, height });
        }
      }
    }
  }

  // Sample havstrøm (hver 5. pil)
  const sampledCurrents = rawCurrents.filter((_, i) => i % 5 === 0);

  // Sample salinity (hver 5. celle med overlap)
  const sampledSalinity = rawSalinity
    .filter((_, i) => i % 5 === 0)
    .map(cell => ({
      ...cell,
      latDelta: yStep * 5 * 1.15,
      lngDelta: xStep * 5 * 1.15,
    }));

  // Sample bølger (hver 3. celle med overlap)
  const sampledWaves = rawWaves
    .filter((_, i) => i % 3 === 0)
    .map(cell => ({
      ...cell,
      latDelta: yStep * 3 * 1.15,
      lngDelta: xStep * 3 * 1.15,
    }));

  return {
    timestamp: Date.now(),
    forecastTime,
    currents: sampledCurrents,
    currentPolygons,
    salinity: sampledSalinity,
    waves: sampledWaves,
    bounds: { minLat: yStart, maxLat: yStop, minLng: xStart, maxLng: xStop }
  };
}

// 2x2 interpolation - 4 pile per celle
function interpolate2x2(currents: CurrentCell[]): CurrentCell[] {
  if (currents.length < 4) return currents;

  const gridMap = new Map<string, CurrentCell>();
  for (const c of currents) {
    gridMap.set(`${c.lat.toFixed(4)},${c.lng.toFixed(4)}`, c);
  }

  const lats = Array.from(new Set(currents.map(c => c.lat))).sort((a, b) => a - b);
  const lngs = Array.from(new Set(currents.map(c => c.lng))).sort((a, b) => a - b);

  if (lats.length < 2 || lngs.length < 2) return currents;

  const latStep = lats[1] - lats[0];
  const lngStep = lngs[1] - lngs[0];
  const result: CurrentCell[] = [];

  for (let i = 0; i < lats.length - 1; i++) {
    for (let j = 0; j < lngs.length - 1; j++) {
      const tl = gridMap.get(`${lats[i].toFixed(4)},${lngs[j].toFixed(4)}`);
      const tr = gridMap.get(`${lats[i].toFixed(4)},${lngs[j + 1].toFixed(4)}`);
      const bl = gridMap.get(`${lats[i + 1].toFixed(4)},${lngs[j].toFixed(4)}`);
      const br = gridMap.get(`${lats[i + 1].toFixed(4)},${lngs[j + 1].toFixed(4)}`);

      if (!tl || !tr || !bl || !br) continue;

      // 2x2 = 4 punkter per celle
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const fx = (sx + 0.5) / 2;
          const fy = (sy + 0.5) / 2;
          const lat = lats[i] + latStep * fy;
          const lng = lngs[j] + lngStep * fx;

          // Bilinear interpolation
          const topSpeed = tl.speed + (tr.speed - tl.speed) * fx;
          const botSpeed = bl.speed + (br.speed - bl.speed) * fx;
          const speed = topSpeed + (botSpeed - topSpeed) * fy;

          // Direction interpolation med wrap-around
          let tld = tl.direction, trd = tr.direction, bld = bl.direction, brd = br.direction;
          if (Math.abs(trd - tld) > 180) { if (trd > tld) tld += 360; else trd += 360; }
          if (Math.abs(brd - bld) > 180) { if (brd > bld) bld += 360; else brd += 360; }
          const topDir = tld + (trd - tld) * fx;
          const botDir = bld + (brd - bld) * fx;
          let direction = topDir + (botDir - topDir) * fy;
          if (direction >= 360) direction -= 360;

          result.push({ lat, lng, speed, direction });
        }
      }
    }
  }

  return result;
}

// Extrapoler strøm-pile mod kysten ved at fylde huller i grid'et
// Dette bruger nearest-neighbor extrapolation fra eksisterende data
function extrapolateToCoast(currents: CurrentCell[], xStep: number, yStep: number): CurrentCell[] {
  if (currents.length < 4 || xStep === 0 || yStep === 0) return currents;

  // Byg lookup map af eksisterende punkter
  const existing = new Map<string, CurrentCell>();
  for (const c of currents) {
    existing.set(`${c.lat.toFixed(4)},${c.lng.toFixed(4)}`, c);
  }

  // Find grid bounds
  const lats = currents.map(c => c.lat);
  const lngs = currents.map(c => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Brug mindre step for tættere pile mod kysten
  const fineStep = 0.5; // Halvdelen af original step
  const extraLat = yStep * fineStep;
  const extraLng = xStep * fineStep;

  const result: CurrentCell[] = [...currents];
  const added = new Set<string>();

  // For hvert eksisterende punkt, prøv at extrapolere i alle retninger
  for (const cell of currents) {
    const neighbors = [
      { lat: cell.lat + extraLat, lng: cell.lng },           // Nord
      { lat: cell.lat - extraLat, lng: cell.lng },           // Syd
      { lat: cell.lat, lng: cell.lng + extraLng },           // Øst
      { lat: cell.lat, lng: cell.lng - extraLng },           // Vest
      { lat: cell.lat + extraLat, lng: cell.lng + extraLng }, // NØ
      { lat: cell.lat + extraLat, lng: cell.lng - extraLng }, // NV
      { lat: cell.lat - extraLat, lng: cell.lng + extraLng }, // SØ
      { lat: cell.lat - extraLat, lng: cell.lng - extraLng }, // SV
    ];

    for (const n of neighbors) {
      const key = `${n.lat.toFixed(4)},${n.lng.toFixed(4)}`;

      // Spring over hvis der allerede er data her
      if (existing.has(key) || added.has(key)) continue;

      // Spring over hvis udenfor rimelig range (undgå at extrapolere for langt)
      if (n.lat < minLat - yStep || n.lat > maxLat + yStep) continue;
      if (n.lng < minLng - xStep || n.lng > maxLng + xStep) continue;

      // Find nærmeste eksisterende celle(r) og interpoler
      const nearby = findNearestCells(currents, n.lat, n.lng, 3);
      if (nearby.length === 0) continue;

      // Vægt efter afstand (inverse distance weighting)
      let totalWeight = 0;
      let weightedSpeed = 0;
      let weightedDirX = 0;
      let weightedDirY = 0;

      for (const { cell: nc, dist } of nearby) {
        const weight = 1 / (dist + 0.0001); // Undgå division med 0
        totalWeight += weight;
        weightedSpeed += nc.speed * weight;
        // Brug vector-komponenter for retning (undgår wrap-around problemer)
        const rad = (nc.direction * Math.PI) / 180;
        weightedDirX += Math.sin(rad) * weight;
        weightedDirY += Math.cos(rad) * weight;
      }

      const speed = weightedSpeed / totalWeight;
      let direction = (Math.atan2(weightedDirX, weightedDirY) * 180) / Math.PI;
      if (direction < 0) direction += 360;

      result.push({ lat: n.lat, lng: n.lng, speed, direction });
      added.add(key);
    }
  }

  return result;
}

// Find de N nærmeste celler til et punkt
function findNearestCells(
  currents: CurrentCell[],
  lat: number,
  lng: number,
  n: number
): { cell: CurrentCell; dist: number }[] {
  const withDist = currents.map(c => ({
    cell: c,
    dist: Math.sqrt(Math.pow(c.lat - lat, 2) + Math.pow(c.lng - lng, 2)),
  }));

  withDist.sort((a, b) => a.dist - b.dist);
  return withDist.slice(0, n);
}

