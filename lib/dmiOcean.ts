// lib/dmiOcean.ts
// DMI OceanObs: stationsliste + helper-funktioner + fetchOceanForTrip med rigtige API-kald
// og logik til "nærmeste time med data" for korte ture.

import { DMI_OCEAN_BASE_URL } from "./dmiConfig";

export type OceanStation = {
  id: string;      // DMI stationId, fx "30361"
  name: string;    // præcis som hos DMI
  lat: number;
  lon: number;
  coastal: boolean;
  hasTemp: boolean;   // måler havtemp (tw)
  hasLevel: boolean;  // måler vandstand (sealev_*)
};

// OBS: id, lat, lon = SKAL du selv udfylde fra DMI (Ocean/Tidewater)
// hasTemp / hasLevel er sat ud fra dine to lister:
//  - TW-liste (havtemperatur) -> hasTemp = true
//  - VANDSTAND-liste -> hasLevel = true
export const OCEAN_STATIONS_DK: OceanStation[] = [
  
   // === Sjælland / København / Falster === //

  
  // +Nakskov
  { id: "31417", name: "Nakskov I",              lat: 54.828, lon: 11.1363, coastal: true, hasTemp: true,  hasLevel: true },

  // +Rødbyhavns Havn
  { id: "31573", name: "Rødbyhavns Havn I",      lat: 54.6561, lon: 11.3475, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "31574", name: "Rødbyhavns Havn II",      lat: 54.6561, lon: 11.3475, coastal: true, hasTemp: true,  hasLevel: true },

  // +Bandholm Havn
  { id: "9030501", name: "Bandholm Havn I",        lat: 54.8368, lon: 11.4879, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "9030502", name: "Bandholm Havn II",        lat: 54.8368, lon: 11.4879, coastal: true, hasTemp: true,  hasLevel: true },

  // +Gedser Havn
  { id: "31616", name: "Gedser Havn I",          lat: 54.5721, lon: 11.9245, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "31623", name: "Gedser Havn II",          lat: 54.5721, lon: 11.9245, coastal: true, hasTemp: true,  hasLevel: true },

  // +Hesnæs Havn
  { id: "9030301", name: "Hesnæs Havn I",          lat: 54.8231, lon: 12.1373, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "9030302", name: "Hesnæs Havn II",          lat: 54.8231, lon: 12.1373, coastal: true, hasTemp: true,  hasLevel: true },

  // +Kalvehave
  { id: "9030201", name: "Kalvehave I",            lat: 54.995, lon: 12.1666, coastal: true, hasTemp: false, hasLevel: true },
  { id: "9030202", name: "Kalvehave II",            lat: 54.995, lon: 12.1666, coastal: true, hasTemp: false, hasLevel: true },

  // Korsør Havn
  { id: "29393", name: "Korsør Havn I",          lat: 55.3307, lon: 11.1422, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "29394", name: "Korsør Havn I",          lat: 55.3307, lon: 11.1422, coastal: true, hasTemp: true,  hasLevel: true },

  // +Kalundborg Havn
  { id: "29141", name: "Kalundborg Havn",        lat: 55.6736, lon: 11.0973, coastal: true, hasTemp: true,  hasLevel: true },
  
  // +Holbæk Havn
  { id: "29038", name: "Holbæk Havn I",          lat: 55.7214, lon: 11.7089, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "29039", name: "Holbæk Havn II",          lat: 55.7214, lon: 11.7089, coastal: true, hasTemp: true,  hasLevel: true },
  
  // +Roskilde Havn
  { id: "30407", name: "Roskilde Havn I",        lat: 55.6509, lon: 12.0771, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "30409", name: "Roskilde Havn II",          lat: 55.6509, lon: 12.0771, coastal: true, hasTemp: true,  hasLevel: true },
 
  // +Køge Havn
  { id: "30478", name: "Køge Havn I",            lat: 55.4555, lon: 12.1965, coastal: true, hasTemp: true,  hasLevel: true },
  { id: "30479", name: "Køge Havn II",            lat: 55.4555, lon: 12.1965, coastal: true, hasTemp: true,  hasLevel: true },
 
  // +Dragør Havn
  { id: "30361", name: "Dragør Havn I",          lat: 55.5935, lon: 12.6785, coastal: true, hasTemp: false,  hasLevel: true },
  { id: "30363", name: "Dragør Havn II",          lat: 55.5935, lon: 12.6785, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Københavns Havn
  { id: "30336", name: "Københavns Havn I",        lat: 55.6894, lon: 12.5997, coastal: true, hasTemp: false,  hasLevel: true },
  { id: "30334", name: "Københavns Havn II",        lat: 55.6894, lon: 12.5997, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Vedbæk
  { id: "30202", name: "Vedbæk Havn I",          lat: 55.8491, lon: 12.5715, coastal: true, hasTemp: false,  hasLevel: true },
  { id: "30203", name: "Vedbæk Havn II",          lat: 55.8491, lon: 12.5715, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Hornbæk Havn
  { id: "30017", name: "Hornbæk Havn",           lat: 56.0934, lon: 12.4571, coastal: true, hasTemp: true,  hasLevel: true },

  // +Rødvig Havn
  { id: "31063", name: "Rødvig Havn I",         lat: 55.2543, lon: 12.3744, coastal: true, hasTemp: true,  hasLevel: false },
  { id: "31061", name: "Rødvig Havn II",         lat: 55.2543, lon: 12.3744, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Kastrup Havn
  { id: "30333", name: "Kastrup Havn II",        lat: 55.6426, lon: 55.6426, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Sletten Havn
  { id: "30042", name: "Sletten Havn",        lat: 55.9534, lon: 12.5353, coastal: true, hasTemp: true,  hasLevel: false },
  
  // +Karrebæksminde
  { id: "9030101", name: "Karrebæksminde I",    lat: 55.1766, lon: 11.6471, coastal: true, hasTemp: false, hasLevel: true },
  { id: "9030102", name: "Karrebæksminde II",    lat: 55.1766, lon: 11.6471, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Reersø Havn
  { id: "29336", name: "Reersø Havn",           lat: 55.5173, lon: 11.1194, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Sjællands Odde
  { id: "29002", name: "Havnebyen/Sjællands Odde", lat: 55.9728, lon: 11.3694, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Drogden Fyr
  { id: "30357", name: "Drogden Fyr",           lat: 55.5364, lon: 12.7113, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Hellerup Havn
  { id: "30328", name: "Hellerup Havn",         lat: 55.7316, lon: 12.5823, coastal: true, hasTemp: false, hasLevel: true },

 // === BORNHOLM === //

  // +Rønne Havn 
  { id: "9030401", name: "Rønne Havn I",         lat: 55.0932, lon: 14.6896, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Tejn Havn
  { id: "32048", name: "Tejn Havn",         lat: 55.249, lon: 14.8368, coastal: true, hasTemp: true, hasLevel: true },
  
 // === Jylland - Fyn === //
 
  // +Bagenkop Havn
  { id: "28547", name: "Bagenkop Havn II",         lat: 54.7516, lon: 10.6724, coastal: true, hasTemp: false, hasLevel: true },
  { id: "28548", name: "Bagenkop Havn",         lat: 54.7517, lon: 10.6724, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Fåborg Havn
  { id: "9020301", name: "Fåborg Havn I",         lat: 55.0934, lon: 10.2412, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Assens Havn 
  { id: "9020201", name: "Assens Havn I",         lat: 55.2706, lon: 9.8897, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Bogense Havn 
  { id: "9020101", name: "Assens Havn I",         lat: 55.2706, lon: 9.8897, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Kerteminde Havn
  { id: "9020401", name: "Kerteminde Havn I",         lat: 55.4508, lon: 10.6651, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Slipshavn
  { id: "28234", name: "Slipshavn",         lat: 55.2878, lon: 10.8264, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Fynshav Havn
  { id: "26457", name: "Fynshav Havn I",         lat: 54.9944, lon: 9.9856, coastal: true, hasTemp: true, hasLevel: true },

  // +Sønderborg Havn
  { id: "9010201", name: "Sønderborg Havn I",         lat: 54.9107, lon: 9.7853, coastal: true, hasTemp: false, hasLevel: true },

  // +Vidåslusen/Højer
  { id: "9006501", name: "Vidåslusen/Højer",         lat: 54.9628, lon: 8.6619, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Havneby Havn 
  { id: "9006801", name: "Sønderborg Havn I",         lat: 55.0871, lon: 8.5654, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Ballum Sluse
  { id: "9006601", name: "Ballum Sluse",         lat: 55.1308, lon: 8.6858, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Brøns Sluse 
  { id: "9006901", name: "Brøns Sluse I",         lat: 55.1863, lon: 8.6875, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Mandø 
  { id: "9007101", name: "Mandø I",         lat: 55.2764, lon: 8.5739, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Ribe Kammersluse
  { id: "9006701", name: "Ribe Kammersluse I",         lat: 55.34, lon: 8.676, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Esbjerg Havn 
  { id: "25149", name: "Esbjerg Havn I",         lat: 55.4606, lon: 8.4431, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Fredericia Havn
  { id: "23293", name: "Fredericia Havn",         lat: 55.5595, lon: 9.753, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Juelsminde Havn
  { id: "23132", name: "Juelsminde Havn",         lat: 55.7156, lon: 10.0163, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Bork Havn
  { id: "9005213", name: "Bork Havn",         lat: 55.8494, lon: 8.2794, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Horsens Havn N
  { id: "23128", name: "Horsens Havn N",         lat: 55.8561, lon: 9.8673, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Hov Havn I
  { id: "22598", name: "Hov Havn I",         lat: 55.9121, lon: 10.2589, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Hvide Sande Fjord
  { id: "9005210", name: "Hvide Sande Fjord",         lat: 55.9999, lon: 8.1295, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Hvide Sande Indsejling
  { id: "9005203", name: "Hvide Sande Indsejling",         lat: 56.0011, lon: 8.1218, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Ringkøbing Havn
  { id: "9005212", name: "Ringkøbing Havn",         lat: 56.0875, lon: 8.2396, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Århus Havn 
  { id: "22331", name: "Århus Havn I",         lat: 56.1466, lon: 10.2226, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Felsted Kog/Klosterhul
  { id: "9005113", name: "Felsted Kog/Klosterhul",         lat: 56.2959, lon: 8.2768, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Thorsminde Kyst 
  { id: "9005103", name: "Thorsminde Kyst I",         lat: 56.3726, lon: 8.1136, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Thorsminde Fjord
  { id: "9005110", name: "Thorsminde Fjord",         lat: 56.3716, lon: 8.1259, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Nees
  { id: "9005112", name: "Nees",         lat: 56.4165, lon: 8.1729, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Ferring
  { id: "9004303", name: "Ferring",         lat: 56.5246, lon: 8.1152, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Struer
  { id: "24053", name: "Struer",         lat: 56.4945, lon: 8.5854, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Skive Havn
  { id: "21191", name: "Skive Havn",         lat: 56.5701, lon: 9.0519, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Grenå Havn 
  { id: "22121", name: "Grenå Havn I",         lat: 56.4121, lon: 10.922, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Randers Havn 
  { id: "22058", name: "Randers Havn I",         lat: 56.4569, lon: 10.0396, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Udbyhøj Havn 
  { id: "22008", name: "Udbyhøj Havn I",         lat: 56.607, lon: 10.3016, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Hobro Havn 
  { id: "20566", name: "Hobro Havn I",         lat: 56.6388, lon: 9.8038, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Thyborøn Kyst
  { id: "9004203", name: "Thyborøn Kyst",         lat: 56.7077, lon: 8.2088, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Nykøbing Mors Havn
  { id: "21138", name: "Nykøbing Mors Havn",         lat: 56.7948, lon: 8.8635, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Thisted Havn
  { id: "21058", name: "Thisted Havn",         lat: 56.9538, lon: 8.6941, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Hanstholm Havn 
  { id: "21009", name: "Hanstholm Havn I",         lat: 57.12, lon: 8.5955, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Haverslev Havn
  { id: "20333", name: "Haverslev Havn",         lat: 57.0284, lon: 9.4017, coastal: true, hasTemp: false, hasLevel: true },
  
  // +Frederikshavn 
  { id: "20101", name: "Frederikshavn I",         lat: 57.4357, lon: 10.5479, coastal: true, hasTemp: true, hasLevel: true },
  
  // +Hirtshals Havn
  { id: "20049", name: " Hirtshals Havn",         lat: 57.5942, lon: 9.9622, coastal: true, hasTemp: false, hasLevel: true },

];

export const COASTAL_OCEAN_STATIONS_DK: OceanStation[] =
  OCEAN_STATIONS_DK.filter((s) => s.coastal);

// Afledte lister
const TEMP_STATIONS_DK: OceanStation[] =
  COASTAL_OCEAN_STATIONS_DK.filter((s) => s.hasTemp);

const LEVEL_STATIONS_DK: OceanStation[] =
  COASTAL_OCEAN_STATIONS_DK.filter((s) => s.hasLevel);

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

function findNearestStation(
  list: OceanStation[],
  lat: number,
  lon: number
): OceanStation | null {
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

// sortér alle temp-stationer efter afstand til en position
function getTempCandidatesByDistance(
  lat: number,
  lon: number
) {
  return TEMP_STATIONS_DK
    .map((s) => ({
      station: s,
      distKm: haversineKm(lat, lon, s.lat, s.lon),
    }))
    .sort((a, b) => a.distKm - b.distKm);
}

// prøv nærmeste temp-stationer indtil vi finder én med tw-data
async function fetchTwWithFallback(
  lat: number,
  lon: number,
  startIso: string,
  endIso: string
): Promise<{ station: OceanStation | null; vals: { ts: number; value: number }[] }> {
  const candidates = getTempCandidatesByDistance(lat, lon);
  const MAX_DIST_KM = 80; // hård grænse så vi ikke ender i Esbjerg fra København

  for (const { station, distKm } of candidates) {
    if (distKm > MAX_DIST_KM) break;

    const vals = await fetchObservationValues(station.id, "tw", startIso, endIso);
    if (vals.length > 0) {
      // console.log("Valgte temp-station (med data):", station.id, station.name, "distKm", distKm.toFixed(1));
      return { station, vals };
    }
  }

  // console.log("Ingen temp-station med tw-data fundet inden for", MAX_DIST_KM, "km");
  return { station: null, vals: [] };
}

/**
 * Find nærmeste ocean-station til en given position.
 * (Beholder denne til evt. anden brug – bruger COASTAL_OCEAN_STATIONS_DK)
 */
export function findNearestOceanStation(
  lat: number,
  lon: number
): OceanStation | null {
  return findNearestStation(COASTAL_OCEAN_STATIONS_DK, lat, lon);
}

// --- typer til den funktion dmi.ts forventer ---

export type OceanPoint = {
  ts: number;
  waterTempC?: number;
  waterLevelCM?: number;
};

export type Stat = {
  avg: number;
  min: number;
  max: number;
};

export type OceanStats = {
  waterTempC?: Stat;
  waterLevelCM?: Stat;
  series: OceanPoint[];
  // ekstra metadata til debug / visning
  stationId?: string;   // vi viser primært temp-station, ellers level-station
  stationName?: string;
  fromTs?: number;
  toTs?: number;
};

export type OceanInput = {
  startIso: string;
  endIso: string;
  lat: number;
  lon: number;
};

// --- intern helper til at kalde DMI OceanObs API ---

type OceanFeature = {
  properties?: {
    value?: number;
    observed?: string; // tidspunkt for observationen
    parameterId?: string;
    stationId?: string;
  };
};

type OceanResponse = {
  features?: OceanFeature[];
};

async function fetchObservationValues(
  stationId: string,
  parameterId: string,
  startIso: string,
  endIso: string
): Promise<{ ts: number; value: number }[]> {
  const datetime = `${startIso}/${endIso}`;
  const url = new URL(DMI_OCEAN_BASE_URL);
  url.searchParams.set("stationId", stationId);
  url.searchParams.set("parameterId", parameterId);
  url.searchParams.set("datetime", datetime);
  url.searchParams.set("limit", "10000");
  url.searchParams.set("sortorder", "observed,DESC"); // som i DMI-dokumentationen

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      // console.log("DMI OceanObs API fejl:", res.status, txt);
      return [];
    }

    const data = (await res.json()) as OceanResponse;
    const feats = data.features ?? [];

    const out: { ts: number; value: number }[] = [];
    for (const f of feats) {
      const props = f.properties;
      if (!props) continue;
      const v = props.value;
      const observed = props.observed;
      if (typeof v !== "number" || !observed) continue;
      const ts = Date.parse(observed);
      if (!Number.isFinite(ts)) continue;
      out.push({ ts, value: v });
    }

    return out;
  } catch (err) {
    // console.log("Netværksfejl i fetchObservationValues:", err);
    return [];
  }
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
 * Finder nærmeste temp-station (med tw-data) og nærmeste vandstands-station,
 * henter DMI ocean-data (vandtemp/vandstand) for turens tidsrum
 * og beregner simple stats.
 */
export async function fetchOceanForTrip(
  input: OceanInput
): Promise<OceanStats | null> {
  const levelStation = findNearestStation(LEVEL_STATIONS_DK, input.lat, input.lon);

  if (!levelStation && !TEMP_STATIONS_DK.length) {
    // console.log("Ingen ocean-station (temp/level) fundet til position", input.lat, input.lon);
    return null;
  }

  const startMs = Date.parse(input.startIso);
  const endMs = Date.parse(input.endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    // console.log("Ugyldige datoer i OceanInput", input);
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
    // 1) find temp-station med tw-data (fallback på andre temp-stationer)
    const { station: tempStation, vals: tempVals } = await fetchTwWithFallback(
      input.lat,
      input.lon,
      queryStartIso,
      queryEndIso
    );

    // 2) hent vandstand fra nærmeste level-station
    const [levelDvrVals, levelLnVals] = await Promise.all([
      levelStation
        ? fetchObservationValues(levelStation.id, "sealev_dvr", queryStartIso, queryEndIso)
        : Promise.resolve([]),
      levelStation
        ? fetchObservationValues(levelStation.id, "sealev_ln", queryStartIso, queryEndIso)
        : Promise.resolve([]),
    ]);

    // Saml vandstand fra både DVR og LN
    const combinedLevelVals: { ts: number; value: number }[] = [
      ...levelDvrVals,
      ...levelLnVals,
    ];

    const map: { [ts: number]: OceanPoint } = {};

    for (const p of tempVals) {
      if (!map[p.ts]) map[p.ts] = { ts: p.ts };
      map[p.ts].waterTempC = p.value;
    }
    for (const p of combinedLevelVals) {
      if (!map[p.ts]) map[p.ts] = { ts: p.ts };
      map[p.ts].waterLevelCM = p.value;
    }

    const series = Object.values(map).sort((a, b) => a.ts - b.ts);

    let tempNumbers: number[] = [];
    let levelNumbers: number[] = [];

    if (durationMs < ONE_HOUR_MS) {
      // Kort tur: brug kun den måling (temp / level), der er tættest på turens midtpunkt
      const nearestTemp = findNearestByTime(tempVals, midMs);
      const nearestLevel = findNearestByTime(combinedLevelVals, midMs);

      if (nearestTemp) tempNumbers = [nearestTemp.value];
      if (nearestLevel) levelNumbers = [nearestLevel.value];
    } else {
      // Længere tur: brug alle målinger
      tempNumbers = tempVals.map((p) => p.value);
      levelNumbers = combinedLevelVals.map((p) => p.value);
    }

    const stats: OceanStats = {
      waterTempC: buildStat(tempNumbers),
      waterLevelCM: buildStat(levelNumbers),
      series,
      // vi viser temp-stationens navn hvis muligt, ellers niveau-stationens
      stationId: tempStation?.id ?? levelStation?.id,
      stationName: tempStation?.name ?? levelStation?.name,
      fromTs: startMs,
      toTs: endMs,
    };

    const hasAny =
      (stats.waterTempC && !Number.isNaN(stats.waterTempC.avg)) ||
      (stats.waterLevelCM && !Number.isNaN(stats.waterLevelCM.avg)) ||
      series.length > 0;

    if (!hasAny) {
      // console.log("Ingen ocean-data (vandtemp/vandstand) fundet i vinduet for position", {
        lat: input.lat,
        lon: input.lon,
        tempStation: tempStation?.id,
        levelStation: levelStation?.id,
      });
      return null;
    }

    return stats;
  } catch (err) {
    // console.log("Fejl i fetchOceanForTrip:", err);
    return null;
  }
}
