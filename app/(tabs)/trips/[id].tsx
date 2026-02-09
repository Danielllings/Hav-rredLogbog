import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Modal,
  Platform,
  Dimensions,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import MapView, {
  Polyline,
  Marker,
  Region,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { getTrip, TripRow, deleteTrip, updateTrip } from "../../../lib/trips";
import { evaluateTripWithDmi } from "../../../lib/dmi";

// TILPAS DETTE IMPORT TIL DIT EKSISTERENDE spots-lib
import { listSpots, type SpotRow } from "../../../lib/spots";
import { useLanguage } from "../../../lib/i18n";

const { width } = Dimensions.get("window");

// --- TEMA (matcher Track/Index) ---
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  primary: "#FFFFFF",

  graphYellow: "#F59E0B",
  startGreen: "#22C55E",

  text: "#FFFFFF",
  textSec: "#A1A1AA",
  danger: "#FF453A",
  inputBg: "#2C2C2E",
  border: "#333333",
};

// --- MØRKT KORT STIL ---
// --- Kort stilarter (lys på Android for bedre synlighed) ---
const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#eeeeee" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#e5e5e5" }],
  },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e0e0e0" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#dadada" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#c9d7f2" }],
  },
];

// --- Mørkt kort stil ---
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const MAP_STYLE = LIGHT_MAP_STYLE;
const MAP_UI_STYLE = "light";
const HAS_GOOGLE_MAPS_KEY =
  Platform.OS !== "android"
    ? true
    : Boolean((Constants as any)?.expoConfig?.extra?.mapsApiKey);
const MAP_PROVIDER =
  Platform.OS === "android"
    ? HAS_GOOGLE_MAPS_KEY
      ? PROVIDER_GOOGLE
      : PROVIDER_DEFAULT
    : undefined;
const MAP_TYPE =
  Platform.OS === "android" && !HAS_GOOGLE_MAPS_KEY ? "none" : "standard";

type Pt = { latitude: number; longitude: number; t: number };
type Stat = { avg: number; min: number; max: number };
type Serie = { ts: number; v: number };

const MAX_DELETE_DURATION_SEC = 30 * 60;

// Hjælper til at tage fish-events ud af en tur
function extractFishEventsMs(trip: TripRow | null): number[] {
  const result: number[] = [];
  if (!trip) return result;

  try {
    const raw = (trip as any).fish_events_json
      ? JSON.parse((trip as any).fish_events_json)
      : null;

    if (!Array.isArray(raw)) return result;

    const startMs = new Date(trip.start_ts).getTime();

    for (const ev of raw) {
      if (typeof ev === "string") {
        const ts = Date.parse(ev);
        if (!Number.isNaN(ts)) result.push(ts);
      } else if (typeof ev === "number" && Number.isFinite(ev)) {
        // antager offset i sekunder
        result.push(startMs + ev * 1000);
      } else if (ev && typeof ev === "object") {
        if (typeof ev.ts === "string") {
          const ts = Date.parse(ev.ts);
          if (!Number.isNaN(ts)) result.push(ts);
        } else if (typeof ev.t_sec === "number") {
          result.push(startMs + ev.t_sec * 1000);
        }
      }
    }
  } catch {
    // ignorer
  }
  result.sort((a, b) => a - b);
  return result;
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} kl. ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}

