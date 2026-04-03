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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { getTrip, TripRow, deleteTrip, updateTrip } from "../../../lib/trips";
import { evaluateTripWithDmi } from "../../../lib/dmi";

// TILPAS DETTE IMPORT TIL DIT EKSISTERENDE spots-lib
import { listSpots, type SpotRow } from "../../../lib/spots";
import { useLanguage } from "../../../lib/i18n";
import { useTheme } from "../../../lib/theme";

const { width } = Dimensions.get("window");

// --- NERO TEMA ---
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",
  primary: "#FFFFFF",

  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  startGreen: "#F59E0B",

  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
  inputBg: "#1E1E21",
  border: "#2A2A2E",
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
  const { t, language } = useLanguage();
  const { theme } = useTheme();

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

  // Check if trip has GPS path data for replay
  const hasReplayData = (() => {
    if (!trip.path_json) return false;
    try {
      const parsed = JSON.parse(trip.path_json);
      return Array.isArray(parsed) && parsed.length >= 2;
    } catch {
      return false;
    }
  })();

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
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0F" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* === HERO SECTION === */}
        <View style={styles.heroSection}>
          {/* Dato og lokation */}
          <View style={styles.heroHeader}>
            <View style={styles.heroHeaderLeft}>
              <Text style={styles.heroDate}>
                {new Date(trip.start_ts).toLocaleDateString("da-DK", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </Text>
              <Text style={styles.heroYear}>
                {new Date(trip.start_ts).getFullYear()}
              </Text>
            </View>
            <Pressable
              style={styles.heroLocationBtn}
              onPress={() => setSpotModalVisible(true)}
            >
              <Ionicons name="location" size={14} color="#F59E0B" />
              <Text style={styles.heroLocationText}>
                {(trip as any).spot_name || t("addLocation")}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#606068" />
            </Pressable>
          </View>

          {/* Hero Stat - Varighed */}
          <View style={styles.heroDurationWrap}>
            <Text style={styles.heroDuration}>{fmtTime(trip.duration_sec)}</Text>
            <Text style={styles.heroDurationLabel}>{t("duration")}</Text>
          </View>

          {/* Stats Row */}
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <View style={[styles.heroStatIcon, { backgroundColor: "#F59E0B20" }]}>
                <Ionicons name="fish" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.heroStatValue}>{fishCountDisplay}</Text>
              <Text style={styles.heroStatLabel}>{t("fishCaughtLabel")}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <View style={[styles.heroStatIcon, { backgroundColor: "#3B82F620" }]}>
                <Ionicons name="navigate" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.heroStatValue}>{(trip.distance_m / 1000).toFixed(1)}</Text>
              <Text style={styles.heroStatLabel}>km</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <View style={[styles.heroStatIcon, { backgroundColor: "#F59E0B20" }]}>
                <Ionicons name="time" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.heroStatValue}>{fmtClock(trip.start_ts)}</Text>
              <Text style={styles.heroStatLabel}>{t("start")}</Text>
            </View>
          </View>
        </View>

        {/* === KORT MED RUTE === */}
        <View style={styles.mapCard}>
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
                    strokeWidth={3}
                    strokeColor="#F59E0B"
                  />
                )}
                {pathPoints.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude: pathPoints[0].latitude,
                      longitude: pathPoints[0].longitude,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.mapMarkerStart}>
                      <Ionicons name="play" size={10} color="#0D0D0F" />
                    </View>
                  </Marker>
                )}
                {pathPoints.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude: pathPoints[pathPoints.length - 1].latitude,
                      longitude: pathPoints[pathPoints.length - 1].longitude,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.mapMarkerEnd}>
                      <View style={styles.mapMarkerEndInner} />
                    </View>
                  </Marker>
                )}
              </MapView>
            ) : (
              <View style={styles.noMap}>
                <Ionicons name="map-outline" size={32} color="#606068" />
                <Text style={styles.noMapText}>{t("noGpsData")}</Text>
              </View>
            )}
          </View>

          {/* Replay knap overlay */}
          {hasReplayData && (
            <Pressable
              style={styles.replayOverlayBtn}
              onPress={() => router.push(`/trip-replay/${id}`)}
            >
              <Ionicons name="play-circle" size={20} color="#FFFFFF" />
              <Text style={styles.replayOverlayText}>{language === "da" ? "Afspil tur" : "Replay trip"}</Text>
            </Pressable>
          )}
        </View>

        {/* === FANGST TIMELINE === */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="fish" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.sectionTitle}>{t("catchesOnTimeline")}</Text>
            </View>
            <Pressable style={styles.editBtnSmall} onPress={() => setEditModalVisible(true)}>
              <Ionicons name="create-outline" size={16} color="#A0A0A8" />
            </Pressable>
          </View>

          <FishTimeline
            startIso={trip.start_ts}
            endIso={trip.end_ts}
            fishEventsMs={fishEventsMs}
            onReplay={hasReplayData ? () => router.push(`/trip-replay/${id}`) : undefined}
            t={t}
          />
        </View>

        {/* === VEJRDATA === */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIcon, { backgroundColor: "#3B82F620" }]}>
                <Ionicons name="cloud" size={16} color="#3B82F6" />
              </View>
              <Text style={styles.sectionTitle}>{t("weatherDuringFishing")}</Text>
            </View>
            {evaluation && (
              <Pressable
                style={styles.syncBtnSmall}
                onPress={handleSyncWeather}
                disabled={syncingWeather}
              >
                {syncingWeather ? (
                  <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                  <Ionicons name="sync" size={16} color="#F59E0B" />
                )}
              </Pressable>
            )}
          </View>

          {!evaluation ? (
            <View style={styles.noWeatherContainer}>
              <View style={styles.noWeatherIcon}>
                <Ionicons name="cloud-offline-outline" size={32} color="#606068" />
              </View>
              <Text style={styles.noWeatherText}>{t("noWeatherForPeriod")}</Text>
              <Pressable
                style={styles.syncWeatherBtn}
                onPress={handleSyncWeather}
                disabled={syncingWeather}
              >
                {syncingWeather ? (
                  <ActivityIndicator size="small" color="#0D0D0F" />
                ) : (
                  <>
                    <Ionicons name="sync" size={18} color="#0D0D0F" />
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
                  <ActivityIndicator size="small" color="#0D0D0F" />
                ) : (
                  <>
                    <Ionicons name="sync" size={18} color="#0D0D0F" />
                    <Text style={styles.syncWeatherBtnText}>{t("syncWeather")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {evaluation.note && (
                <Text style={styles.noteText}>{evaluation.note}</Text>
              )}

              {/* Weather Stats Grid */}
              <View style={styles.weatherGrid}>
                {evaluation.airTempC && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.airTempC.avg.toFixed(1)}°</Text>
                    <Text style={styles.weatherStatLabel}>{t("airTemp")}</Text>
                  </View>
                )}
                {evaluation.windMS && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.windMS.avg.toFixed(1)} m/s</Text>
                    <Text style={styles.weatherStatLabel}>{t("windSpeed")}</Text>
                  </View>
                )}
                {evaluation.waterTempC && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.waterTempC.avg.toFixed(1)}°</Text>
                    <Text style={styles.weatherStatLabel}>{t("waterTemp")}</Text>
                  </View>
                )}
                {evaluation.waterLevelCM && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.waterLevelCM.avg.toFixed(0)} cm</Text>
                    <Text style={styles.weatherStatLabel}>{t("waterLevel")}</Text>
                  </View>
                )}
                {evaluation.pressureHPa && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.pressureHPa.avg.toFixed(0)} hPa</Text>
                    <Text style={styles.weatherStatLabel}>{t("pressure")}</Text>
                  </View>
                )}
                {evaluation.humidityPct && (
                  <View style={styles.weatherStatCard}>
                    <Text style={styles.weatherStatValue}>{evaluation.humidityPct.avg.toFixed(0)}%</Text>
                    <Text style={styles.weatherStatLabel}>{t("humidity")}</Text>
                  </View>
                )}
              </View>

              {/* Grafer */}
              <>
                {evaluation.airTempSeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.airTempSeries}
                    label={t("airTemp")}
                    unit="°C"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}

                {evaluation.windSpeedSeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.windSpeedSeries}
                    label={t("windSpeed")}
                    unit="m/s"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}

                {evaluation.waterTempSeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.waterTempSeries}
                    label={t("waterTemp")}
                    unit="°C"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}

                {evaluation.waterLevelSeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.waterLevelSeries}
                    label={t("waterLevel")}
                    unit="cm"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}

                {evaluation.pressureSeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.pressureSeries}
                    label={t("pressure")}
                    unit="hPa"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}

                {evaluation.humiditySeries?.length > 0 && (
                  <StatGraph
                    series={evaluation.humiditySeries}
                    label={t("humidity")}
                    unit="%"
                    tripStartMs={tripStartMs}
                    tripEndMs={tripEndMs}
                  />
                )}
              </>

              {/* Data source */}
              <View style={styles.sourceSection}>
                <View style={styles.sourceChip}>
                  <Ionicons name="analytics" size={12} color="#606068" />
                  <Text style={styles.sourceChipText}>DMI Open Data</Text>
                </View>
                <View style={styles.sourceStatusRow}>
                  <View style={styles.sourceStatusItem}>
                    <View style={[styles.sourceStatusDot, hasClimate && styles.sourceStatusDotActive]} />
                    <Text style={styles.sourceStatusLabel}>Klima</Text>
                  </View>
                  <View style={styles.sourceStatusItem}>
                    <View style={[styles.sourceStatusDot, hasOcean && styles.sourceStatusDotActive]} />
                    <Text style={styles.sourceStatusLabel}>Hav</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* === SLET TUR === */}
        {showDeleteButton && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={styles.deleteBtnText}>{t("deleteTrip")}</Text>
          </Pressable>
        )}

        {!showDeleteButton && (
          <View style={styles.cannotDeleteRow}>
            <Ionicons name="information-circle-outline" size={18} color={THEME.textTertiary} />
            <Text style={styles.cannotDeleteText}>
              {t("tripCannotBeDeleted")} — {t("durationOver30Min")}
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
                  <Ionicons name="fish" size={24} color={theme.primary} />
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
      <Text style={[styles.infoVal, highlight && { color: "#F59E0B" }]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

// Lille visnings-tidslinje på kortform
function FishTimeline({
  startIso,
  endIso,
  fishEventsMs,
  onReplay,
  t,
}: {
  startIso: string;
  endIso: string;
  fishEventsMs: number[];
  onReplay?: () => void;
  t: (key: any) => string;
}) {
  const { language } = useLanguage();
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
            const left = `${rel * 100}%` as const;
            return (
              <View key={idx} style={[styles.timelineEventWrapper, { left: left as any }]}>
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

      {onReplay && (
        <View style={styles.timelineEditRow}>
          <Pressable style={styles.timelineReplayBtn} onPress={onReplay}>
            <Ionicons name="play" size={14} color="#000" />
            <Text style={styles.timelineReplayText}>
              {language === "da" ? "Afspil tur" : "Replay trip"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function WindCompass({ directionDeg }: { directionDeg?: number }) {
  const { theme } = useTheme();
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
        color={theme.primary}
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

function StatGraph({
  series,
  label,
  unit,
  tripStartMs,
  tripEndMs,
}: {
  series: Serie[];
  label: string;
  unit: string;
  tripStartMs?: number;
  tripEndMs?: number;
}) {
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

  const HEIGHT = 100;
  const PADDING_X = 16;
  const PADDING_Y = 16;
  const GRAPH_H = HEIGHT - PADDING_Y * 2;

  const graphWidth = Math.max(layoutWidth - PADDING_X * 2, 0);

  // Beregn punkter
  const points = sampled.map((d, i) => {
    const x = PADDING_X + (i / (sampled.length - 1)) * graphWidth;
    const y = PADDING_Y + GRAPH_H - ((d.v - min) / span) * GRAPH_H;
    return { x, y, data: d };
  });

  // Beregn x-positioner for turens start/slut markører
  const seriesStartMs = sampled[0].ts;
  const seriesEndMs = sampled[sampled.length - 1].ts;
  const seriesSpan = seriesEndMs - seriesStartMs;

  let tripStartX: number | null = null;
  let tripEndX: number | null = null;

  if (tripStartMs && tripEndMs && seriesSpan > 0) {
    // Beregn relativ position på grafen
    const startRatio = (tripStartMs - seriesStartMs) / seriesSpan;
    const endRatio = (tripEndMs - seriesStartMs) / seriesSpan;

    // Clamp ratios til grafens område (0-1), så pile vises i kanten hvis turen er udenfor
    const clampedStartRatio = Math.max(0, Math.min(1, startRatio));
    const clampedEndRatio = Math.max(0, Math.min(1, endRatio));

    // Vis pile - clamp til grafens kanter
    tripStartX = PADDING_X + clampedStartRatio * graphWidth;
    tripEndX = PADDING_X + clampedEndRatio * graphWidth;
  }

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
                <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.20" />
                <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            <Path d={areaPath} fill={`url(#grad-${label})`} />
            <Path
              d={linePath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Touch cursor line */}
            {activePoint && (
              <>
                <Path
                  d={`M ${activePoint.x},0 L ${activePoint.x},${HEIGHT}`}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  opacity={0.6}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="10"
                  fill="#F59E0B"
                  opacity={0.2}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="5"
                  fill="#F59E0B"
                />
              </>
            )}

            {/* Endpoint dot (kun når ikke touching) */}
            {!activePoint && (
              <>
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="8"
                  fill="#F59E0B"
                  opacity={0.2}
                />
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="4"
                  fill="#F59E0B"
                />
              </>
            )}

            {/* Tur-markører: pile der peger mod hinanden */}
            {tripStartX !== null && (
              <>
                {/* Start-pil (peger højre) */}
                <Path
                  d={`M ${tripStartX - 6},${HEIGHT - 8} L ${tripStartX + 2},${HEIGHT - 4} L ${tripStartX - 6},${HEIGHT}`}
                  fill="#4ADE80"
                />
                <Path
                  d={`M ${tripStartX},0 L ${tripStartX},${HEIGHT}`}
                  stroke="#4ADE80"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity={0.6}
                />
              </>
            )}
            {tripEndX !== null && (
              <>
                {/* Slut-pil (peger venstre) */}
                <Path
                  d={`M ${tripEndX + 6},${HEIGHT - 8} L ${tripEndX - 2},${HEIGHT - 4} L ${tripEndX + 6},${HEIGHT}`}
                  fill="#F87171"
                />
                <Path
                  d={`M ${tripEndX},0 L ${tripEndX},${HEIGHT}`}
                  stroke="#F87171"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity={0.6}
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
    backgroundColor: "#0D0D0F",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },

  // === HERO SECTION ===
  heroSection: {
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  heroHeaderLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  heroDate: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  heroYear: {
    fontSize: 13,
    fontWeight: "500",
    color: "#606068",
  },
  heroLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  heroLocationText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A0A0A8",
    maxWidth: 120,
  },
  heroDurationWrap: {
    alignItems: "center",
    marginBottom: 28,
  },
  heroDuration: {
    fontSize: 64,
    fontWeight: "100",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
  },
  heroDurationLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  heroStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#1E1E21",
    borderRadius: 16,
    paddingVertical: 16,
  },
  heroStatItem: {
    alignItems: "center",
    flex: 1,
  },
  heroStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#606068",
    marginTop: 2,
    textTransform: "uppercase",
  },
  heroStatDivider: {
    width: 1,
    height: 48,
    backgroundColor: "#2A2A2E",
  },

  // === MAP CARD ===
  mapCard: {
    backgroundColor: "#161618",
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 12,
  },

  // === SECTION HEADER ===
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  editBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1E1E21",
    alignItems: "center",
    justifyContent: "center",
  },
  syncBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
  },

  // === WEATHER GRID ===
  weatherGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  weatherStatCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1E1E21",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  weatherStatValue: {
    fontSize: 28,
    fontWeight: "200",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  weatherStatLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#606068",
    textTransform: "uppercase",
  },

  // === NO WEATHER ===
  noWeatherIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#1E1E21",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  noWeatherText: {
    fontSize: 15,
    color: "#606068",
    marginBottom: 16,
    textAlign: "center",
  },

  // === SOURCE SECTION ===
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  sourceChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#606068",
  },
  sourceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#606068",
  },
  sourceStatusDotActive: {
    backgroundColor: "#F59E0B",
  },

  // === MAP MARKERS ===
  mapMarkerStart: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  mapMarkerEnd: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
  },
  mapMarkerEndInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  // === REPLAY OVERLAY ===
  replayOverlayBtn: {
    position: "absolute",
    bottom: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  replayOverlayText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D0D0F",
  },

  // === DELETE BUTTON ===
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF3B3015",
    height: 56,
    borderRadius: 16,
    marginTop: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF3B30",
  },
  cannotDeleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#161618",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 8,
  },
  cannotDeleteText: {
    fontSize: 13,
    color: "#606068",
    fontWeight: "500",
  },

  // === LEGACY CARD (kept for compatibility) ===
  card: {
    backgroundColor: "#161618",
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 20,
  },
  cardDate: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    textTransform: "capitalize",
    marginBottom: 8,
  },
  spotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  spotBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F59E0B",
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    color: "#606068",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: "#1E1E21",
    borderRadius: 16,
  },
  infoItem: {
    alignItems: "center",
    flex: 1,
  },
  infoLabel: {
    color: "#606068",
    fontSize: 11,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: "500",
  },
  infoVal: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
  },

  infoRow: {
    backgroundColor: "#161618",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 20,
  },

  sectionLabel: {
    fontSize: 12,
    color: "#606068",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: {
    color: "#A0A0A8",
    fontSize: 15,
  },
  noWeatherContainer: {
    alignItems: "center",
    gap: 20,
  },
  syncWeatherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F59E0B",
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 16,
    minWidth: 180,
  },
  syncWeatherBtnText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  periodSection: {
    marginTop: 20,
    gap: 10,
  },
  periodItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodText: {
    color: "#A0A0A8",
    fontSize: 14,
  },
  sourceSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2E",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sourceLabel: {
    fontSize: 12,
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sourceTime: {
    fontSize: 11,
    color: "#606068",
  },
  sourceHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  syncWeatherBtnSmall: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F59E0B20",
  },
  sourceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sourceStatusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceStatusLabel: {
    fontSize: 12,
    color: "#606068",
    fontWeight: "500",
  },
  noteText: {
    color: "#FF3B30",
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 4,
  },

  // RUTEKORT
  mapContainer: {
    height: 220,
    backgroundColor: "#1E1E21",
  },
  map: { flex: 1 },
  noMap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E1E21",
    gap: 12,
  },
  noMapText: { color: "#606068", fontSize: 14 },

  // SLET TUR KNAP
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  btn: {
    flex: 0.5,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  danger: { backgroundColor: "#FF3B30" },
  dangerText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },

  // Lille timeline (visning)
  timelineWrapperSmall: {
    marginTop: 12,
    marginBottom: 4,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  timelineTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  timelineBox: {
    height: 100,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 12,
    justifyContent: "center",
    overflow: "hidden",
  },
  timelineGridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2E",
  },
  timelineAxis: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: "#2A2A2E",
    borderRadius: 1,
  },
  timelineAxisInner: {
    flexDirection: "row",
    position: "absolute",
    left: 12,
    right: 12,
    height: "100%",
  },
  timelineEventWrapper: {
    position: "absolute",
    bottom: 20,
    width: 0,
    alignItems: "center",
  },
  timelineEvent: {
    width: 4,
    height: 40,
    backgroundColor: "#F59E0B",
    borderRadius: 2,
  },
  timelineTimeRowSmall: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  timelineTimeLabel: {
    fontSize: 11,
    color: "#606068",
    fontWeight: "500",
  },
  timelineTimeValue: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  timelineEditRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  timelineEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  timelineEditText: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
  },
  timelineReplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  timelineReplayText: {
    color: "#0D0D0F",
    fontSize: 13,
    fontWeight: "600",
  },

  // EDITOR / MODAL - NERO style
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  } as any,
  timelineLabel: {
    color: "#606068",
    fontSize: 11,
    fontWeight: "500",
  },
  timelineTime: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  timelineTimeBig: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  timelineWrapper: {
    marginTop: 4,
    marginBottom: 8,
    alignItems: "center",
  },
  timelineBar: {
    height: 120,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
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
    backgroundColor: "#2A2A2E",
  },
  timelineGridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#2A2A2E",
  },
  timelineCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#F59E0B",
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
    backgroundColor: "#F59E0B",
  },
  timelineMarkerDotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  timelineMarkerLabelWrap: {
    marginBottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F59E0B20",
  },
  timelineMarkerLabelWrapActive: {
    backgroundColor: "#F59E0B",
  },
  timelineMarkerLabel: {
    color: "#FFFFFF",
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F59E0B20",
  },
  addCatchBtnText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteCatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FF3B3015",
  },
  deleteCatchBtnText: {
    color: "#FF3B30",
    fontSize: 12,
    fontWeight: "600",
  },

  // Sparkline grafer - NERO style
  sparklineContainer: {
    marginTop: 20,
    marginBottom: 12,
  },
  sparklineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  sparklineLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  sparklineValueRow: {
    alignItems: "flex-end",
  },
  sparklineValue: {
    fontSize: 24,
    fontWeight: "200",
    color: "#F59E0B",
    fontVariant: ["tabular-nums"],
  },
  sparklineRange: {
    fontSize: 12,
    color: "#606068",
    marginTop: 4,
  },
  sparklineGraph: {
    height: 100,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
    overflow: "hidden",
  },
  sparklineTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingHorizontal: 4,
  },
  sparklineTime: {
    fontSize: 12,
    color: "#606068",
    fontVariant: ["tabular-nums"],
  },

  // Grafer (legacy) - NERO style
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2E",
  },
  minMaxText: {
    fontSize: 12,
    color: "#606068",
    marginTop: 2,
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
    fontWeight: "600",
    color: "#FFFFFF",
  },
  graphContainer: {
    position: "relative",
    height: 90,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2E",
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
    color: "#606068",
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
    color: "#606068",
  },

  // Vind + kompas - NERO style
  windRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  windDirText: {
    fontSize: 12,
    color: "#606068",
    marginTop: 2,
  },
  compass: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    backgroundColor: "#1E1E21",
  },
  compassN: {
    position: "absolute",
    top: 4,
    fontSize: 9,
    fontWeight: "600",
    color: "#606068",
  },

  // Modal - NERO style
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13, 13, 15, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 24,
  },
  modalBoxTall: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
    color: "#FFFFFF",
  },
  modalText: {
    color: "#A0A0A8",
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  ghost: { backgroundColor: "#1E1E21" },
  ghostText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: "#F59E0B",
  },
  primaryText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },

  // EDIT FANGST MODAL - NERO style
  editModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 20,
  },
  editModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  editModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  editModalCountBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  editModalCountText: {
    color: "#0D0D0F",
    fontSize: 16,
    fontWeight: "600",
  },
  editTimeSelector: {
    alignItems: "center",
    marginBottom: 20,
  },
  editTimeCurrent: {
    alignItems: "center",
    backgroundColor: "#1E1E21",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  editTimeCurrentLabel: {
    fontSize: 12,
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editTimeCurrentValue: {
    fontSize: 32,
    fontWeight: "200",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  editTimelineContainer: {
    marginBottom: 20,
  },
  editTimelineBar: {
    height: 140,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
    overflow: "visible",
    position: "relative",
  },
  editTimelineGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: "#F59E0B08",
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
    backgroundColor: "#F59E0B",
    borderRadius: 1,
  },
  editCursorDot: {
    position: "absolute",
    bottom: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    borderWidth: 3,
    borderColor: "#161618",
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
    backgroundColor: "#F59E0B20",
    marginBottom: 4,
  },
  editMarkerPillActive: {
    backgroundColor: "#F59E0B",
  },
  editMarkerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F59E0B",
  },
  editMarkerTextActive: {
    color: "#0D0D0F",
  },
  editMarkerStem: {
    width: 2,
    height: 60,
    backgroundColor: "#F59E0B",
    opacity: 0.4,
  },
  editMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F59E0B",
    marginTop: -1,
  },
  editMarkerDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  editTimeAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 10,
  },
  editTimeAxisText: {
    fontSize: 12,
    color: "#606068",
    fontVariant: ["tabular-nums"],
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  editAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    height: 56,
    borderRadius: 16,
  },
  editAddBtnText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  editDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FF3B3015",
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  editDeleteBtnDisabled: {
    backgroundColor: "#1E1E21",
  },
  editDeleteBtnText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "600",
  },
  editDeleteBtnTextDisabled: {
    color: "#606068",
  },
  editHint: {
    textAlign: "center",
    fontSize: 13,
    color: "#606068",
    marginBottom: 20,
  },
  editFooter: {
    flexDirection: "row",
    gap: 12,
  },
  editCancelBtn: {
    flex: 0.4,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  editCancelBtnText: {
    color: "#A0A0A8",
    fontSize: 15,
    fontWeight: "600",
  },
  editSaveBtn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
  },
  editSaveBtnText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },

  // SPOT-EDITERING - NERO style
  spotEditRow: {
    marginTop: 8,
    marginBottom: 4,
    alignItems: "flex-start",
  },
  spotEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1E1E21",
  },
  spotEditText: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
  },
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  spotSearchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
  },
  spotItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotItemActive: {
    backgroundColor: "#F59E0B",
  },
  spotItemText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  spotItemTextActive: {
    color: "#0D0D0F",
    fontSize: 15,
    fontWeight: "600",
  },
});
