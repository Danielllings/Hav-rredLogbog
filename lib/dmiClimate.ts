// lib/dmiClimate.ts
// DMI Climate: stationsliste + helper-funktioner + fetchClimateForTrip med rigtige API-kald
// og logik til "nærmeste time med data" for korte ture.

import { DMI_CLIMATE_BASE_URL } from "./dmiConfig";

export type ClimateStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  height: number | null;
  coastal: boolean;
};

// Foreløbig liste over danske, kyst-/fjordnære stationer.
export const CLIMATE_STATIONS_DK: ClimateStation[] = [
  { id: "06019", name: "Silstrup", lat: 56.93, lon: 8.6412, height: 10, coastal: false },
  { id: "06041", name: "Skagen Fyr", lat: 57.7364, lon: 10.6316, height: 11, coastal: true },
  { id: "06051", name: "Vestervig", lat: 56.7637, lon: 8.3207, height: 18, coastal: false },
  { id: "06052", name: "Thyborøn", lat: 56.7068, lon: 8.215, height: 10, coastal: true },
  { id: "06058", name: "Hvide Sande", lat: 56.0072, lon: 8.1413, height: 10, coastal: true },
  { id: "06073", name: "Sletterhage Fyr", lat: 56.0955, lon: 10.5135, height: 10, coastal: true },
  { id: "06079", name: "Anholt Havn", lat: 56.7169, lon: 11.5098, height: 10, coastal: true },
  { id: "06081", name: "Blåvandshuk Fyr", lat: 55.5575, lon: 8.0828, height: 10, coastal: true },
  { id: "06088", name: "Nordby (Fanø)", lat: 55.4516, lon: 8.4104, height: 10, coastal: true },
  { id: "06093", name: "Vester Vedsted", lat: 55.2908, lon: 8.6551, height: 10, coastal: true },
  { id: "06096", name: "Rømø/Juvre", lat: 55.1904, lon: 8.5599, height: 10, coastal: true },
  { id: "06102", name: "Horsens/Bygholm", lat: 55.868, lon: 9.7872, height: 10, coastal: true },
  { id: "06119", name: "Kegnæs Fyr", lat: 54.8915, lon: 9.7949, height: 10, coastal: true },
  { id: "06123", name: "Tvingsbjerg Fyr", lat: 55.1607, lon: 10.6424, height: 10, coastal: true },
  { id: "06132", name: "Tranebjerg Øst (Samsø)", lat: 55.8322, lon: 10.5964, height: 10, coastal: true },
  { id: "06136", name: "Tystofte", lat: 55.2911, lon: 11.3592, height: 10, coastal: true },
  { id: "06138", name: "Langø", lat: 54.8479, lon: 11.1771, height: 10, coastal: true },
  { id: "06147", name: "Vindebæk Kyst", lat: 54.879, lon: 12.1841, height: 10, coastal: true },
  { id: "06149", name: "Gedser", lat: 54.5687, lon: 11.9435, height: 10, coastal: true },
  { id: "06151", name: "Omø Fyr", lat: 55.1593, lon: 11.1348, height: 9.3, coastal: true },
  { id: "06156", name: "Holbæk", lat: 55.7358, lon: 11.6035, height: 10, coastal: true },
  { id: "06159", name: "Røsnæs Fyr", lat: 55.7435, lon: 10.8694, height: 17, coastal: true },
  { id: "06168", name: "Nakkehoved Fyr", lat: 56.1193, lon: 12.3424, height: 13.5, coastal: true },
  { id: "06169", name: "Gniben", lat: 56.0083, lon: 11.2787, height: 10, coastal: true },
  { id: "06174", name: "Køge-området (Tessebølle)", lat: 55.3955, lon: 12.149, height: 10, coastal: true },
  { id: "06181", name: "Jægersborg", lat: 55.7664, lon: 12.5263, height: 10, coastal: true },
  { id: "06187", name: "Københavns Toldbod", lat: 55.6886, lon: 12.5985, height: 20, coastal: true },
  { id: "06193", name: "Hammer Odde Fyr", lat: 55.2979, lon: 14.7718, height: 10, coastal: true },
  { id: "06197", name: "Nexø Vest", lat: 55.0557, lon: 15.0953, height: 10, coastal: true },
  { id: "28240", name: "Rosilde", lat: 55.3042, lon: 10.7279, height: 10, coastal: true },

];