function fmtClock(isoOrMs: string | number) {
  try {
    const d =
      typeof isoOrMs === "string" ? new Date(isoOrMs) : new Date(isoOrMs);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function degToCompass(deg?: number) {
  if (typeof deg !== "number" || deg < 0) return "—";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  const ix = Math.round(deg / 45) % 8;
  return dirs[ix];
}

// -----------------------------------------------------------------------------
// HOVEDKOMPONENT
// -----------------------------------------------------------------------------

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useLanguage();

  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  // Fangst-timestamps (ms)
  const [fishEventsMs, setFishEventsMs] = useState<number[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Samme som i index.tsx timeline-editor
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  const [selectedCatchIndex, setSelectedCatchIndex] = useState<number | null>(
    null
  );

  // --- SPOT-STATE / UI ---
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotSearch, setSpotSearch] = useState("");

  // --- WEATHER SYNC ---
  const [syncingWeather, setSyncingWeather] = useState(false);

  const loadTrip = useCallback(async () => {
    if (typeof id !== "string") return;
    setLoading(true);

    const loadedTrip = await getTrip(id);
    setTrip(loadedTrip);

    const ev = extractFishEventsMs(loadedTrip);
    setFishEventsMs(ev);

    if (loadedTrip) {
      // cursor som udgangspunkt på slut
      try {
        const endMs = new Date(loadedTrip.end_ts).getTime();
        if (Number.isFinite(endMs)) setCursorMs(endMs);
      } catch {
        setCursorMs(null);
      }
    } else {
      setCursorMs(null);
    }
    setSelectedCatchIndex(null);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // Synkroniser vejrdata for turen (bruges når offline-ture mangler vejr)
  const handleSyncWeather = useCallback(async () => {
    if (!trip || syncingWeather) return;

    setSyncingWeather(true);
    try {
      // Parse path_json til punkter
      let points: { latitude: number; longitude: number; t: number }[] = [];
      if (trip.path_json) {
        try {
          const parsed = JSON.parse(trip.path_json);
          if (Array.isArray(parsed)) {
            points = parsed.map((p: any) => ({
              latitude: p.latitude ?? p.lat,
              longitude: p.longitude ?? p.lng,
              t: p.t ?? new Date(trip.start_ts).getTime(),
            }));
          }
        } catch {
          // console.log("Kunne ikke parse path_json");
        }
      }

      // Kald DMI API
      const evalResult = await evaluateTripWithDmi({
        startIso: trip.start_ts,
        endIso: trip.end_ts,
        points,
      });

      if (evalResult) {
        // Opdater turen med den nye vejrdata
        const newMetaJson = JSON.stringify({ evaluation: evalResult });
        await updateTrip(trip.id, { meta_json: newMetaJson });

        // Genindlæs turen for at vise de nye data
        await loadTrip();
      } else {
        // console.log("Ingen vejrdata tilgængelig fra DMI");
      }
    } catch (e) {
      // console.log("Fejl ved synkronisering af vejrdata:", e);
    } finally {
      setSyncingWeather(false);
    }
  }, [trip, syncingWeather, loadTrip]);

  // hent spots til spot-picker (samme data som på spot-weather siden)
  useEffect(() => {
    (async () => {
      try {
        setSpotsLoading(true);
        const rows = await listSpots();
        setSpots(rows || []);
      } catch (e) {
        // console.log("Kunne ikke hente spots", e);
        setSpots([]);
      } finally {
        setSpotsLoading(false);
      }
    })();
  }, []);

  const filteredSpots = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((s) =>
      (s.name || "").toLowerCase().includes(q)
    );
  }, [spots, spotSearch]);

  const { pathPoints, initialRegion, evaluation } = useMemo(() => {
    if (!trip)
      return {
        pathPoints: [] as Pt[],
        initialRegion: undefined as Region | undefined,
        evaluation: null as any,
      };

    // Path
    let pathPoints: Pt[] = [];
    try {
      pathPoints = trip.path_json ? JSON.parse(trip.path_json) : [];
    } catch {}

    let initialRegion: Region | undefined;
    if (pathPoints.length > 0) {
      const avgLat = pathPoints.reduce((sum, p) => sum + p.latitude, 0) / pathPoints.length;
      const avgLon =
        pathPoints.reduce((sum, p) => sum + p.longitude, 0) / pathPoints.length;
      initialRegion = {
        latitude: avgLat,
        longitude: avgLon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    // Vejr-evaluering
    let evaluation: any = null;
    try {
      const meta = trip.meta_json ? JSON.parse(trip.meta_json) : {};

      evaluation =
        meta?.evaluation || meta?.summary?.evaluation || (meta && meta.source ? meta : null);

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
    } catch {}

    return { pathPoints, initialRegion, evaluation };
  }, [trip]);

  const dataTimeStr = useMemo(() => {
    if (!evaluation) return null;
    const s =
      evaluation.airTempSeries ||
      evaluation.windSpeedSeries ||
      evaluation.waterTempSeries ||
      evaluation.waterLevelSeries;
    if (!s || !s.length) return null;
    const d = new Date(s[s.length - 1].ts);
    try {
      return `${d.toLocaleDateString()} kl. ${d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return d.toISOString();
    }
  }, [evaluation]);

  const handleDelete = () => {
    if (!trip || trip.duration_sec > MAX_DELETE_DURATION_SEC) {
      return;
    }
    setDeleteConfirmVisible(true);
  };

  const confirmDelete = async () => {
    setDeleteConfirmVisible(false);
    if (typeof id !== "string") return;
    await deleteTrip(id);
    router.replace("/(tabs)");
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <Text style={styles.title}>{t("tripNotFound")}</Text>
      </View>
    );
  }

  // --- tidslinje-beregning (samme princip som index.tsx) ---
  const tripStartMs = new Date(trip.start_ts).getTime();
  const tripEndMs = new Date(trip.end_ts).getTime();
  const durationMs = Math.max(1, tripEndMs - tripStartMs);
  const timelineWidth = width - 80;
  const effectiveCursorMs =
    cursorMs ??
    (Number.isFinite(tripEndMs)
      ? tripEndMs
      : Number.isFinite(tripStartMs)
      ? tripStartMs
      : null);

  // Antal fisk til visning: brug events hvis de findes, ellers fallback til trip.fish_count
  const fishCountDisplay =
    fishEventsMs.length > 0 ? fishEventsMs.length : (trip.fish_count ?? 0);

  function handleTimelineTouch(e: any) {
    if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs)) return;
    const x = e.nativeEvent.locationX;
    const usableWidth = Math.max(1, timelineWidth - 16);
    const rel = Math.min(1, Math.max(0, (x - 8) / usableWidth));
    const ms = tripStartMs + rel * durationMs;
    setCursorMs(ms);
    setSelectedCatchIndex(null);
  }

  function addCatchAtCursor() {
    if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs)) return;
    const ms =
      effectiveCursorMs ??
      (Number.isFinite(tripStartMs)
        ? tripStartMs + durationMs / 2
        : Date.now());
    setFishEventsMs((prev) => [...prev, ms].sort((a, b) => a - b));
  }

  function removeSelectedCatch() {
    if (selectedCatchIndex == null) return;
    setFishEventsMs((prev) => prev.filter((_, idx) => idx !== selectedCatchIndex));
    setSelectedCatchIndex(null);
  }

  const showDeleteButton = trip.duration_sec <= MAX_DELETE_DURATION_SEC;
  const hasClimate = !!(evaluation?.stationName || evaluation?.stationId);
  const hasOcean = !!(evaluation?.oceanStationName || evaluation?.oceanStationId);

  async function handleSelectSpot(s: SpotRow | null) {
    if (!trip) {
      setSpotModalVisible(false);
      return;
    }
    try {
      await updateTrip(trip.id, {
        spot_id: s ? s.id : null,
        spot_name: s ? s.name : null,
      } as any);

      setTrip((prev) =>
        prev
          ? ({
              ...prev,
              spot_id: s ? s.id : null,
              spot_name: s ? s.name : null,
            } as any)
          : prev
      );
    } catch (e) {
      // console.log("Fejl ved opdatering af spot på tur:", e);
    }
    setSpotModalVisible(false);
  }

  const currentSpotId = (trip as any).spot_id ?? null;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* TUR INFO + FANGST-TIMELINE */}
        <View style={styles.card}>
          {/* Header med dato */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>
              {new Date(trip.start_ts).toLocaleDateString("da-DK", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Text>
            {(trip as any).spot_name && (
              <View style={styles.spotBadge}>
                <Ionicons name="location" size={12} color={THEME.graphYellow} />
                <Text style={styles.spotBadgeText}>{(trip as any).spot_name}</Text>
              </View>
            )}
          </View>

          {/* Symmetrisk 3x2 grid */}
          <View style={styles.infoGrid}>
            <Info label={t("fishCaughtLabel")} value={`${fishCountDisplay}`} highlight />
            <Info label={t("duration")} value={fmtTime(trip.duration_sec)} />
            <Info label={t("distance")} value={`${(trip.distance_m / 1000).toFixed(1)} km`} />
          </View>

          {/* Spot redigér */}
          <Pressable
            style={styles.spotEditBtn}
            onPress={() => setSpotModalVisible(true)}
          >
            <Ionicons name="location-outline" size={14} color={THEME.textSec} />
            <Text style={styles.spotEditText}>
              {(trip as any).spot_name ? t("changeLocation") : t("addLocation")}
            </Text>
          </Pressable>

          <FishTimeline
            startIso={trip.start_ts}
            endIso={trip.end_ts}
            fishEventsMs={fishEventsMs}
            onEdit={() => setEditModalVisible(true)}
            t={t}
          />

          <View style={styles.periodSection}>
            <View style={styles.periodItem}>
              <Ionicons name="play-circle-outline" size={16} color={THEME.startGreen} />
              <Text style={styles.periodText}>{fmtDateTime(trip.start_ts)}</Text>
            </View>
            <View style={styles.periodItem}>
              <Ionicons name="stop-circle-outline" size={16} color={THEME.danger} />
              <Text style={styles.periodText}>{fmtDateTime(trip.end_ts)}</Text>
            </View>
          </View>
        </View>

        {/* VEJRDATA (over kortet) */}
        <View style={styles.card}>
          <Text style={styles.title}>{t("weatherDuringFishing")}</Text>

          {!evaluation ? (
            <View style={styles.noWeatherContainer}>
              <Text style={styles.body}>{t("noWeatherForPeriod")}</Text>
              <Pressable
                style={styles.syncWeatherBtn}
                onPress={handleSyncWeather}
                disabled={syncingWeather}
              >
                {syncingWeather ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="sync" size={16} color="#000" />
                    <Text style={styles.syncWeatherBtnText}>{t("syncWeather")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : evaluation.note && !evaluation.airTempC && !evaluation.windMS ? (
            <View style={styles.noWeatherContainer}>
              <Text style={styles.body}>{evaluation.note}</Text>
              <Pressable
                style={styles.syncWeatherBtn}
                onPress={handleSyncWeather}
                disabled={syncingWeather}
              >
                {syncingWeather ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="sync" size={16} color="#000" />
                    <Text style={styles.syncWeatherBtnText}>{t("syncWeather")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {evaluation.note && (
                <Text style={styles.noteText}>{t("note")}: {evaluation.note}</Text>
              )}

              {evaluation.airTempC && (
                <StatLine
                  label={t("airTempLabel")}
                  stat={evaluation.airTempC}
                  fmt={(v) => `${v.toFixed(1)}°C`}
                />
              )}

              {evaluation.windMS && (
                <StatLine
                  label={t("windLabel")}
                  stat={evaluation.windMS}
                  fmt={(v) => `${v.toFixed(1)} m/s`}
                  direction={evaluation.windDirDeg?.avg}
                />
              )}

              {evaluation.waterTempC && (
                <StatLine
                  label={t("seaTempLabel")}
                  stat={evaluation.waterTempC}
                  fmt={(v) => `${v.toFixed(1)}°C`}
                />
              )}

              {evaluation.waterLevelCM && (
                <StatLine
                  label={t("waterLevelLabel")}
                  stat={evaluation.waterLevelCM}
                  fmt={(v) => `${v.toFixed(0)} cm`}
                />
              )}

              {evaluation.airTempSeries?.length > 0 && (
                <StatGraph
                  series={evaluation.airTempSeries}
                  label={t("airTemp")}
                  unit="°C"
                />
              )}

              {evaluation.windSpeedSeries?.length > 0 && (
                <StatGraph
                  series={evaluation.windSpeedSeries}
                  label={t("windSpeed")}
                  unit="m/s"
                />
              )}

              {evaluation.waterTempSeries?.length > 0 && (
                <StatGraph
                  series={evaluation.waterTempSeries}
                  label={t("waterTemp")}
                  unit="°C"
                />
              )}

              {evaluation.waterLevelSeries?.length > 0 && (
                <StatGraph
                  series={evaluation.waterLevelSeries}
                  label={t("waterLevel")}
                  unit="cm"
                />
              )}

              <View style={styles.sourceSection}>
                <View style={styles.sourceHeader}>
                  <Text style={styles.sourceLabel}>{t("sourceDmi")}</Text>
                  <View style={styles.sourceHeaderRight}>
                    {dataTimeStr && (
                      <Text style={styles.sourceTime}>{dataTimeStr}</Text>
                    )}
                    <Pressable
                      style={styles.syncWeatherBtnSmall}
                      onPress={handleSyncWeather}
                      disabled={syncingWeather}
                    >
                      {syncingWeather ? (
                        <ActivityIndicator size="small" color={THEME.graphYellow} />
                      ) : (
                        <Ionicons name="sync" size={16} color={THEME.graphYellow} />
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sourceStatusRow}>
                  <View style={styles.sourceStatus}>
                    <Ionicons
                      name={hasClimate ? "checkmark-circle" : "close-circle"}
                      size={16}
                      color={hasClimate ? THEME.startGreen : THEME.danger}
                    />
                    <Text style={styles.sourceStatusText}>{t("weatherDataLabel")}</Text>
                  </View>

                  <View style={styles.sourceStatus}>
                    <Ionicons
                      name={hasOcean ? "checkmark-circle" : "close-circle"}
                      size={16}
                      color={hasOcean ? THEME.startGreen : THEME.danger}
                    />
                    <Text style={styles.sourceStatusText}>{t("oceanDataLabel")}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* KORTET NEDERST */}
        <View style={styles.card}>
          <Text style={styles.title}>{t("route")}</Text>
          <View style={styles.mapContainer}>
            {initialRegion ? (
              <MapView
                style={styles.map}
                initialRegion={initialRegion}
                region={initialRegion}
                customMapStyle={MAP_STYLE}
                userInterfaceStyle={MAP_UI_STYLE}
                provider={MAP_PROVIDER}
                mapType={MAP_TYPE}
              >
                {pathPoints.length > 0 && (
                  <Polyline
                    coordinates={pathPoints.map((p) => ({
                      latitude: p.latitude,
                      longitude: p.longitude,
                    }))}
                    strokeWidth={4}
                    strokeColor={THEME.primary}
                  />
                )}
                {pathPoints.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude: pathPoints[0].latitude,
                      longitude: pathPoints[0].longitude,
                    }}
                    pinColor="green"
                    title="Start"
                  />
                )}
                {pathPoints.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude:
                        pathPoints[pathPoints.length - 1].latitude,
                      longitude:
                        pathPoints[pathPoints.length - 1].longitude,
                    }}
                    pinColor="red"
                    title="Slut"
                  />
                )}
              </MapView>
            ) : (
              <View style={styles.noMap}>
                <Text style={styles.noMapText}>
                  {t("noGpsData")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* SLET TUR / INFO */}
        {showDeleteButton ? (
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.danger]}
              onPress={handleDelete}
            >
              <Text style={styles.dangerText}>{t("deleteTrip")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: THEME.textSec }]}>
              {t("tripCannotBeDeleted")}
            </Text>
            <Text
              style={[
                styles.infoVal,
                { color: THEME.danger, fontWeight: "500", fontSize: 14 },
              ]}
            >
              {t("durationOver30Min")}
            </Text>
          </View>
        )}

        {/* === SLET TUR BEKRÆFTELSESMODAL === */}
        <Modal visible={deleteConfirmVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{t("deleteTrip")}</Text>
              <Text style={styles.modalText}>
                {t("deleteTripConfirm")}
              </Text>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => setDeleteConfirmVisible(false)}
                >
                  <Text style={styles.ghostText}>{t("back")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.danger]}
                  onPress={confirmDelete}
                >
                  <Text style={styles.dangerText}>{t("yesStop")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === REDIGÉR FANGST-TIMELINE MODAL === */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.editModal}>
              {/* Header med ikon og tæller */}
              <View style={styles.editModalHeader}>
                <View style={styles.editModalTitleRow}>
                  <Ionicons name="fish" size={24} color={THEME.graphYellow} />
                  <Text style={styles.editModalTitle}>{t("editCatches")}</Text>
                </View>
                <View style={styles.editModalCountBadge}>
                  <Text style={styles.editModalCountText}>{fishEventsMs.length}</Text>
                </View>
              </View>

              {/* Tidsvælger */}
              <View style={styles.editTimeSelector}>
                <View style={styles.editTimeCurrent}>
                  <Text style={styles.editTimeCurrentLabel}>{t("selectedTime")}</Text>
                  <Text style={styles.editTimeCurrentValue}>
                    {effectiveCursorMs ? fmtClock(effectiveCursorMs) : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Timeline */}
              <View style={styles.editTimelineContainer}>
                <View
                  style={[styles.editTimelineBar, { width: timelineWidth }]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleTimelineTouch}
                  onResponderMove={handleTimelineTouch}
                >
                  {/* Gradient baggrund */}
                  <View style={styles.editTimelineGradient} />

                  {/* cursor-position */}
                  {effectiveCursorMs != null &&
                    Number.isFinite(tripStartMs) &&
                    Number.isFinite(tripEndMs) &&
                    (() => {
                      const rel = (effectiveCursorMs - tripStartMs) / durationMs;
                      const clamped = Math.min(1, Math.max(0, rel));
                      const usableWidth = timelineWidth - 24;
                      const left = 12 + clamped * usableWidth;
                      return (
                        <View style={[styles.editCursor, { left }]}>
                          <View style={styles.editCursorLine} />
                          <View style={styles.editCursorDot} />
                        </View>
                      );
                    })()}

                  {/* markører */}
                  {fishEventsMs.map((t, idx) => {
                    if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs))
                      return null;
                    const rel = (t - tripStartMs) / durationMs;
                    const clamped = Math.min(1, Math.max(0, rel));
                    const usableWidth = timelineWidth - 24;
                    const left = 12 + clamped * usableWidth;
                    const isSelected = selectedCatchIndex === idx;

                    return (
                      <Pressable
                        key={`${t}-${idx}`}
                        style={[styles.editMarker, { left }]}
                        onPress={() => {
                          setSelectedCatchIndex(idx);
                          setCursorMs(t);
                        }}
                      >
                        <View style={[
                          styles.editMarkerPill,
                          isSelected && styles.editMarkerPillActive,
                        ]}>
                          <Text style={[
                            styles.editMarkerText,
                            isSelected && styles.editMarkerTextActive,
                          ]}>
                            {fmtClock(t)}
                          </Text>
                        </View>
                        <View style={styles.editMarkerStem} />
                        <View style={[
                          styles.editMarkerDot,
                          isSelected && styles.editMarkerDotActive,
                        ]} />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Tidsakse */}
                <View style={styles.editTimeAxis}>
                  <Text style={styles.editTimeAxisText}>
                    {Number.isFinite(tripStartMs) ? fmtClock(tripStartMs) : "--:--"}
                  </Text>
                  <Text style={styles.editTimeAxisText}>
                    {Number.isFinite(tripEndMs) ? fmtClock(tripEndMs) : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.editActions}>
                <Pressable style={styles.editAddBtn} onPress={addCatchAtCursor}>
                  <Ionicons name="add" size={20} color="#000" />
                  <Text style={styles.editAddBtnText}>{t("addCatchLabel")}</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.editDeleteBtn,
                    selectedCatchIndex == null && styles.editDeleteBtnDisabled,
                  ]}
                  disabled={selectedCatchIndex == null}
                  onPress={removeSelectedCatch}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={selectedCatchIndex == null ? THEME.textSec : THEME.danger}
                  />
                  <Text style={[
                    styles.editDeleteBtnText,
                    selectedCatchIndex == null && styles.editDeleteBtnTextDisabled,
                  ]}>{t("deleteSelected")}</Text>
                </Pressable>
              </View>

              {/* Hint tekst */}
              <Text style={styles.editHint}>
                {t("timelineHint")}
              </Text>

              {/* Footer buttons */}
              <View style={styles.editFooter}>
                <Pressable
                  style={styles.editCancelBtn}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.editCancelBtnText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  style={styles.editSaveBtn}
                  onPress={async () => {
                    if (!trip) {
                      setEditModalVisible(false);
                      return;
                    }

                    const sorted = [...fishEventsMs].sort((a, b) => a - b);
                    const eventsIso = sorted.map((ms) => new Date(ms).toISOString());

                    try {
                      await updateTrip(trip.id, {
                        fish_count: eventsIso.length,
                        fish_events_json: JSON.stringify(eventsIso),
                      } as any);

                      setTrip((prev) =>
                        prev
                          ? ({
                              ...prev,
                              fish_count: eventsIso.length,
                              fish_events_json: JSON.stringify(eventsIso),
                            } as any)
                          : prev
                      );
                    } catch (e) {
                      // console.log("Fejl ved gem af fangst-events:", e);
                    }

                    setEditModalVisible(false);
                  }}
                >
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={styles.editSaveBtnText}>{t("saveChanges")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === REDIGÉR SPOT MODAL === */}
        <Modal
          visible={spotModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSpotModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBoxTall}>
              <Text style={styles.modalTitle}>{t("selectSpot")}</Text>
              <Text style={styles.modalText}>
                {t("selectSpotForTrip")}
              </Text>

              {/* søg-felt */}
              <View style={styles.spotSearchRow}>
                <Ionicons
                  name="search"
                  size={18}
                  color={THEME.textSec}
                  style={{ marginRight: 6 }}
                />
                <TextInput
                  value={spotSearch}
                  onChangeText={setSpotSearch}
                  placeholder={t("searchSpotName")}
                  placeholderTextColor={THEME.textSec}
                  style={styles.spotSearchInput}
                  returnKeyType="search"
                />
              </View>

              <ScrollView
                style={{ maxHeight: 320, marginTop: 10 }}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {spotsLoading ? (
                  <View style={{ paddingVertical: 12 }}>
                    <ActivityIndicator color={THEME.primary} />
                  </View>
                ) : filteredSpots.length === 0 ? (
                  <Text style={{ color: THEME.textSec, fontSize: 14 }}>
                    {t("noSpotsFound")}
                  </Text>
                ) : (
                  filteredSpots.map((s) => {
                    const active = currentSpotId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        style={[
                          styles.spotItem,
                          active && styles.spotItemActive,
                        ]}
                        onPress={() => handleSelectSpot(s)}
                      >
                        <Text
                          style={
                            active
                              ? styles.spotItemTextActive
                              : styles.spotItemText
                          }
                        >
                          {s.name || t("withoutName")}
                        </Text>
                        {active && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#000"
                          />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.modalBtnRow}>
                {currentSpotId && (
                  <Pressable
                    style={[styles.btn, styles.ghost]}
                    onPress={() => handleSelectSpot(null)}
                  >
                    <Text style={styles.ghostText}>{t("removeSpot")}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.btn, styles.primaryBtn]}
                  onPress={() => setSpotModalVisible(false)}
                >
                  <Text style={styles.primaryText}>{t("close")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </>
  );
}

// -----------------------------------------------------------------------------
// UNDERKOMPONENTER
// -----------------------------------------------------------------------------

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoVal, highlight && { color: THEME.graphYellow }]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

// Lille visnings-tidslinje på kortform
function FishTimeline({
  startIso,
  endIso,
  fishEventsMs,
  onEdit,
  t,
}: {
  startIso: string;
  endIso: string;
  fishEventsMs: number[];
  onEdit: () => void;
  t: (key: string) => string;
}) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const durationMs = endMs - startMs;
  const clamped = fishEventsMs
    .map((t) => Math.min(Math.max(t, startMs), endMs))
    .filter((t) => Number.isFinite(t));

  return (
    <View style={styles.timelineWrapperSmall}>
      <View style={styles.timelineHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="fish-outline" size={18} color={THEME.graphYellow} />
          <Text style={styles.timelineTitle}>{t("catchesOnTimeline")}</Text>
        </View>
      </View>

      <View style={styles.timelineBox}>
        {/* lodrette “grid”-linjer */}
        <View style={styles.timelineGridRow} />
        <View style={[styles.timelineGridRow, { top: "50%" }]} />
        <View style={[styles.timelineGridRow, { bottom: 0 }]} />

        {/* horisontal akse */}
        <View style={styles.timelineAxis} />

        {/* fangst-markører */}
        <View style={styles.timelineAxisInner}>
          {clamped.map((t, idx) => {
            const rel = (t - startMs) / durationMs;
            const left = `${rel * 100}%`;
            return (
              <View key={idx} style={[styles.timelineEventWrapper, { left }]}>
                <View style={styles.timelineEvent} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.timelineTimeRowSmall}>
        <View>
          <Text style={styles.timelineTimeLabel}>{t("start")}</Text>
          <Text style={styles.timelineTimeValue}>{fmtClock(startIso)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.timelineTimeLabel}>{t("stop")}</Text>
          <Text style={styles.timelineTimeValue}>{fmtClock(endIso)}</Text>
        </View>
      </View>

      <View style={styles.timelineEditRow}>
        <Pressable style={styles.timelineEditBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={16} color={THEME.textSec} />
          <Text style={styles.timelineEditText}>{t("editCatches")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WindCompass({ directionDeg }: { directionDeg?: number }) {
  if (directionDeg === undefined || Number.isNaN(directionDeg)) {
    return (
      <View style={styles.compass}>
        <Text style={styles.compassN}>N</Text>
        <Ionicons name="arrow-up" size={20} color={THEME.textSec} />
      </View>
    );
  }

  const rot = ((directionDeg ?? 0) + 180) % 360;

  return (
    <View style={styles.compass}>
      <Text style={styles.compassN}>N</Text>
      <Ionicons
        name="arrow-up"
        size={22}
        color={THEME.graphYellow}
        style={{ transform: [{ rotate: `${rot}deg` }] }}
      />
    </View>
  );
}

function StatLine({
  label,
  stat,
  fmt,
  direction,
}: {
  label: string;
  stat: Stat;
  fmt: (v: number) => string;
  direction?: number;
}) {
  if (!Number.isFinite(stat.avg)) return null;

  const avgValue = fmt(stat.avg);
  const minMaxValue =
    Number.isFinite(stat.min) &&
    Number.isFinite(stat.max) &&
    stat.min !== stat.max
      ? `(${fmt(stat.min)} - ${fmt(stat.max)})`
      : null;

  if (direction !== undefined && Number.isFinite(direction)) {
    const compassTxt = degToCompass(direction);
    return (
      <View style={styles.statRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          {minMaxValue && <Text style={styles.minMaxText}>{minMaxValue}</Text>}
        </View>
        <View style={styles.windRight}>
          <View style={{ alignItems: "flex-end", marginRight: 8 }}>
            <Text style={styles.infoVal}>{avgValue}</Text>
            <Text style={styles.windDirText}>
              {compassTxt} ({Math.round(direction)}°)
            </Text>
          </View>
          <WindCompass directionDeg={direction} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.statRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.infoVal}>{avgValue}</Text>
        {minMaxValue && <Text style={styles.minMaxText}>{minMaxValue}</Text>}
      </View>
    </View>
  );
}

function StatGraph({ series, label, unit }: { series: Serie[]; label: string; unit: string }) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  if (!series || series.length === 0) return null;

  const values = series.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const last = series[series.length - 1];
  const lastValStr = `${last.v.toFixed(1)}${unit}`;

  const MAX_POINTS = 40;
  const step = Math.ceil(series.length / MAX_POINTS);
  const sampled = series.filter((_, idx) => idx % step === 0);

  if (sampled.length < 2) {
    return null;
  }

  const firstTime = new Date(sampled[0].ts).getHours().toString().padStart(2, "0");
  const lastTime = new Date(sampled[sampled.length - 1].ts)
    .getHours()
    .toString()
    .padStart(2, "0");

  const HEIGHT = 80;
  const PADDING_X = 12;
  const PADDING_Y = 12;
  const GRAPH_H = HEIGHT - PADDING_Y * 2;

  const graphWidth = Math.max(layoutWidth - PADDING_X * 2, 0);

  // Beregn punkter
  const points = sampled.map((d, i) => {
    const x = PADDING_X + (i / (sampled.length - 1)) * graphWidth;
    const y = PADDING_Y + GRAPH_H - ((d.v - min) / span) * GRAPH_H;
    return { x, y, data: d };
  });

  // Smooth bezier curve path
  const makeSmoothPath = () => {
    if (points.length < 2) return "";

    let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Catmull-Rom to Bezier conversion
      const tension = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }

    return path;
  };

  const makeAreaPath = (linePath: string) => {
    if (!linePath || points.length === 0) return "";
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    return `${linePath} L ${lastPt.x.toFixed(1)},${HEIGHT} L ${firstPt.x.toFixed(1)},${HEIGHT} Z`;
  };

  const linePath = makeSmoothPath();
  const areaPath = makeAreaPath(linePath);
  const lastPoint = points[points.length - 1];

  // Touch handling
  const handleTouch = (e: any) => {
    const x = e.nativeEvent.locationX;
    // Find nærmeste punkt
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - x);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setTouchIndex(closestIdx);
  };

  const handleTouchEnd = () => {
    setTouchIndex(null);
  };

  // Aktiv punkt data
  const activePoint = touchIndex !== null ? points[touchIndex] : null;
  const activeData = activePoint?.data;
  const activeTimeStr = activeData
    ? new Date(activeData.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const activeValStr = activeData ? `${activeData.v.toFixed(1)}${unit}` : null;

  // Display value - vis aktiv eller seneste
  const displayValue = activeValStr ?? lastValStr;
  const displayTime = activeTimeStr ?? null;

  return (
    <View style={styles.sparklineContainer}>
      <View style={styles.sparklineHeader}>
        <Text style={styles.sparklineLabel}>{label}</Text>
        <View style={styles.sparklineValueRow}>
          <Text style={styles.sparklineValue}>{displayValue}</Text>
          {displayTime ? (
            <Text style={styles.sparklineRange}>{displayTime}</Text>
          ) : (
            <Text style={styles.sparklineRange}>
              {min.toFixed(1)} – {max.toFixed(1)}
            </Text>
          )}
        </View>
      </View>

      <View
        style={styles.sparklineGraph}
        onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        {layoutWidth > 0 && (
          <Svg width={layoutWidth} height={HEIGHT}>
            <Defs>
              <LinearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={THEME.graphYellow} stopOpacity="0.25" />
                <Stop offset="1" stopColor={THEME.graphYellow} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            <Path d={areaPath} fill={`url(#grad-${label})`} />
            <Path
              d={linePath}
              fill="none"
              stroke={THEME.graphYellow}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Touch cursor line */}
            {activePoint && (
              <>
                <Path
                  d={`M ${activePoint.x},0 L ${activePoint.x},${HEIGHT}`}
                  stroke={THEME.graphYellow}
                  strokeWidth="1.5"
                  opacity={0.8}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="8"
                  fill={THEME.graphYellow}
                  opacity={0.3}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="5"
                  fill={THEME.graphYellow}
                />
              </>
            )}

            {/* Endpoint dot (kun når ikke touching) */}
            {!activePoint && (
              <>
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="6"
                  fill={THEME.graphYellow}
                  opacity={0.3}
                />
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="4"
                  fill={THEME.graphYellow}
                />
              </>
            )}
          </Svg>
        )}
      </View>

      <View style={styles.sparklineTimeRow}>
        <Text style={styles.sparklineTime}>{firstTime}:00</Text>
        <Text style={styles.sparklineTime}>{lastTime}:00</Text>
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// STYLES
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },

  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardDate: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.text,
    textTransform: "capitalize",
    marginBottom: 6,
  },
  spotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  spotBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.graphYellow,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textSec,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorder,
  },
  infoItem: {
    alignItems: "center",
    flex: 1,
  },
  infoLabel: {
    color: THEME.textSec,
    fontSize: 11,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoVal: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  infoRow: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginHorizontal: 16,
    marginBottom: 20,
  },

  sectionLabel: {
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: {
    color: THEME.text,
    fontSize: 14,
  },
  noWeatherContainer: {
    alignItems: "center",
    gap: 16,
  },
  syncWeatherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 160,
  },
  syncWeatherBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
  periodSection: {
    marginTop: 16,
    gap: 8,
  },
  periodItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  periodText: {
    color: THEME.text,
    fontSize: 13,
  },
  sourceSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sourceLabel: {
    fontSize: 12,
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sourceTime: {
    fontSize: 11,
    color: THEME.textSec,
  },
  sourceHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  syncWeatherBtnSmall: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  sourceStatusRow: {
    flexDirection: "row",
    gap: 20,
  },
  sourceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceStatusText: {
    fontSize: 13,
    color: THEME.text,
  },
  noteText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 4,
  },

  // RUTEKORT
  mapContainer: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
    backgroundColor: "#000",
  },
  map: { flex: 1 },
  noMap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.inputBg,
  },
  noMapText: { color: THEME.textSec },

  // SLET TUR KNAP
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  btn: {
    flex: 0.5,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  danger: { backgroundColor: THEME.danger },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Lille timeline (visning)
  timelineWrapperSmall: {
    marginTop: 8,
    marginBottom: 4,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  timelineTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  timelineBox: {
    height: 90,
    borderRadius: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 10,
    justifyContent: "center",
    overflow: "hidden",
  },
  timelineGridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.03)",
  },
  timelineAxis: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  timelineAxisInner: {
    flexDirection: "row",
    position: "absolute",
    left: 10,
    right: 10,
    height: "100%",
  },
  timelineEventWrapper: {
    position: "absolute",
    bottom: 18,
    width: 0,
    alignItems: "center",
  },
  timelineEvent: {
    width: 3,
    height: 36,
    backgroundColor: THEME.graphYellow,
    borderRadius: 999,
  },
  timelineTimeRowSmall: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  timelineTimeLabel: {
    fontSize: 11,
    color: THEME.textSec,
  },
  timelineTimeValue: {
    fontSize: 13,
    color: THEME.text,
    fontWeight: "600",
  },
  timelineEditRow: {
    marginTop: 10,
    alignItems: "flex-end",
  },
  timelineEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  timelineEditText: {
    color: THEME.textSec,
    fontSize: 13,
    fontWeight: "500",
  },

  // EDITOR / MODAL (kopi af index.tsx stil)
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "spaceBetween",
    alignItems: "flex-end",
    marginBottom: 12,
  } as any,
  timelineLabel: {
    color: THEME.textSec,
    fontSize: 11,
    fontWeight: "600",
  },
  timelineTime: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
  },
  timelineTimeBig: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "800",
  },
  timelineWrapper: {
    marginTop: 4,
    marginBottom: 8,
    alignItems: "center",
  },
  timelineBar: {
    height: 120,
    borderRadius: 12,
    backgroundColor: "#26262A",
    justifyContent: "center",
    paddingHorizontal: 0,
    overflow: "hidden",
    position: "relative",
  },
  timelineGridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#3A3A40",
  },
  timelineGridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#3A3A40",
  },
  timelineCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: THEME.graphYellow,
    opacity: 0.8,
  },
  timelineMarker: {
    position: "absolute",
    bottom: 14,
    alignItems: "center",
  },
  timelineMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.startGreen,
  },
  timelineMarkerDotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: THEME.startGreen,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  timelineMarkerLabelWrap: {
    marginBottom: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#00000080",
  },
  timelineMarkerLabelWrapActive: {
    backgroundColor: "#22C55E",
  },
  timelineMarkerLabel: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },
  timelineControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  addCatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1F2933",
  },
  addCatchBtnText: {
    color: THEME.startGreen,
    fontSize: 12,
    fontWeight: "700",
  },
  deleteCatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#3A1E21",
  },
  deleteCatchBtnText: {
    color: THEME.danger,
    fontSize: 12,
    fontWeight: "700",
  },

  // Sparkline grafer
  sparklineContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  sparklineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  sparklineLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.text,
  },
  sparklineValueRow: {
    alignItems: "flex-end",
  },
  sparklineValue: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.graphYellow,
  },
  sparklineRange: {
    fontSize: 11,
    color: THEME.textSec,
    marginTop: 2,
  },
  sparklineGraph: {
    height: 80,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    overflow: "hidden",
  },
  sparklineTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sparklineTime: {
    fontSize: 11,
    color: THEME.textSec,
  },

  // Grafer (legacy)
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  minMaxText: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 2,
    fontStyle: "italic",
  },
  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingRight: 40,
  },
  graphCurrentValue: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.text,
  },
  graphContainer: {
    position: "relative",
    height: 90,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  svg: {
    position: "absolute",
    left: 40,
    right: 0,
    top: 0,
    bottom: 0,
  },
  graphLabel: {
    position: "absolute",
    left: 0,
    fontSize: 12,
    color: THEME.textSec,
    fontWeight: "500",
    backgroundColor: "transparent",
    paddingRight: 4,
  },
  graphTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
    paddingHorizontal: 40,
  },
  graphTimeText: {
    fontSize: 11,
    color: THEME.textSec,
  },

  // Vind + kompas
  windRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  windDirText: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 2,
  },
  compass: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    backgroundColor: THEME.inputBg,
  },
  compassN: {
    position: "absolute",
    top: 3,
    fontSize: 9,
    fontWeight: "600",
    color: THEME.textSec,
  },

  // Modal (samme stil som Track)
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  modalBoxTall: {
    width: "100%",
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    color: THEME.text,
  },
  modalText: {
    color: "#CCC",
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  ghost: { backgroundColor: "#333" },
  ghostText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  primaryBtn: {
    backgroundColor: THEME.graphYellow,
  },
  primaryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },

  // NY EDIT FANGST MODAL
  editModal: {
    width: "100%",
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  editModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  editModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  editModalCountBadge: {
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  editModalCountText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  editTimeSelector: {
    alignItems: "center",
    marginBottom: 16,
  },
  editTimeCurrent: {
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  editTimeCurrentLabel: {
    fontSize: 11,
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editTimeCurrentValue: {
    fontSize: 32,
    fontWeight: "700",
    color: THEME.graphYellow,
    letterSpacing: -1,
  },
  editTimelineContainer: {
    marginBottom: 16,
  },
  editTimelineBar: {
    height: 140,
    borderRadius: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "visible",
    position: "relative",
  },
  editTimelineGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  editCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 5,
  },
  editCursorLine: {
    position: "absolute",
    top: 0,
    bottom: 20,
    width: 2,
    backgroundColor: THEME.graphYellow,
    borderRadius: 1,
  },
  editCursorDot: {
    position: "absolute",
    bottom: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: THEME.graphYellow,
    borderWidth: 3,
    borderColor: THEME.card,
  },
  editMarker: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
    zIndex: 10,
  },
  editMarkerPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    marginBottom: 4,
  },
  editMarkerPillActive: {
    backgroundColor: THEME.startGreen,
  },
  editMarkerText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.startGreen,
  },
  editMarkerTextActive: {
    color: "#000",
  },
  editMarkerStem: {
    width: 2,
    height: 60,
    backgroundColor: THEME.startGreen,
    opacity: 0.5,
  },
  editMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: THEME.startGreen,
    marginTop: -1,
  },
  editMarkerDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },
  editTimeAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 8,
  },
  editTimeAxisText: {
    fontSize: 12,
    color: THEME.textSec,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  editAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.graphYellow,
    paddingVertical: 14,
    borderRadius: 14,
  },
  editAddBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  editDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  editDeleteBtnDisabled: {
    backgroundColor: THEME.inputBg,
  },
  editDeleteBtnText: {
    color: THEME.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  editDeleteBtnTextDisabled: {
    color: THEME.textSec,
  },
  editHint: {
    textAlign: "center",
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 16,
  },
  editFooter: {
    flexDirection: "row",
    gap: 12,
  },
  editCancelBtn: {
    flex: 0.4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  editCancelBtnText: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  editSaveBtn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.startGreen,
  },
  editSaveBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },

  // SPOT-EDITERING
  spotEditRow: {
    marginTop: 6,
    marginBottom: 4,
    alignItems: "flex-start",
  },
  spotEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotEditText: {
    color: THEME.textSec,
    fontSize: 13,
    fontWeight: "500",
  },
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  spotSearchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
  },
  spotItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotItemActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  spotItemText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  spotItemTextActive: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
});
