// lib/openMeteoGrid.ts
// Open-Meteo grid fetch helper for map overlay data
// Generates a grid of points, fetches from Open-Meteo, returns CoverageJSON-compatible format

const OPEN_METEO_API_KEY = "uwsI1lSZ2idaPwlD";
const OPEN_METEO_WEATHER = "https://customer-api.open-meteo.com/v1/forecast";
const OPEN_METEO_MARINE = "https://customer-marine-api.open-meteo.com/v1/marine";

export interface GridBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** CoverageJSON-compatible result for overlay components */
export interface CoverageGrid {
  domain: {
    axes: {
      x: { start: number; stop: number; num: number };
      y: { start: number; stop: number; num: number };
      t: { values: string[] };
    };
  };
  ranges: Record<string, { values: (number | null)[] }>;
}

/**
 * Fetch grid data from Open-Meteo and return in CoverageJSON format.
 * Used by overlay components to replace DMI EDR cube calls.
 */
export async function fetchOpenMeteoGrid(opts: {
  bounds: GridBounds;
  /** Grid resolution (default 35 = 35x35 = 1225 points) */
  gridSize?: number;
  /** Open-Meteo parameter names (e.g. "wave_height,wave_direction") */
  params: string;
  /** "weather" or "marine" */
  api: "weather" | "marine";
  /** Extra query params (e.g. "&wind_speed_unit=ms") */
  extraQuery?: string;
  /** Forecast hour ISO string */
  datetime?: string;
  /** Timeout ms */
  timeoutMs?: number;
}): Promise<CoverageGrid | null> {
  const {
    bounds,
    gridSize = 20,
    params,
    api,
    extraQuery = "",
    timeoutMs = 6000,
  } = opts;

  // Generate grid points
  const latStep = (bounds.maxLat - bounds.minLat) / (gridSize - 1);
  const lngStep = (bounds.maxLng - bounds.minLng) / (gridSize - 1);

  const lats: number[] = [];
  const lngs: number[] = [];

  for (let yi = 0; yi < gridSize; yi++) {
    for (let xi = 0; xi < gridSize; xi++) {
      lats.push(+(bounds.minLat + yi * latStep).toFixed(4));
      lngs.push(+(bounds.minLng + xi * lngStep).toFixed(4));
    }
  }

  const baseUrl = api === "marine" ? OPEN_METEO_MARINE : OPEN_METEO_WEATHER;
  const { datetime } = opts;
  const useHourly = !!datetime;
  let url: string;

  if (useHourly) {
    // Strip milliseconds and Z for Open-Meteo format: YYYY-MM-DDTHH:MM
    const isoHour = datetime!.replace(/:\d{2}\.\d{3}Z$/, "").replace(/Z$/, "");
    url =
      `${baseUrl}?latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
      `&hourly=${params}` +
      `&start_hour=${isoHour}&end_hour=${isoHour}` +
      `&timezone=auto&apikey=${OPEN_METEO_API_KEY}${extraQuery}`;
  } else {
    url =
      `${baseUrl}?latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
      `&current=${params}` +
      `&timezone=auto&apikey=${OPEN_METEO_API_KEY}${extraQuery}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();

    // Convert Open-Meteo multi-point response to CoverageJSON grid
    const points: any[] = Array.isArray(json) ? json : [json];
    if (points.length === 0) return null;

    // Get parameter keys from first point's data
    const firstData = useHourly ? points[0]?.hourly : points[0]?.current;
    if (!firstData) return null;

    const paramKeys = params.split(",").filter((k) => k !== "time" && k !== "interval");

    // Build ranges (flat arrays indexed as [yi * gridSize + xi])
    const ranges: Record<string, { values: (number | null)[] }> = {};
    for (const key of paramKeys) {
      ranges[key] = { values: [] };
    }

    for (const pt of points) {
      if (useHourly) {
        const h = pt?.hourly || {};
        for (const key of paramKeys) {
          const arr = h[key];
          ranges[key].values.push(Array.isArray(arr) && arr.length > 0 ? arr[0] : null);
        }
      } else {
        const c = pt?.current || {};
        for (const key of paramKeys) {
          ranges[key].values.push(c[key] ?? null);
        }
      }
    }

    const now = useHourly
      ? (points[0]?.hourly?.time?.[0] || datetime || new Date().toISOString())
      : (points[0]?.current?.time || new Date().toISOString());

    return {
      domain: {
        axes: {
          x: { start: bounds.minLng, stop: bounds.maxLng, num: gridSize },
          y: { start: bounds.minLat, stop: bounds.maxLat, num: gridSize },
          t: { values: [now] },
        },
      },
      ranges,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Fetch ocean current grid and return u/v components for leaflet-velocity.
 * Converts speed+direction to u/v.
 */
export async function fetchCurrentGrid(
  bounds: GridBounds,
  gridSize = 20,
  datetime?: string
): Promise<CoverageGrid | null> {
  const result = await fetchOpenMeteoGrid({
    bounds,
    gridSize,
    params: "ocean_current_velocity,ocean_current_direction",
    api: "marine",
    datetime,
  });

  if (!result) return null;

  // Convert velocity (km/h) + direction to u/v components (m/s)
  const vel = result.ranges["ocean_current_velocity"]?.values || [];
  const dir = result.ranges["ocean_current_direction"]?.values || [];
  const uVals: (number | null)[] = [];
  const vVals: (number | null)[] = [];

  for (let i = 0; i < vel.length; i++) {
    const v = vel[i];
    const d = dir[i];
    if (v == null || d == null) {
      uVals.push(null);
      vVals.push(null);
    } else {
      const speedMs = v / 3.6; // km/h → m/s
      const rad = (d * Math.PI) / 180;
      uVals.push(speedMs * Math.sin(rad));
      vVals.push(speedMs * Math.cos(rad));
    }
  }

  result.ranges = {
    "current-u": { values: uVals },
    "current-v": { values: vVals },
  };

  return result;
}

/**
 * Fetch wave grid and return height + pseudo u/v for leaflet-velocity.
 */
export async function fetchWaveGrid(
  bounds: GridBounds,
  gridSize = 20,
  datetime?: string
): Promise<{ coverage: CoverageGrid; rawHeights: (number | null)[] } | null> {
  const result = await fetchOpenMeteoGrid({
    bounds,
    gridSize,
    params: "wave_height,wave_direction",
    api: "marine",
    datetime,
  });

  if (!result) return null;

  const heights = result.ranges["wave_height"]?.values || [];
  const dirs = result.ranges["wave_direction"]?.values || [];
  const uVals: (number | null)[] = [];
  const vVals: (number | null)[] = [];

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const d = dirs[i];
    if (h == null || d == null) {
      uVals.push(null);
      vVals.push(null);
    } else {
      const speed = Math.sqrt(h); // Scale for visibility
      const rad = (d * Math.PI) / 180;
      uVals.push(speed * Math.sin(rad));
      vVals.push(speed * Math.cos(rad));
    }
  }

  result.ranges = {
    "wave-u": { values: uVals },
    "wave-v": { values: vVals },
    "wave_height": { values: heights },
    "wave_direction": { values: dirs },
  };

  return { coverage: result, rawHeights: heights };
}

/**
 * Fetch wind grid for leaflet-velocity.
 */
export async function fetchWindGrid(
  bounds: GridBounds,
  gridSize = 20,
  datetime?: string
): Promise<CoverageGrid | null> {
  const result = await fetchOpenMeteoGrid({
    bounds,
    gridSize,
    params: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    api: "weather",
    extraQuery: "&wind_speed_unit=ms",
    datetime,
  });

  if (!result) return null;

  const speeds = result.ranges["wind_speed_10m"]?.values || [];
  const dirs = result.ranges["wind_direction_10m"]?.values || [];
  const uVals: (number | null)[] = [];
  const vVals: (number | null)[] = [];

  for (let i = 0; i < speeds.length; i++) {
    const s = speeds[i];
    const d = dirs[i];
    if (s == null || d == null) {
      uVals.push(null);
      vVals.push(null);
    } else {
      // Wind direction is "from" direction
      const rad = ((d + 180) * Math.PI) / 180;
      uVals.push(s * Math.sin(rad));
      vVals.push(s * Math.cos(rad));
    }
  }

  const gusts = result.ranges["wind_gusts_10m"]?.values || [];

  result.ranges = {
    "wind-u": { values: uVals },
    "wind-v": { values: vVals },
    "wind-speed": { values: speeds },
    "wind-dir": { values: dirs },
    "wind-gusts": { values: gusts },
  };

  return result;
}

/**
 * Fetch water level grid as point cloud.
 */
export async function fetchWaterLevelGrid(
  bounds: GridBounds,
  gridSize = 20,
  datetime?: string
): Promise<CoverageGrid | null> {
  return fetchOpenMeteoGrid({
    bounds,
    gridSize,
    params: "sea_level_height_msl",
    api: "marine",
    datetime,
  });
}

/**
 * Fetch precipitation grid as point cloud (mm/h).
 */
export async function fetchPrecipitationGrid(
  bounds: GridBounds,
  gridSize = 20,
  datetime?: string
): Promise<CoverageGrid | null> {
  return fetchOpenMeteoGrid({
    bounds,
    gridSize,
    params: "precipitation",
    api: "weather",
    datetime,
  });
}