export const COASTAL_CLIMATE_STATIONS_DK: ClimateStation[] =
  CLIMATE_STATIONS_DK.filter((s) => s.coastal);

// --- afstandsberegning + valg af nærmeste station ---

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Find nærmeste klimastation til en given position.
 */
export function findNearestClimateStation(
  lat: number,
  lon: number,
  coastalOnly: boolean = true
): ClimateStation | null {
  const list = coastalOnly ? COASTAL_CLIMATE_STATIONS_DK : CLIMATE_STATIONS_DK;
  if (!list.length) return null;

  let best = list[0];
  let bestDist = haversineKm(lat, lon, best.lat, best.lon);

  for (let i = 1; i < list.length; i++) {
    const s = list[i];
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }

  return best;
}

// --- typer til den funktion dmi.ts forventer ---

export type ClimatePoint = {
  ts: number;
  airTempC?: number;
  windMS?: number;
  windDirDeg?: number;
};

export type Stat = {
  avg: number;
  min: number;
  max: number;
};

export type ClimateStats = {
  airTempC?: Stat;
  windMS?: Stat;
  windDirDeg?: Stat;
  series: ClimatePoint[];
  stationName?: string;
  stationId?: string;
};

export type ClimateInput = {
  startIso: string;
  endIso: string;
  lat: number;
  lon: number;
};

// --- intern helper til at kalde DMI Climate API ---

type StationValueFeature = {
  properties?: {
    value?: number;
    from?: string;
    to?: string;
    parameterId?: string;
    stationId?: string;
  };
};

type StationValueResponse = {
  features?: StationValueFeature[];
};

async function fetchStationValues(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): Promise<{ ts: number; value: number }[]> {
  const datetime = `${startIso}/${endIso}`;

  if (!DMI_CLIMATE_BASE_URL) {
    return [];
  }

  const url = new URL(DMI_CLIMATE_BASE_URL);
  url.searchParams.set("stationId", stationId);
  url.searchParams.set("parameterId", parameterId);
  url.searchParams.set("timeResolution", "hour");
  url.searchParams.set("datetime", datetime);
  url.searchParams.set("limit", "10000");
  url.searchParams.set("sortorder", "from,DESC");

  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as StationValueResponse;
  const feats = data.features ?? [];

  const out: { ts: number; value: number }[] = [];
  for (const f of feats) {
    const props = f.properties;
    if (!props) continue;
    const v = props.value;
    const from = props.from;
    if (typeof v !== "number" || !from) continue;
    const ts = Date.parse(from);
    if (!Number.isFinite(ts)) continue;
    out.push({ ts, value: v });
  }

  return out;
}

function buildStat(values: number[]): Stat | undefined {
  if (!values.length) return undefined;
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    avg: sum / values.length,
    min,
    max,
  };
}

function findNearestByTime(
  arr: { ts: number; value: number }[],
  targetTs: number
): { ts: number; value: number } | null {
  if (!arr.length) return null;
  let best = arr[0];
  let bestDiff = Math.abs(arr[0].ts - targetTs);
  for (let i = 1; i < arr.length; i++) {
    const diff = Math.abs(arr[i].ts - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = arr[i];
    }
  }
  return best;
}

/**
 * Bliver kaldt fra dmi.ts -> evaluateTripWithDmi.
 * Finder nærmeste station, henter DMI climate-data for turens tidsrum
 * og beregner simple stats.
 *
 * Hvis turen er KORTERE end 1 time:
 *  - vi slår op i et større vindue omkring turens midtpunkt (fx ±6 timer)
 *  - stats laves KUN på den måling, der ligger tættest på midtpunktet
 *
 * Hvis turen er >= 1 time:
 *  - vi bruger alle målinger i perioden [startIso, endIso] som hidtil
 */
