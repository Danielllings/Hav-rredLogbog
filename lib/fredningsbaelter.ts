// lib/fredningsbaelter.ts
// Henter og cacher fredningsbælter fra Fiskeristyrelsens ArcGIS Feature Service

import AsyncStorage from "@react-native-async-storage/async-storage";

const ARCGIS_URL =
  "https://services-eu1.arcgis.com/c3o7qz6F0HswtuVz/arcgis/rest/services/Fredningsbælter/FeatureServer/0/query";

const CACHE_KEY = "fredningsbaelter_geojson_v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dage

// ----- TYPES -----

export interface FredningsbaelteProperties {
  FID: number;
  ID: number;
  NAVN: string;
  VANDLOBSNR: string | null;
  FREDNINGSP: string | null; // fx "16. september - 15. marts" eller "Helårligt"
  PeriodeTyp: string | null; // fx "Halvårlig", "Helårlig"
  LOVGRUNDLA: string | null;
  BEMARKNING: string | null;
  WWW: string | null;
  WWW2: string | null;
  Kontaktste: string | null;
  Redskab: string | null; // Redskabsbegrænsninger
  Baglimit: number | null; // Fangstbegrænsning
  Beskrivels: string | null; // Beskrivelse
  Shape__Area: number;
  Shape__Length: number;
}

export interface FredningsbaelteFeature {
  type: "Feature";
  id: number;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: FredningsbaelteProperties;
}

export interface FredningsbaelterGeoJSON {
  type: "FeatureCollection";
  features: FredningsbaelteFeature[];
}

export type PeriodeType = "helaarlig" | "halvaarlig" | "anden";

// ----- COLOR HELPERS -----

/**
 * Bestem periodetypen baseret på fredningsperiode-tekst
 */
export function getPeriodeType(feature: FredningsbaelteFeature): PeriodeType {
  const periode = feature.properties.FREDNINGSP?.toLowerCase() ?? "";
  const periodeTyp = feature.properties.PeriodeTyp?.toLowerCase() ?? "";

  // Helårlig fredning
  if (
    periode.includes("helår") ||
    periodeTyp.includes("helår") ||
    periode.includes("hele året")
  ) {
    return "helaarlig";
  }

  // Standard halvårlig: 16. september - 15. marts
  if (
    periode.includes("16. september") ||
    periode.includes("september") && periode.includes("marts")
  ) {
    return "halvaarlig";
  }

  // Andre perioder
  return "anden";
}

/**
 * Få farve baseret på periodetype
 * - Rød: Helårlig fredning
 * - Blå: 16. sep - 15. mar (standard halvårlig)
 * - Gul: Andre perioder
 */
export function getPeriodeColor(periodeType: PeriodeType): string {
  switch (periodeType) {
    case "helaarlig":
      return "#FF4444"; // Rød
    case "halvaarlig":
      return "#4488FF"; // Blå
    case "anden":
      return "#FFAA00"; // Gul/orange
  }
}

/**
 * Få gennemsigtig fill-farve
 */
export function getPeriodeFillColor(periodeType: PeriodeType): string {
  switch (periodeType) {
    case "helaarlig":
      return "rgba(255, 68, 68, 0.25)";
    case "halvaarlig":
      return "rgba(68, 136, 255, 0.25)";
    case "anden":
      return "rgba(255, 170, 0, 0.25)";
  }
}

/**
 * Få dansk label for periodetype
 */
export function getPeriodeLabel(
  periodeType: PeriodeType,
  language: "da" | "en" = "da"
): string {
  const labels = {
    da: {
      helaarlig: "Helårlig fredning",
      halvaarlig: "16. sep - 15. mar",
      anden: "Særlig periode",
    },
    en: {
      helaarlig: "Year-round protection",
      halvaarlig: "Sep 16 - Mar 15",
      anden: "Special period",
    },
  };
  return labels[language][periodeType];
}

// ----- CACHE -----

interface CacheEntry {
  timestamp: number;
  data: FredningsbaelterGeoJSON;
}

async function getFromCache(): Promise<FredningsbaelterGeoJSON | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const entry: CacheEntry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;

    if (age > CACHE_TTL_MS) {
      // Cache udløbet
      await AsyncStorage.removeItem(CACHE_KEY);
      return null;
    }

    return entry.data;
  } catch (err) {
    console.warn("[fredningsbaelter] Cache read error:", err);
    return null;
  }
}

async function saveToCache(data: FredningsbaelterGeoJSON): Promise<void> {
  try {
    const entry: CacheEntry = {
      timestamp: Date.now(),
      data,
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (err) {
    console.warn("[fredningsbaelter] Cache write error:", err);
  }
}

// ----- FETCH -----

/**
 * Hent alle fredningsbælter som GeoJSON.
 * Bruger cache hvis tilgængelig og ikke udløbet.
 */
export async function fetchFredningsbaelter(): Promise<FredningsbaelterGeoJSON> {
  // Prøv cache først
  const cached = await getFromCache();
  if (cached) {
    console.log("[fredningsbaelter] Using cached data");
    return cached;
  }

  // Hent fra ArcGIS
  console.log("[fredningsbaelter] Fetching from ArcGIS...");

  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    f: "geojson",
    // Hent alle features (max 2000 pr. request, men der er færre fredningsbælter)
  });

  const url = `${ARCGIS_URL}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch fredningsbælter: ${response.status}`);
  }

  const data: FredningsbaelterGeoJSON = await response.json();

  console.log(`[fredningsbaelter] Fetched ${data.features?.length ?? 0} zones`);

  // Gem i cache
  await saveToCache(data);

  return data;
}

/**
 * Tving genindlæsning af data (slet cache)
 */
export async function refreshFredningsbaelter(): Promise<FredningsbaelterGeoJSON> {
  await AsyncStorage.removeItem(CACHE_KEY);
  return fetchFredningsbaelter();
}

/**
 * Tjek om et punkt er inden for et fredningsbælte
 */
export function isPointInPolygon(
  lat: number,
  lng: number,
  feature: FredningsbaelteFeature
): boolean {
  const { geometry } = feature;

  // Håndter både Polygon og MultiPolygon
  const polygons: number[][][] =
    geometry.type === "MultiPolygon"
      ? (geometry.coordinates as number[][][][]).flat()
      : (geometry.coordinates as number[][][]);

  for (const ring of polygons) {
    if (pointInRing(lng, lat, ring)) {
      return true;
    }
  }

  return false;
}

// Ray-casting algorithm for point-in-polygon
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Find fredningsbælter der overlapper med et punkt
 */
export function findFredningsbaelterAtPoint(
  lat: number,
  lng: number,
  geojson: FredningsbaelterGeoJSON
): FredningsbaelteFeature[] {
  return geojson.features.filter((f) => isPointInPolygon(lat, lng, f));
}

/**
 * Tjek om fredningen er aktiv lige nu
 */
export function isFredningActive(feature: FredningsbaelteFeature): boolean {
  const periodeType = getPeriodeType(feature);

  // Helårlig er altid aktiv
  if (periodeType === "helaarlig") return true;

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Standard halvårlig: 16. september - 15. marts
  if (periodeType === "halvaarlig") {
    // Aktiv fra 16. sep til 15. mar
    if (month >= 9 && day >= 16) return true; // sep 16 - dec 31
    if (month <= 3 && day <= 15) return true; // jan 1 - mar 15
    if (month >= 10 || month <= 2) return true; // okt-feb
    return false;
  }

  // Andre perioder - antag aktiv (skal tjekkes manuelt)
  return true;
}