export async function fetchClimateForTrip(
  input: ClimateInput
): Promise<ClimateStats | null> {
  const station = findNearestClimateStation(input.lat, input.lon, true);

  if (!station) {
    return null;
  }

  const startMs = Date.parse(input.startIso);
  const endMs = Date.parse(input.endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const durationMs = endMs - startMs;
  const midMs = startMs + durationMs / 2;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // Standard: brug turens start/slut
  let queryStartIso = input.startIso;
  let queryEndIso = input.endIso;

  // Kort tur -> slå bredere op (±6 timer)
  if (durationMs < ONE_HOUR_MS) {
    const margin = 6 * ONE_HOUR_MS;
    const fromMs = midMs - margin;
    const toMs = midMs + margin;
    queryStartIso = new Date(fromMs).toISOString();
    queryEndIso = new Date(toMs).toISOString();
  }

  try {
    // Hent tre parametre fra DMI Climate Data:
    // - mean_temp (°C)
    // - mean_wind_speed (m/s)
    // - mean_wind_dir (grader)
    const [tempVals, windSpeedVals, windDirVals] = await Promise.all([
      fetchStationValues(station.id, "mean_temp", queryStartIso, queryEndIso),
      fetchStationValues(station.id, "mean_wind_speed", queryStartIso, queryEndIso),
      fetchStationValues(station.id, "mean_wind_dir", queryStartIso, queryEndIso),
    ]);

    const map: { [ts: number]: ClimatePoint } = {};

    for (const p of tempVals) {
      if (!map[p.ts]) map[p.ts] = { ts: p.ts };
      map[p.ts].airTempC = p.value;
    }
    for (const p of windSpeedVals) {
      if (!map[p.ts]) map[p.ts] = { ts: p.ts };
      map[p.ts].windMS = p.value;
    }
    for (const p of windDirVals) {
      if (!map[p.ts]) map[p.ts] = { ts: p.ts };
      map[p.ts].windDirDeg = p.value;
    }

    const series = Object.values(map).sort((a, b) => a.ts - b.ts);

    let tempNumbers: number[] = [];
    let windSpeedNumbers: number[] = [];
    let windDirNumbers: number[] = [];

    if (durationMs < ONE_HOUR_MS) {
      // Kort tur: brug kun den måling der er tættest på turens midtpunkt
      const nearestTemp = findNearestByTime(tempVals, midMs);
      const nearestWind = findNearestByTime(windSpeedVals, midMs);
      const nearestDir = findNearestByTime(windDirVals, midMs);

      if (nearestTemp) tempNumbers = [nearestTemp.value];
      if (nearestWind) windSpeedNumbers = [nearestWind.value];
      if (nearestDir) windDirNumbers = [nearestDir.value];
    } else {
      // Længere tur: brug alle målinger
      tempNumbers = tempVals.map((p) => p.value);
      windSpeedNumbers = windSpeedVals.map((p) => p.value);
      windDirNumbers = windDirVals.map((p) => p.value);
    }

    const stats: ClimateStats = {
      airTempC: buildStat(tempNumbers),
      windMS: buildStat(windSpeedNumbers),
      windDirDeg: buildStat(windDirNumbers),
      series,
      stationName: station.name,
      stationId: station.id,
    };

    // Hvis der slet ikke er noget, returnér null
    const hasAny =
      (stats.airTempC && !Number.isNaN(stats.airTempC.avg)) ||
      (stats.windMS && !Number.isNaN(stats.windMS.avg)) ||
      (stats.windDirDeg && !Number.isNaN(stats.windDirDeg.avg)) ||
      series.length > 0;

    if (!hasAny) {
      return null;
    }

    return stats;
  } catch (err) {
    return null;
  }
}
