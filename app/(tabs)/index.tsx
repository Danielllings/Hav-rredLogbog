import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  StyleSheet,
  Modal,
  ScrollView,
  FlatList,
  StatusBar,
  Dimensions,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  AppState,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, {
  Marker,
  Polyline,
  Region,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  UrlTile,
} from "react-native-maps";
import { Link, useRouter } from "expo-router";
import { saveTrip, listTrips } from "../../lib/trips";
import { listSpots, type SpotRow } from "../../lib/spots";
import { evaluateTripWithDmi, getSpotForecastEdr } from "../../lib/dmi";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getUserId } from "../../lib/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  queueOfflineTrip,
  syncOfflineTrips,
  type SaveTripPayload,
} from "../../lib/offlineTrips";
import { isRunningInExpoGo } from "expo";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { THEME } from "../../constants/theme";
import { MAP_STYLE, MAP_UI_STYLE } from "../../shared/utils/mapStyles";
import {
  haversine,
  computeDistance,
  MIN_WAYPOINT_DISTANCE,
  MAX_WAYPOINT_DISTANCE,
  MAX_WAYPOINT_SPEED_MS,
  MIN_GPS_ACCURACY,
  type Pt,
} from "../../shared/utils/geo";
import { fmtTime, getTripTitleParts, type TranslateFn } from "../../shared/utils/formatters";
import {
  analyzeTripEndTime,
  formatTrimTime,
  formatDuration,
  type TrimSuggestion,
} from "../../lib/tripTrim";
import { StatBox } from "../../shared/components/StatBox";
import { TripCard } from "../../shared/components/TripCard";
import { BentoTrackingDashboard } from "../../shared/components/BentoTrackingDashboard";
import type { FishEventCondition } from "../../lib/tripUtils";

const { width } = Dimensions.get("window");

// === NOTIFICATIONS WRAPPER (ingen expo-notifications i Expo Go på Android) ===

const DEFAULT_TRACK_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const isAndroidExpoGo = Platform.OS === "android" && isRunningInExpoGo();
let notificationsConfigured = false;

// Fallback-tiles til Android hvis Google Maps-nøgle mangler
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

async function ensureNotificationsConfigured() {
  // Expo Go på Android understøtter ikke expo-notifications → vi laver bare no-op
  if (isAndroidExpoGo) {
    return null;
  }

  // Dynamic import, så bundleren ikke crasher i miljøer uden notifications
  const Notifications = await import("expo-notifications");

  if (!notificationsConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldSetBadge: false,
        shouldPlaySound: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationsConfigured = true;
  }

  return Notifications;
}

const TRACK_TASK_NAME = "background_track_updates";
const TRACK_BUFFER_KEY = "track_buffer_v1";
const TRACK_META_KEY = "track_meta_v1";
const TRACK_ACTIVE_KEY = "track_active_v1";

let trackTaskDefined = false;

if (!trackTaskDefined) {
  try {
    // Kører i baggrunden (og forgrunden) for at fange GPS-punkter, også når appen er i dvale.
    TaskManager.defineTask(TRACK_TASK_NAME, async ({ data, error }) => {
      if (error) {
        // console.log("BG tracking fejl:", error.message);
        return;
      }
      // @ts-ignore - task-data typing fra expo-task-manager er løs
      const activeRaw = await AsyncStorage.getItem(TRACK_ACTIVE_KEY);
      if (activeRaw !== "1") return;
      const metaRaw = await AsyncStorage.getItem(TRACK_META_KEY);
      if (!metaRaw) return;
      const { locations } = (data || {}) as { locations?: any[] };
      if (!locations || !locations.length) return;

      // Filtrer punkter med dårlig GPS-nøjagtighed
      const newPts: Pt[] = locations
        .filter((loc: any) => {
          const accuracy = loc.coords?.accuracy;
          return accuracy == null || accuracy <= MIN_GPS_ACCURACY;
        })
        .map((loc: any) => ({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          t:
            typeof loc.timestamp === "number" && Number.isFinite(loc.timestamp)
              ? loc.timestamp
              : Date.now(),
        }));

      if (!newPts.length) return;

      try {
        const raw = (await AsyncStorage.getItem(TRACK_BUFFER_KEY)) ?? "[]";
        let existing: Pt[] = [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            existing = parsed as Pt[];
          }
        } catch {
          existing = [];
        }
        const merged: Pt[] = [...existing];
        let last = merged.length ? merged[merged.length - 1] : null;

        for (const p of newPts) {
          if (!last) {
            merged.push(p);
            last = p;
            continue;
          }
          const step = haversine(last, p);
          if (step < MIN_WAYPOINT_DISTANCE) continue;
          const dtMs =
            typeof last.t === "number" && typeof p.t === "number"
              ? Math.max(1, p.t - last.t)
              : null;
          const speed = dtMs ? step / (dtMs / 1000) : null;
          if (step > MAX_WAYPOINT_DISTANCE) continue;
          if (speed != null && speed > MAX_WAYPOINT_SPEED_MS) continue;
          merged.push(p);
          last = p;
        }
        // Trim for at undgå uendelig vækst (beholder de seneste ~2000 punkter)
        const trimmed = merged.slice(-2000);
        await AsyncStorage.setItem(TRACK_BUFFER_KEY, JSON.stringify(trimmed));

      } catch (e) {
        // console.log("BG track buffer parse/save fejl:", e);
      }
    });
    trackTaskDefined = true;
  } catch (e) {
    // console.log("Task allerede defineret eller fejlede:", e);
  }
}

function TripTitle({ trip, t }: { trip: any; t?: TranslateFn }) {
  const { dateStr, spotName } = getTripTitleParts(trip, t);
  return (
    <View style={styles.tripTitleRow}>
      {spotName ? (
        <View style={styles.tripLocationRow}>
          <Ionicons name="navigate-outline" size={14} color="#FFF" />
          <Text style={styles.tripSpot} numberOfLines={1} ellipsizeMode="tail">
            {spotName}
          </Text>
        </View>
      ) : null}
      <View style={styles.tripDateRow}>
        <Ionicons name="calendar-outline" size={14} color={THEME.textSec} />
        <Text style={styles.tripDate} numberOfLines={1}>
          {dateStr}
        </Text>
      </View>
    </View>
  );
}

// Filter options - will use translation function
const getFilterOptions = (t: (key: any) => string) => [
  { label: t("days14"), days: 14 },
  { label: t("days30"), days: 30 },
  { label: t("days60"), days: 60 },
  { label: t("all"), days: 0 },
];

// === ANIMATED COMPONENTS ===

// Animeret Status Indikator med pulserende glow
function AnimatedStatusIndicator({ active }: { active: boolean }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade-in animation ved mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulserende glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const dotScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const glowColor = active ? THEME.startGreen : THEME.danger;
  const bgColor = active ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 69, 58, 0.15)";

  return (
    <Animated.View
      style={[
        styles.statusIndicator,
        {
          backgroundColor: bgColor,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Glow layer */}
      <Animated.View
        style={[
          styles.statusGlow,
          {
            backgroundColor: glowColor,
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.statusDot,
          active && styles.statusDotActive,
          { transform: [{ scale: dotScale }] },
        ]}
      />
    </Animated.View>
  );
}

// Animeret Stats Overlay Box med fade-in og gold accent
function AnimatedOverlayStatBox({
  icon,
  label,
  value,
  index,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  index: number;
  color: string;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entry animation
    Animated.sequence([
      Animated.delay(index * 100),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Subtil glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const iconOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <Animated.View
      style={[
        styles.overlayStatBox,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Animated.View style={{ opacity: iconOpacity }}>
        <Ionicons name={icon as any} size={14} color={THEME.graphYellow} />
      </Animated.View>
      <View>
        <Text style={styles.overlayLabel}>{label}</Text>
        <Text style={styles.overlayValue}>{value}</Text>
      </View>
    </Animated.View>
  );
}

// Animated Trip Card wrapper med staggered entry
function AnimatedTripCardWrapper({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 50),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function pickNearest<T extends { ts: number }>(
  series: T[] | undefined,
  now = Date.now(),
  maxAgeMs = 60 * 60 * 1000
): T | null {
  if (!series || !series.length) return null;
  let best = series[0];
  let bestDiff = Math.abs(series[0].ts - now);
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(series[i].ts - now);
    if (d < bestDiff) {
      bestDiff = d;
      best = series[i];
    }
  }
  if (bestDiff > maxAgeMs) return best;
  return best;
}

// ============================================================================
// Tracking og ture UI
// ============================================================================

export default function Track() {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [licenseExpired, setLicenseExpired] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [sec, setSec] = useState(0);
  const [region, setRegion] = useState<Region>(DEFAULT_TRACK_REGION);
  const [liveWeather, setLiveWeather] = useState<{
    tempC: number | null;
    windMS: number | null;
    windDirDeg: number | null;
    waterLevelCM: number | null;
    waveHeightM: number | null;
    trend: "up" | "down" | "flat" | null;
    pressureHPa?: number;
    pressureTrend?: "rising" | "falling" | "stable";
  } | null>(null);
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveFetchedAt, setLiveFetchedAt] = useState<number | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const waterArrowAnim = useRef(new Animated.Value(0)).current;

  const hasGoogleMapsKey =
    Platform.OS !== "android"
      ? true
      : Boolean(Constants.expoConfig?.extra?.mapsApiKey);
  const trackingUsesOsmTiles =
    Platform.OS === "android" && !hasGoogleMapsKey;
  const trackingMapProvider =
    Platform.OS === "android"
      ? hasGoogleMapsKey
        ? PROVIDER_GOOGLE
        : PROVIDER_DEFAULT
      : undefined;
  const trackingMapType = trackingUsesOsmTiles ? "none" : "standard";

  // Fangst-tidsstempler med valgfri længde og condition
  const [catchMarks, setCatchMarks] = useState<{ ts: number; length_cm?: number; condition?: FishEventCondition }[]>([]);
  // Cursor til realtime visning
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  // Hvilken markør er valgt til slet
  const [selectedCatchIndex, setSelectedCatchIndex] = useState<number | null>(
    null
  );

  const [fishModal, setFishModal] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [trimSuggestion, setTrimSuggestion] = useState<TrimSuggestion | null>(null);
  const [trimModalVisible, setTrimModalVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);

  const [recent, setRecent] = useState<any[]>([]);
  const [daysFilter, setDaysFilter] = useState<number>(14);

  const [permissionModalVisible, setPermissionModalVisible] =
    useState(false);

  const [catchToastVisible, setCatchToastVisible] = useState(false);
  const [spotsModalVisible, setSpotsModalVisible] = useState(false);
  const [noSpotsModalVisible, setNoSpotsModalVisible] = useState(false);
  const [noNearbySpots, setNoNearbySpots] = useState(false); // true = spots findes, men ingen inden for 2km
  const [pendingStartLocation, setPendingStartLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [spotsWithVisits, setSpotsWithVisits] = useState<
    Array<SpotRow & { visitCount: number; fishCount: number }>
  >([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const lastLiveFetchRef = useRef<number | null>(null);

  // Fangst-længde modal
  const [catchLengthModalVisible, setCatchLengthModalVisible] = useState(false);
  const [catchLengthInput, setCatchLengthInput] = useState("");
  const pendingCatchTsRef = useRef<number | null>(null);

  // Selvmålte vandtemperaturer (timestamps ligesom fangster)
  const [waterTempModalVisible, setWaterTempModalVisible] = useState(false);
  const [manualWaterTemps, setManualWaterTemps] = useState<{ ts: number; temp: number }[]>([]);
  const [waterTempInput, setWaterTempInput] = useState("");
  const [waterTempToastVisible, setWaterTempToastVisible] = useState(false);
  const waterTempToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fail-safe: stop tracking hvis brugeren kører væk
  const [drivingAwayModalVisible, setDrivingAwayModalVisible] = useState(false);
  const highSpeedCountRef = useRef(0);
  const highSpeedDetectedAtRef = useRef<number | null>(null);
  const CAR_SPEED_THRESHOLD = 12; // m/s (~43 km/h) - hastighed der indikerer kørsel
  const HIGH_SPEED_TRIGGER_COUNT = 4; // Antal consecutive high-speed readings før advarsel

  useEffect(() => {
    if (!liveWeather || liveWeather.trend === null) return;
    if (liveWeather.trend === "flat") {
      waterArrowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waterArrowAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(waterArrowAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveWeather?.trend, waterArrowAnim]);

  const fetchLiveWeather = useCallback(
    async (lat: number, lon: number) => {
      if (liveFetching) return;
      setLiveFetching(true);
      setLiveError(null);
      try {
        const edr = await getSpotForecastEdr(lat, lon);
        if (!edr) throw new Error("Ingen EDR-data");
        const now = Date.now();
        const wind = pickNearest(edr.windSpeedSeries, now);
        const windDir = pickNearest(edr.windDirSeries, now);
        const temp = pickNearest(edr.airTempSeries, now);
        const wlPoint = pickNearest(edr.waterLevelSeries, now);
        const wavePoint = pickNearest(edr.waveHeightSeries, now);
        const pressure = pickNearest(edr.pressureSeries, now);

        let trend: "up" | "down" | "flat" | null = null;
        if (edr.waterLevelSeries && edr.waterLevelSeries.length >= 2) {
          const first = edr.waterLevelSeries[0].v;
          const last = edr.waterLevelSeries[edr.waterLevelSeries.length - 1].v;
          const diff = last - first;
          if (diff > 0.5) trend = "up";
          else if (diff < -0.5) trend = "down";
          else trend = "flat";
        }

        // Pressure trend: compare current pressure to ~1 hour ago
        let pressureTrend: "rising" | "falling" | "stable" | undefined;
        if (pressure && edr.pressureSeries && edr.pressureSeries.length >= 2) {
          const oneHourAgo = now - 60 * 60 * 1000;
          const prev = pickNearest(edr.pressureSeries, oneHourAgo);
          if (prev && prev.ts !== pressure.ts) {
            const pDiff = pressure.v - prev.v;
            if (pDiff > 0.5) pressureTrend = "rising";
            else if (pDiff < -0.5) pressureTrend = "falling";
            else pressureTrend = "stable";
          }
        }

        setLiveWeather({
          tempC: temp?.v ?? null,
          windMS: wind?.v ?? null,
          windDirDeg: windDir?.v ?? null,
          waterLevelCM: wlPoint?.v ?? null,
          waveHeightM: wavePoint?.v ?? null,
          trend,
          pressureHPa: pressure?.v ?? undefined,
          pressureTrend,
        });
        setLiveFetchedAt(now);
      } catch (e) {
        // console.log("Kunne ikke hente live-vejr", e);
        setLiveError("Kan ikke hente vejr lige nu");
      } finally {
        setLiveFetching(false);
      }
    },
    [liveFetching]
  );

  const fetchLiveFromDevice = useCallback(async () => {
    const now = Date.now();
    if (lastLiveFetchRef.current && now - lastLiveFetchRef.current < 5 * 60 * 1000) {
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLiveError("Lokation ikke givet");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      lastLiveFetchRef.current = now;
      fetchLiveWeather(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      // console.log("Live vejr lokationsfejl", e);
      setLiveError("Kan ikke hente vejr lige nu");
    }
  }, [fetchLiveWeather]);

  useEffect(() => {
    fetchLiveFromDevice();
    const id = setInterval(fetchLiveFromDevice, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchLiveFromDevice]);

  const filterOptions = useMemo(() => getFilterOptions(t), [t]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return language === "da" ? "God morgen" : "Good morning";
    if (hour >= 12 && hour < 18) return language === "da" ? "God eftermiddag" : "Good afternoon";
    if (hour >= 18 && hour < 22) return language === "da" ? "God aften" : "Good evening";
    return language === "da" ? "God nat" : "Good night";
  }, [language]);

  const formattedDate = useMemo(() => {
    const d = new Date();
    const days = language === "da"
      ? ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"]
      : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = language === "da"
      ? ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"]
      : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[d.getDay()]}, ${d.getDate()}. ${months[d.getMonth()]}`;
  }, [language]);

  const totalFish = useMemo(
    () => recent.reduce((sum, trip) => sum + (trip.fish_count || 0), 0),
    [recent]
  );

  const totalHours = useMemo(() => {
    const totalSec = recent.reduce((sum, trip) => sum + (trip.duration_sec || 0), 0);
    return Math.round(totalSec / 3600);
  }, [recent]);

  const reminderIdRef = useRef<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const catchToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startIsoRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const endIsoRef = useRef<string | null>(null);

  const buildLocationUpdateOptions = useCallback(
    (): Location.LocationTaskOptions => ({
      accuracy: Location.Accuracy.High,
      distanceInterval: 20, // Kun opdater ved 20m+ bevægelse
      timeInterval: 5000,   // Max hvert 5. sekund
      pausesUpdatesAutomatically: false,
      ...(Platform.OS === "android"
        ? {
            foregroundService: {
              notificationTitle: "Tracking kører",
              notificationBody: "Stop turen når du er færdig.",
            },
          }
        : {
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.Fitness,
          }),
    }),
    []
  );

  const handlePositionUpdate = useCallback((pos: Location.LocationObject) => {
    // Ignorer readings med dårlig GPS-nøjagtighed (typisk indendørs eller dårligt signal)
    const accuracy = pos.coords.accuracy;
    if (accuracy != null && accuracy > MIN_GPS_ACCURACY) {
      return; // Skip dette punkt - for upræcist
    }

    const p: Pt = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      t:
        typeof pos.timestamp === "number" && Number.isFinite(pos.timestamp)
          ? pos.timestamp
          : Date.now(),
    };

    setPoints((arr) => {
      if (arr.length === 0) {
        setDistanceM(0);
        highSpeedCountRef.current = 0;
        return [p];
      }
      const last = arr[arr.length - 1];
      const step = haversine(last, p);

      // Ignorer små bevægelser (GPS-jitter når man står stille)
      if (step < MIN_WAYPOINT_DISTANCE) {
        // Reset high-speed counter ved stillestående
        highSpeedCountRef.current = 0;
        return arr;
      }

      // Beregn hastighed
      const dtMs = Math.max(1, p.t - last.t);
      const speed = step / (dtMs / 1000);

      // Ignorer urealistiske hop (teleportation/GPS-spike)
      if (step > MAX_WAYPOINT_DISTANCE || speed > MAX_WAYPOINT_SPEED_MS) {
        return arr;
      }

      // Fail-safe: Detekter hvis brugeren kører væk (bil-hastighed)
      if (speed > CAR_SPEED_THRESHOLD) {
        highSpeedCountRef.current += 1;
        // Hvis vi har set høj hastighed flere gange i træk, vis advarsel
        if (highSpeedCountRef.current >= HIGH_SPEED_TRIGGER_COUNT) {
          // Kun vis modal én gang + gem tidspunkt for trim-forslag
          if (highSpeedCountRef.current === HIGH_SPEED_TRIGGER_COUNT) {
            if (!highSpeedDetectedAtRef.current) {
              highSpeedDetectedAtRef.current = Date.now();
            }
            setDrivingAwayModalVisible(true);
          }
        }
      } else {
        // Reset counter hvis hastigheden falder
        highSpeedCountRef.current = 0;
      }

      const newDist = step;
      setDistanceM((m) => m + newDist);
      return [...arr, p];
    });
  }, []);

  const clearStoredTrack = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        TRACK_BUFFER_KEY,
        TRACK_META_KEY,
        TRACK_ACTIVE_KEY,
      ]);
    } catch (e) {
      // console.log("Kunne ikke rydde track storage:", e);
    }
  }, []);

  const loadStoredTrack = useCallback(async (): Promise<Pt[]> => {
    try {
      const raw = await AsyncStorage.getItem(TRACK_BUFFER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr as Pt[];
    } catch (e) {
      // console.log("Kunne ikke hente track buffer:", e);
      return [];
    }
  }, []);

  const hydrateTrackFromStorage = useCallback(async () => {
    try {
      const [bufRaw, metaRaw, activeRaw] = await Promise.all([
        AsyncStorage.getItem(TRACK_BUFFER_KEY),
        AsyncStorage.getItem(TRACK_META_KEY),
        AsyncStorage.getItem(TRACK_ACTIVE_KEY),
      ]);

      if (bufRaw) {
        const pts = JSON.parse(bufRaw) as Pt[];
        if (Array.isArray(pts) && pts.length) {
          setPoints(pts);
          setDistanceM(computeDistance(pts));
          const last = pts[pts.length - 1];
          setRegion({
            latitude: last.latitude,
            longitude: last.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          });
        }
      }

      if (metaRaw && activeRaw === "1") {
        const meta = JSON.parse(metaRaw);
        if (meta?.startIso) {
          startIsoRef.current = meta.startIso;
          sessionIdRef.current = meta.sessionId ?? null;
          setRunning(true);
        }
      }
    } catch (e) {
      // console.log("Hydration fejl:", e);
    }
  }, []);

  const ensureBackgroundTracking = useCallback(async () => {
    if (!startIsoRef.current) return;
    try {
      const bgPerm = await Location.getBackgroundPermissionsAsync();
      if (bgPerm.status !== "granted") return;

      const started = await Location.hasStartedLocationUpdatesAsync(
        TRACK_TASK_NAME
      );
      if (!started) {
        await Location.startLocationUpdatesAsync(
          TRACK_TASK_NAME,
          buildLocationUpdateOptions()
        );
      }

      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 20, // Kun opdater ved 20m+ bevægelse
            timeInterval: 5000,   // Max hvert 5. sekund
          },
          handlePositionUpdate
        );
      }
    } catch (e) {
      // console.log("Kunne ikke genskabe tracking:", e);
    }
  }, [buildLocationUpdateOptions, handlePositionUpdate]);

  const getMergedPoints = useCallback(async (): Promise<Pt[]> => {
    const stored = await loadStoredTrack();
    const merged = [...points, ...stored];
    if (!merged.length) return [];
    merged.sort((a, b) => a.t - b.t);
    const seen = new Set<string>();
    const deduped: Pt[] = [];
    for (const p of merged) {
      const key = `${p.latitude}|${p.longitude}|${p.t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }
    return deduped;
  }, [points, loadStoredTrack]);

  const refreshLists = useCallback(async () => {
    setRecent(await listTrips(50, daysFilter));
  }, [daysFilter]);

  async function loadSpotsWithVisits() {
    setLoadingSpots(true);
    try {
      const spots = await listSpots();
      const allTrips = await listTrips(10000, 0);

      const spotsData = spots.map((spot) => {
        const tripsAtSpot = allTrips.filter((t) => t.spot_id === spot.id);
        const visitCount = tripsAtSpot.length;
        const fishCount = tripsAtSpot.reduce((sum, t) => {
          if (t.fish_events_json) {
            try {
              const parsed = JSON.parse(t.fish_events_json);
              if (Array.isArray(parsed)) return sum + parsed.length;
            } catch {}
          }
          return sum + (t.fish_count ?? 0);
        }, 0);
        return { ...spot, visitCount, fishCount };
      });

      spotsData.sort((a, b) => b.visitCount - a.visitCount);
      setSpotsWithVisits(spotsData);
    } catch (e) {
      // console.log("Fejl ved hentning af spots:", e);
    } finally {
      setLoadingSpots(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await syncOfflineTrips();
        } catch (e) {}
        await hydrateTrackFromStorage();
        await refreshLists();

        // Check fishing license expiry
        try {
          const userId = getUserId();
          const snap = await getDoc(doc(db, "users", userId, "settings", "fishingLicense"));
          if (snap.exists() && snap.data().expiry) {
            const expDate = new Date(snap.data().expiry + "T00:00:00");
            setLicenseExpired(expDate.getTime() < Date.now());
          } else {
            setLicenseExpired(false);
          }
        } catch {
          setLicenseExpired(false);
        }
      })();
      return () => {};
    }, [refreshLists, hydrateTrackFromStorage])
  );

  useEffect(() => {
    if (!running) return;
    ensureBackgroundTracking();
  }, [running, ensureBackgroundTracking]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hydrateTrackFromStorage();
        if (running) {
          ensureBackgroundTracking();
        }
      }
    });
    return () => sub.remove();
  }, [hydrateTrackFromStorage, ensureBackgroundTracking, running]);

  useEffect(() => {
    if (running) return;
    hydrateTrackFromStorage();
  }, [running, hydrateTrackFromStorage]);

  useEffect(() => {
    return () => {
      if (watchRef.current) watchRef.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      if (catchToastTimerRef.current) {
        clearTimeout(catchToastTimerRef.current);
        catchToastTimerRef.current = null;
      }
      cancelReminder();
    };
  }, []);

  useEffect(() => {
    if (!running || !startIsoRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const update = () => {
      if (!startIsoRef.current) return;
      const startMs = new Date(startIsoRef.current).getTime();
      const diffSec = Math.max(
        0,
        Math.floor((Date.now() - startMs) / 1000)
      );
      setSec(diffSec);
    };

    update();
    const id = setInterval(update, 1000);
    timerRef.current = id as any;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  async function scheduleReminder(hours: number) {
    if (!hours) return;
    try {
      const Notifications = await ensureNotificationsConfigured();
      if (!Notifications) return; // Expo Go Android -> no-op

      const perms = await Notifications.requestPermissionsAsync();
      if (!(perms as any).granted && (perms as any).status !== "granted") return;

      await cancelReminder();

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Tracking kører stadig",
          body: "Husk at stoppe turen, når du er færdig.",
        },
        trigger: { seconds: hours * 3600, repeats: true } as any,
      });
      reminderIdRef.current = id;
    } catch (e) {
      // console.log("Fejl i scheduleReminder:", e);
    }
  }

  async function cancelReminder() {
    const id = reminderIdRef.current;
    if (!id) {
      return;
    }
    try {
      const Notifications = await ensureNotificationsConfigured();
      if (!Notifications) return; // Expo Go Android -> no-op
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (e) {
      // console.log("Fejl i cancelReminder:", e);
    }
    reminderIdRef.current = null;
  }

  function confirmStart() {
    if (starting || running) return;
    setStarting(true);

    const resetState = () => {
      setRunning(false);
      setPoints([]);
      setDistanceM(0);
      setSec(0);
      startIsoRef.current = null;
      sessionIdRef.current = null;
      endIsoRef.current = null;
      setCatchMarks([]);
      setCursorMs(null);
      setSelectedCatchIndex(null);
    };

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    (async () => {
      try {
        // Først: hent brugerens position
        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          setPermissionModalVisible(true);
          resetState();
          await clearStoredTrack();
          if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
          }
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          Alert.alert(
            "Placering er slukket",
            "Taend for GPS i Indstillinger og proev igen."
          );
          resetState();
          await clearStoredTrack();
          if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
          }
          return;
        }

        let backgroundGranted = false;
        try {
          const bgPerm = await Location.requestBackgroundPermissionsAsync();
          backgroundGranted = bgPerm.status === "granted";
        } catch (err) {
          // console.log("Kunne ikke forespoerge baggrundstilladelse:", err);
          backgroundGranted = false;
        }
        if (!backgroundGranted) {
          Alert.alert(
            "Baggrundstilladelse mangler",
            "Tracking koerer kun i forgrunden. Vaelg 'Allow all the time' i Indstillinger for baggrund."
          );
        }

        if (watchRef.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
        try {
          const started = await Location.hasStartedLocationUpdatesAsync(
            TRACK_TASK_NAME
          );
          if (started) {
            await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
          }
        } catch (err) {
          // console.log("Kunne ikke stoppe BG tracking:", err);
        }
        await clearStoredTrack();

        const startIso = new Date().toISOString();
        const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        startIsoRef.current = startIso;
        sessionIdRef.current = sessionId;
        endIsoRef.current = null;
        setSec(0);
        setDistanceM(0);
        setCatchMarks([]);
        setCursorMs(null);
        setSelectedCatchIndex(null);
        highSpeedCountRef.current = 0; // Reset fail-safe counter
        highSpeedDetectedAtRef.current = null; // Reset trim timestamp

        let loc: Location.LocationObject | null = null;
        try {
          loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch (err) {
          // console.log("Kunne ikke hente start-position:", err);
        }

        if (!loc) {
          try {
            loc = await Location.getLastKnownPositionAsync();
          } catch (err) {
            // console.log("Kunne ikke hente sidste kendte position:", err);
          }
        }

        // Tjek om der er spots inden for 2km af brugerens position
        const NEARBY_RADIUS_M = 2000; // 2 km
        const spots = await listSpots();

        if (loc) {
          const userPos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, t: 0 };
          const nearbySpots = spots.filter((spot) => {
            if (!spot.lat || !spot.lng) return false;
            const spotPos = { latitude: spot.lat, longitude: spot.lng, t: 0 };
            const distance = haversine(userPos, spotPos);
            return distance <= NEARBY_RADIUS_M;
          });

          if (nearbySpots.length === 0) {
            // Gem brugerens position til oprettelse af nyt spot
            setPendingStartLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

            if (spots.length === 0) {
              // Ingen spots overhovedet
              setNoNearbySpots(false);
            } else {
              // Spots findes, men ingen inden for 2km
              setNoNearbySpots(true);
            }

            setStarting(false);
            setNoSpotsModalVisible(true);
            return;
          }
        } else if (!spots || spots.length === 0) {
          // Ingen lokation tilgængelig og ingen spots - kræv spots
          setNoNearbySpots(false);
          setPendingStartLocation(null);
          setStarting(false);
          setNoSpotsModalVisible(true);
          return;
        }

        const initialPoints: Pt[] = [];
        if (loc) {
          const r: Region = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          };
          setRegion(r);

          const firstPoint = {
            latitude: r.latitude,
            longitude: r.longitude,
            t:
              typeof loc.timestamp === "number" &&
              Number.isFinite(loc.timestamp)
                ? loc.timestamp
                : Date.now(),
          };
          initialPoints.push(firstPoint);
        }
        setPoints(initialPoints);

        await AsyncStorage.setItem(
          TRACK_BUFFER_KEY,
          JSON.stringify(initialPoints)
        );
        await AsyncStorage.setItem(
          TRACK_META_KEY,
          JSON.stringify({ startIso, sessionId })
        );
        await AsyncStorage.setItem(TRACK_ACTIVE_KEY, "1");

        const locationUpdateOptions = buildLocationUpdateOptions();

        if (backgroundGranted) {
          try {
            await Location.startLocationUpdatesAsync(
              TRACK_TASK_NAME,
              locationUpdateOptions
            );
          } catch (err) {
            // console.log("Kunne ikke starte BG tracking:", err);
            Alert.alert(
              "Baggrundstracking fejlede",
              "Tracking koerer kun i forgrunden."
            );
          }
        }

        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 20, // Kun opdater ved 20m+ bevægelse
            timeInterval: 5000,   // Max hvert 5. sekund
          },
          handlePositionUpdate
        );

        setRunning(true);
        cancelReminder();
      } catch (e) {
        // console.log("Fejl ved start af tracking:", e);
        const errMessage = e instanceof Error ? e.message : String(e);
        Alert.alert(
          "Tracking kunne ikke starte",
          `Fejl: ${errMessage}`
        );
        if (watchRef.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        try {
          const started = await Location.hasStartedLocationUpdatesAsync(
            TRACK_TASK_NAME
          );
          if (started) {
            await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
          }
        } catch (err) {
          // console.log("Kunne ikke stoppe BG tracking:", err);
        }
        resetState();
        await clearStoredTrack();
      } finally {
        setStarting(false);
      }
    })();
  }

  function markCatchNow() {
    if (!startIsoRef.current) return;
    const now = Date.now();
    const startMs = new Date(startIsoRef.current).getTime();
    if (now <= startMs) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    pendingCatchTsRef.current = now;
    setCatchLengthInput("");
    setCatchLengthModalVisible(true);
  }

  function saveCatchLength() {
    Keyboard.dismiss();
    const ts = pendingCatchTsRef.current;
    if (!ts) return;

    const parsed = parseFloat(catchLengthInput.replace(",", "."));
    const hasLength = !isNaN(parsed) && parsed >= 10 && parsed <= 150;

    setCatchMarks((prev) => [...prev, { ts, length_cm: hasLength ? parsed : undefined }]);
    setCatchLengthModalVisible(false);
    pendingCatchTsRef.current = null;

    setCatchToastVisible(true);
    if (catchToastTimerRef.current) clearTimeout(catchToastTimerRef.current);
    catchToastTimerRef.current = setTimeout(() => {
      setCatchToastVisible(false);
      catchToastTimerRef.current = null;
    }, 1200);
  }

  function skipCatchLength() {
    Keyboard.dismiss();
    const ts = pendingCatchTsRef.current;
    if (!ts) return;

    setCatchMarks((prev) => [...prev, { ts }]);
    setCatchLengthModalVisible(false);
    pendingCatchTsRef.current = null;

    setCatchToastVisible(true);
    if (catchToastTimerRef.current) clearTimeout(catchToastTimerRef.current);
    catchToastTimerRef.current = setTimeout(() => {
      setCatchToastVisible(false);
      catchToastTimerRef.current = null;
    }, 1200);
  }

  function openWaterTempModal() {
    setWaterTempInput("");
    setWaterTempModalVisible(true);
  }

  function saveWaterTemp() {
    Keyboard.dismiss();
    const parsed = parseFloat(waterTempInput.replace(",", "."));
    const isValid = !isNaN(parsed) && parsed >= -5 && parsed <= 35;

    if (isValid) {
      const now = Date.now();
      setManualWaterTemps((prev) => [...prev, { ts: now, temp: parsed }]);
      setWaterTempToastVisible(true);
      if (waterTempToastTimerRef.current) {
        clearTimeout(waterTempToastTimerRef.current);
      }
      waterTempToastTimerRef.current = setTimeout(() => {
        setWaterTempToastVisible(false);
        waterTempToastTimerRef.current = null;
      }, 1200);
    }

    // Luk altid modalen
    setWaterTempModalVisible(false);
  }

  async function stop() {
    // Reset fail-safe counter
    highSpeedCountRef.current = 0;
    setDrivingAwayModalVisible(false);

    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    try {
      await AsyncStorage.setItem(TRACK_ACTIVE_KEY, "0");
    } catch (e) {
      // console.log("Kunne ikke opdatere tracking-flag:", e);
    }
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        TRACK_TASK_NAME
      );
      if (started) {
        await Location.stopLocationUpdatesAsync(TRACK_TASK_NAME);
      }
    } catch (e) {
      // console.log("Kunne ikke stoppe BG tracking:", e);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    endIsoRef.current = new Date().toISOString();
    // sæt cursor til slut som default
    if (endIsoRef.current) {
      setCursorMs(new Date(endIsoRef.current).getTime());
    }

    // Smart Trim: Analyser om turen reelt sluttede tidligere
    try {
      const merged = await getMergedPoints();
      const actualEndMs = new Date(endIsoRef.current).getTime();
      const suggestion = analyzeTripEndTime({
        points: merged,
        actualEndMs,
        catchMarks,
        highSpeedDetectedAt: highSpeedDetectedAtRef.current,
      });
      if (suggestion) {
        setTrimSuggestion(suggestion);
        setTrimModalVisible(true);
        return; // Vis trim-modal først, derefter fish-modal
      }
    } catch (_e) {
      // Analyse fejlede — spring trim over, gå direkte til fish modal
    }

    setFishModal(true);
  }

  async function confirmFish() {
    // Luk modalerne straks uanset net
    setFishModal(false);
    setStopConfirmVisible(false);
    setCancelConfirmVisible(false);
    if (savingTrip) return;
    setSavingTrip(true);
    const fish = catchMarks.length;

    const startIso =
      startIsoRef.current ||
      new Date(Date.now() - sec * 1000).toISOString();
    const endIso =
      endIsoRef.current || new Date().toISOString();

    const duration_sec = Math.max(
      0,
      Math.floor(
        (new Date(endIso).getTime() - new Date(startIso).getTime()) /
          1000
      )
    );

    const pathToSave = await getMergedPoints();

    const basePayload: SaveTripPayload = {
      start_ts: startIso,
      end_ts: endIso,
      duration_sec,
      distance_m: Math.round(distanceM),
      fish_count: fish,
      path_json: JSON.stringify(pathToSave),
      meta_json: null,
      needs_dmi: true,
      // vigtig: gem rå fangst-tidsstempler (ms) så fiskemønster kan bruge dem
      catch_marks_ms: catchMarks.map((m) => m.ts),
      catch_lengths: catchMarks.filter((m) => m.length_cm != null).map((m) => ({ ts: m.ts, length_cm: m.length_cm! })),
      catch_conditions: catchMarks.filter((m) => m.condition != null).map((m) => ({ ts: m.ts, condition: m.condition! })),
      // selvmålte vandtemperaturer (bruges i stedet for DMI hvis der er målinger)
      manual_water_temps: manualWaterTemps.length > 0 ? manualWaterTemps : undefined,
    };

    // Kør gem i baggrunden; UI er allerede lukket
    (async () => {
      let tripSaved = false;
      try {
        let evaluation: any = null;

        // Prøv DMI; hvis offline/fejl → queue med needs_dmi
        try {
          const ev = await evaluateTripWithDmi({
            startIso,
            endIso,
            points: pathToSave,
          });
          if (ev) evaluation = ev;
        } catch (e: any) {
          // console.log("Fejl ved DMI-evaluering (online-forsøg):", e?.message || e);
        }

        // Hvis brugeren har målt vandtemperatur selv, brug det i stedet for DMI
        if (manualWaterTemps.length > 0 && evaluation) {
          const temps = manualWaterTemps.map((m) => m.temp);
          const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
          evaluation.waterTempC = {
            avg,
            min: Math.min(...temps),
            max: Math.max(...temps),
          };
          evaluation.waterTempSeries = manualWaterTemps.map((m) => ({
            ts: m.ts,
            v: m.temp,
          }));
          evaluation.manualWaterTemp = true; // Marker at det er selvmålt
        }

        if (!evaluation) {
          await queueOfflineTrip({ ...basePayload, needs_dmi: true });
          tripSaved = true;
        } else {
          try {
            await saveTrip({
              ...basePayload,
              meta_json: JSON.stringify({ evaluation }),
              needs_dmi: false,
            } as any);
            tripSaved = true;
          } catch (e) {
            // console.log("Kunne ikke gemme tur online, køer til offline:", e);
            await queueOfflineTrip({
              ...basePayload,
              meta_json: JSON.stringify({ evaluation }),
              needs_dmi: false,
            });
            tripSaved = true;
          }
        }

        await clearStoredTrack();
        setPoints([]);
        setSec(0);
        setDistanceM(0);
        startIsoRef.current = null;
        sessionIdRef.current = null;
        endIsoRef.current = null;
        setCatchMarks([]);
        setCursorMs(null);
        setSelectedCatchIndex(null);
        setManualWaterTemps([]);

        try {
          await refreshLists();
        } catch (e) {
          // console.log("Kunne ikke opdatere lister efter gem:", e);
        }
      } catch (e) {
        // Failsafe: Hvis alt andet fejler, prøv at køe turen en sidste gang
        // console.log("Kritisk fejl ved gem af tur, forsøger failsafe:", e);
        if (!tripSaved) {
          try {
            await queueOfflineTrip({ ...basePayload, needs_dmi: true });
            // console.log("Failsafe: Tur køet til offline sync");
          } catch (queueError) {
            console.error("KRITISK: Kunne ikke gemme tur - hverken online eller offline!", queueError);
            // Her kunne man evt. vise en alert til brugeren
          }
        }
      } finally {
        setSavingTrip(false);
      }
    })();
  }

  function cancelFish() {
    setFishModal(false);
    setPoints([]);
    setSec(0);
    setDistanceM(0);
    startIsoRef.current = null;
    sessionIdRef.current = null;
    endIsoRef.current = null;
    setCatchMarks([]);
    setCursorMs(null);
    setSelectedCatchIndex(null);
    clearStoredTrack();
  }

  // --- tidslinje-beregninger ---
  const tripStartMs = startIsoRef.current
    ? new Date(startIsoRef.current).getTime()
    : null;
  const tripEndMs = endIsoRef.current
    ? new Date(endIsoRef.current).getTime()
    : tripStartMs
    ? tripStartMs + sec * 1000
    : null;
  const durationMs =
    tripStartMs != null && tripEndMs != null
      ? Math.max(1, tripEndMs - tripStartMs)
      : 1;
  const timelineWidth = width - 80;

  const effectiveCursorMs =
    cursorMs ??
    (tripEndMs ??
      tripStartMs ??
      null);

  function handleTimelineTouch(e: any) {
    if (tripStartMs == null || tripEndMs == null) return;
    const x = e.nativeEvent.locationX;
    const usableWidth = Math.max(1, timelineWidth - 16);
    const rel = Math.min(1, Math.max(0, (x - 8) / usableWidth));
    const ms = tripStartMs + rel * durationMs;
    setCursorMs(ms);
    setSelectedCatchIndex(null);
  }

  function addCatchAtCursor() {
    if (tripStartMs == null || tripEndMs == null) return;
    const ms = effectiveCursorMs ?? tripStartMs + durationMs / 2;
    setCatchMarks((prev) => [...prev, ms]);
  }

  function removeSelectedCatch() {
    if (selectedCatchIndex == null) return;
    setCatchMarks((prev) =>
      prev.filter((_, idx) => idx !== selectedCatchIndex)
    );
    setSelectedCatchIndex(null);
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0F" />
      {catchToastVisible && (
        <View pointerEvents="none" style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <View style={styles.toastIcon}>
              <Ionicons name="fish" size={14} color="#FFF" />
            </View>
            <Text style={styles.toastText}>{t("catchRegistered")}</Text>
          </View>
        </View>
      )}
      {waterTempToastVisible && (
        <View pointerEvents="none" style={styles.toastOverlay}>
          <View style={[styles.toastBox, styles.toastBoxBlue]}>
            <View style={[styles.toastIcon, styles.toastIconBlue]}>
              <Ionicons name="thermometer" size={14} color="#FFF" />
            </View>
            <Text style={styles.toastText}>{t("waterTempSaved")}</Text>
          </View>
        </View>
      )}
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0D0D0F" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* === LIVE TRACKING === */}
        {running ? (
          /* Bento Dashboard - Modern 2026 UI */
          <BentoTrackingDashboard
            elapsedSec={sec}
            distanceM={distanceM}
            catchCount={catchMarks.length}
            points={points}
            region={region}
            onRegionChange={setRegion}
            mapProvider={trackingMapProvider}
            spotName={undefined}
            weather={liveWeather ? {
              waterTemp: undefined,
              windSpeed: liveWeather.windMS ?? undefined,
              windDir: liveWeather.windDirDeg != null ? `${Math.round(liveWeather.windDirDeg)}°` : undefined,
              pressureHPa: liveWeather.pressureHPa,
              pressureTrend: liveWeather.pressureTrend,
            } : undefined}
            onMarkCatch={markCatchNow}
            onMeasureTemp={openWaterTempModal}
            onStopTrip={() => setStopConfirmVisible(true)}
            manualTempCount={manualWaterTemps.length}
            lastManualTemp={manualWaterTemps.length > 0 ? manualWaterTemps[manualWaterTemps.length - 1].temp : undefined}
            t={t}
          />
        ) : (
          /* ── Greeting + Map + Start ── */
          <>
            {/* Header */}
            <View style={styles.greetingSection}>
              <Text style={styles.greetingText}>{language === "da" ? "Tracking" : "Tracking"}</Text>
            </View>

            {/* Map Hero */}
            <View style={styles.mapHero}>
              <MapView
                style={styles.mapFull}
                initialRegion={DEFAULT_TRACK_REGION}
                region={region}
                onRegionChangeComplete={setRegion}
                userInterfaceStyle={MAP_UI_STYLE}
                provider={trackingMapProvider}
                mapType="satellite"
              >
              </MapView>

              {/* Weather chips floating on map */}
              {liveWeather && !liveFetching && (
                <View style={styles.mapWeatherRow}>
                  {liveWeather.tempC != null && (
                    <View style={styles.weatherChip}>
                      <Ionicons name="thermometer-outline" size={12} color="#F59E0B" />
                      <Text style={styles.weatherChipText}>{Math.round(liveWeather.tempC)}°</Text>
                    </View>
                  )}
                  {liveWeather.windMS != null && (
                    <View style={styles.weatherChip}>
                      <Ionicons name="flag-outline" size={12} color="#3B82F6" />
                      <Text style={styles.weatherChipText}>{liveWeather.windMS.toFixed(1)} m/s</Text>
                    </View>
                  )}
                  {liveWeather.waveHeightM != null && liveWeather.waveHeightM > 0 && (
                    <View style={styles.weatherChip}>
                      <Ionicons name="analytics-outline" size={12} color="#8B5CF6" />
                      <Text style={styles.weatherChipText}>{liveWeather.waveHeightM.toFixed(1)} m</Text>
                    </View>
                  )}
                </View>
              )}
              {liveFetching && (
                <View style={styles.mapWeatherRow}>
                  <View style={styles.weatherChip}>
                    <ActivityIndicator size="small" color="#F59E0B" />
                  </View>
                </View>
              )}
            </View>

            {/* Start Button */}
            <Pressable
              style={[
                styles.startButton,
                (savingTrip || starting) && { opacity: 0.6 },
              ]}
              onPress={confirmStart}
              disabled={savingTrip || starting}
            >
              <View style={styles.startButtonIconWrap}>
                <Ionicons name="play" size={22} color="#000" />
              </View>
              <View style={styles.startTextContainer}>
                <Text style={styles.startButtonText}>
                  {starting ? t("starting") : t("startFishingTrip")}
                </Text>
                <Text style={styles.startButtonSubtext}>
                  {t("tapToStartTracking")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(13, 13, 15, 0.4)" />
            </Pressable>

            {/* License expired reminder — only for users who previously set a date */}
            {licenseExpired && (
              <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", marginTop: 12 }}>
                {language === "da"
                  ? "Dit fisketegn er udløbet — Indtast ny udløbsdato i indstillinger"
                  : "Your fishing license has expired — Set a new expiry date in settings"}
              </Text>
            )}

          </>
        )}

        {/* === SENESTE TURE === */}
        <View
          style={[styles.sectionHeader, { marginTop: 24, paddingRight: 8 }]}
        >
          <Text style={styles.sectionTitle}>{t("recentTrips")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginLeft: 8 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {filterOptions.map((option) => (
              <Pressable
                key={option.days}
                onPress={() => setDaysFilter(option.days)}
                style={[
                  styles.filterChip,
                  daysFilter === option.days &&
                    styles.filterChipActive,
                ]}
              >
                <Text
                  style={
                    daysFilter === option.days
                      ? styles.filterChipTextActive
                      : styles.filterChipText
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={recent}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <AnimatedTripCardWrapper index={index}>
              <TripCard trip={item} t={t} />
            </AnimatedTripCardWrapper>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Text
              style={{
                color: "#606068",
                fontSize: 14,
                marginTop: 10,
              }}
            >
              {t("noTripsFound")}
            </Text>
          }
          scrollEnabled={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />

        {/* === TUR FÆRDIG MODAL – GRID/TIMELINE-EDITOR === */}
        <Modal visible={fishModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.endTripModal}>
              {/* Header med ikon og tæller */}
              <View style={styles.endTripHeader}>
                <View style={styles.endTripTitleRow}>
                  <Ionicons name="flag" size={22} color={theme.primary} />
                  <Text style={styles.endTripTitle}>{t("finishTrip")}</Text>
                </View>
                <View style={styles.endTripCountBadge}>
                  <Ionicons name="fish" size={14} color="#0D0D0F" />
                  <Text style={styles.endTripCountText}>{catchMarks.length}</Text>
                </View>
              </View>

              {/* Tur-summary badges */}
              <View style={styles.endTripSummaryRow}>
                <View style={styles.endTripSummaryBadge}>
                  <Ionicons name="time-outline" size={13} color={THEME.textSec} />
                  <Text style={styles.endTripSummaryText}>{fmtTime(sec)}</Text>
                </View>
                <View style={styles.endTripSummaryBadge}>
                  <Ionicons name="walk-outline" size={13} color={THEME.textSec} />
                  <Text style={styles.endTripSummaryText}>{(distanceM / 1000).toFixed(1)} km</Text>
                </View>
              </View>

              {/* Tidsvælger */}
              <View style={styles.endTripTimeSelector}>
                <View style={styles.endTripTimeCurrent}>
                  <Text style={styles.endTripTimeCurrentLabel}>{t("selectedTime")}</Text>
                  <Text style={styles.endTripTimeCurrentValue}>
                    {effectiveCursorMs
                      ? new Date(effectiveCursorMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Timeline */}
              <View style={styles.endTripTimelineContainer}>
                <View
                  style={[styles.endTripTimelineBar, { width: timelineWidth }]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleTimelineTouch}
                  onResponderMove={handleTimelineTouch}
                >
                  {/* Gradient baggrund */}
                  <View style={styles.endTripTimelineGradient} />

                  {/* cursor-position */}
                  {effectiveCursorMs != null &&
                    tripStartMs != null &&
                    tripEndMs != null &&
                    (() => {
                      const rel = (effectiveCursorMs - tripStartMs) / durationMs;
                      const clamped = Math.min(1, Math.max(0, rel));
                      const usableWidth = timelineWidth - 24;
                      const left = 12 + clamped * usableWidth;
                      return (
                        <View style={[styles.endTripCursor, { left }]}>
                          <View style={styles.endTripCursorLine} />
                          <View style={styles.endTripCursorDot} />
                        </View>
                      );
                    })()}

                  {/* markører */}
                  {catchMarks.map((mark, idx) => {
                    if (tripStartMs == null || tripEndMs == null) return null;
                    const rel = (mark.ts - tripStartMs) / durationMs;
                    const clamped = Math.min(1, Math.max(0, rel));
                    const usableWidth = timelineWidth - 24;
                    const left = 12 + clamped * usableWidth;
                    const isSelected = selectedCatchIndex === idx;

                    const label = new Date(mark.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <Pressable
                        key={`${mark.ts}-${idx}`}
                        style={[styles.endTripMarker, { left }]}
                        onPress={() => {
                          setSelectedCatchIndex(idx);
                          setCursorMs(mark.ts);
                        }}
                      >
                        <View
                          style={[
                            styles.endTripMarkerPill,
                            isSelected && styles.endTripMarkerPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.endTripMarkerText,
                              isSelected && styles.endTripMarkerTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                        <View style={styles.endTripMarkerStem} />
                        <View
                          style={[
                            styles.endTripMarkerDot,
                            isSelected && styles.endTripMarkerDotActive,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Tidsakse */}
                <View style={styles.endTripTimeAxis}>
                  <Text style={styles.endTripTimeAxisText}>
                    {tripStartMs
                      ? new Date(tripStartMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                  <Text style={styles.endTripTimeAxisText}>
                    {tripEndMs
                      ? new Date(tripEndMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.endTripActions}>
                <Pressable style={styles.endTripAddBtn} onPress={addCatchAtCursor}>
                  <Ionicons name="add" size={20} color="#000" />
                  <Text style={styles.endTripAddBtnText}>{t("addCatch")}</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.endTripDeleteBtn,
                    selectedCatchIndex == null && styles.endTripDeleteBtnDisabled,
                  ]}
                  disabled={selectedCatchIndex == null}
                  onPress={removeSelectedCatch}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={selectedCatchIndex == null ? THEME.textSec : THEME.danger}
                  />
                  <Text
                    style={[
                      styles.endTripDeleteBtnText,
                      selectedCatchIndex == null && styles.endTripDeleteBtnTextDisabled,
                    ]}
                  >
                    {t("deleteSelected")}
                  </Text>
                </Pressable>
              </View>

              {/* Hint tekst */}
              <Text style={styles.endTripHint}>
                {t("timelineHint")}
              </Text>

              {/* Footer buttons */}
              <View style={styles.endTripFooter}>
                <Pressable style={styles.endTripSaveBtn} onPress={confirmFish}>
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={styles.endTripSaveBtnText}>{t("saveTrip")}</Text>
                </Pressable>
                <Pressable
                  style={styles.endTripCancelBtn}
                  onPress={() => {
                    setFishModal(false);
                    setCancelConfirmVisible(true);
                  }}
                >
                  <Ionicons name="close" size={18} color="#A0A0A8" />
                  <Text style={styles.endTripCancelBtnText}>{t("cancel")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === STOP-BEKRÆFTELSE === */}
        <Modal
          visible={stopConfirmVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmModal}>
              <View style={styles.confirmIconCircle}>
                <Ionicons name="flag" size={28} color={theme.primary} />
              </View>
              <Text style={styles.confirmTitle}>{t("finishTripQuestion")}</Text>
              <Text style={styles.confirmText}>
                {t("stopTrackingConfirm")}
              </Text>
              <View style={styles.confirmButtons}>
                <Pressable
                  style={styles.confirmButtonPrimary}
                  onPress={() => {
                    setStopConfirmVisible(false);
                    stop();
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#000" />
                  <Text style={styles.confirmButtonPrimaryText}>{t("yesStop")}</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmButtonSecondary}
                  onPress={() => setStopConfirmVisible(false)}
                >
                  <Text style={styles.confirmButtonSecondaryText}>{t("continueTrip")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === ANNULLÉR-TUR BEKRÆFTELSESMODAL === */}
        <Modal
          visible={cancelConfirmVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmModal}>
              <View style={[styles.confirmIconCircle, styles.confirmIconDanger]}>
                <Ionicons name="warning" size={28} color={THEME.danger} />
              </View>
              <Text style={styles.confirmTitle}>
                {language === "da" ? "Annullér tur" : "Cancel trip"}
              </Text>
              <Text style={styles.confirmText}>
                {language === "da"
                  ? "Er du sikker? Alle data fra denne tur vil gå tabt."
                  : "Are you sure? All data from this trip will be lost."}
              </Text>
              <View style={styles.confirmButtons}>
                <Pressable
                  style={[styles.confirmButtonPrimary, styles.confirmButtonDanger]}
                  onPress={() => {
                    setCancelConfirmVisible(false);
                    cancelFish();
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFF" />
                  <Text style={styles.confirmButtonDangerText}>
                    {language === "da" ? "Ja, slet turen" : "Yes, discard trip"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.confirmButtonSecondary}
                  onPress={() => {
                    setCancelConfirmVisible(false);
                    setFishModal(true);
                  }}
                >
                  <Text style={styles.confirmButtonSecondaryText}>
                    {language === "da" ? "Tilbage" : "Go back"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === GPS-TILLADELSE MODAL === */}
        <Modal
          visible={permissionModalVisible}
          transparent
          animationType="fade"
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmModal}>
              <View style={[styles.confirmIconCircle, styles.confirmIconDanger]}>
                <Ionicons name="location-outline" size={28} color={THEME.danger} />
              </View>
              <Text style={styles.confirmTitle}>
                {language === "da" ? "Adgang nægtet" : "Access denied"}
              </Text>
              <Text style={styles.confirmText}>
                {language === "da"
                  ? "Appen skal bruge din position for at tracke en tur. Gå til dine indstillinger for at give adgang."
                  : "The app needs your location to track a trip. Go to your settings to grant access."}
              </Text>
              <View style={styles.confirmButtons}>
                <Pressable
                  style={styles.confirmButtonPrimary}
                  onPress={() => setPermissionModalVisible(false)}
                >
                  <Text style={styles.confirmButtonPrimaryText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === MINE SPOTS MODAL === */}
        <Modal
          visible={spotsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSpotsModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { maxHeight: "80%" }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Mine Fiskepladser</Text>
                <Pressable
                  onPress={() => setSpotsModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={20} color={THEME.text} />
                </Pressable>
              </View>

              {loadingSpots ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={{ color: THEME.textSec, marginTop: 12 }}>
                    Henter spots...
                  </Text>
                </View>
              ) : spotsWithVisits.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons
                    name="location-outline"
                    size={48}
                    color={THEME.textSec}
                  />
                  <Text
                    style={{
                      color: THEME.textSec,
                      marginTop: 12,
                      textAlign: "center",
                    }}
                  >
                    Du har ikke oprettet nogen fiskepladser endnu.{"\n"}
                    Gå til Spot & Vejr for at tilføje spots.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 400 }}
                  showsVerticalScrollIndicator={false}
                >
                  {spotsWithVisits.map((spot, idx) => (
                    <View
                      key={spot.id}
                      style={[
                        styles.spotListItem,
                        idx === spotsWithVisits.length - 1 && {
                          borderBottomWidth: 0,
                        },
                      ]}
                    >
                      <View style={styles.spotListIcon}>
                        <Ionicons
                          name="location"
                          size={18}
                          color={theme.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.spotListName}>{spot.name}</Text>
                        {spot.notes ? (
                          <Text
                            style={styles.spotListNotes}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {spot.notes}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.spotListStats}>
                        <View style={styles.spotStatBadge}>
                          <Ionicons
                            name="navigate-outline"
                            size={12}
                            color={THEME.text}
                          />
                          <Text style={styles.spotStatText}>
                            {spot.visitCount}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.spotStatBadge,
                            { backgroundColor: theme.primary },
                          ]}
                        >
                          <Ionicons
                            name="fish-outline"
                            size={12}
                            color={THEME.bg}
                          />
                          <Text
                            style={[styles.spotStatText, { color: THEME.bg }]}
                          >
                            {spot.fishCount}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}

            </View>
          </View>
        </Modal>

        {/* === OPRET SPOT FØRST MODAL === */}
        <Modal
          visible={noSpotsModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setNoSpotsModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.noSpotsModal}>
              {/* Ikon */}
              <View style={styles.noSpotsIconCircle}>
                <Ionicons name={noNearbySpots ? "location" : "map"} size={32} color={theme.primary} />
              </View>

              {/* Titel */}
              <Text style={styles.noSpotsTitle}>
                {noNearbySpots
                  ? (language === "da" ? "Intet spot i nærheden" : "No spot nearby")
                  : (language === "da" ? "Opret et spot først" : "Create a spot first")}
              </Text>

              {/* Beskrivelse */}
              <Text style={styles.noSpotsDescription}>
                {noNearbySpots
                  ? (language === "da"
                    ? "Der er ingen spots inden for 2 km af din position. Opret et nyt spot her for at tracke din tur."
                    : "There are no spots within 2 km of your position. Create a new spot here to track your trip.")
                  : (language === "da"
                    ? "For at tracke ture skal du først oprette mindst ét fiskeplads-spot."
                    : "To track trips, you need to create at least one fishing spot.")}
              </Text>

              {/* Position badge (kun hvis vi har en position) */}
              {pendingStartLocation && (
                <View style={styles.noSpotsAppBadge}>
                  <Ionicons name="navigate" size={16} color={theme.primary} />
                  <Text style={styles.noSpotsAppBadgeText}>
                    {pendingStartLocation.latitude.toFixed(4)}, {pendingStartLocation.longitude.toFixed(4)}
                  </Text>
                </View>
              )}

              <Text style={styles.noSpotsHint}>
                {noNearbySpots
                  ? (language === "da"
                    ? "Tryk 'Opret spot her' for at gemme denne position som et nyt fiskested."
                    : "Tap 'Create spot here' to save this location as a new fishing spot.")
                  : (language === "da"
                    ? "Tryk på kortet i Vejrkort for at oprette spots, som dine ture automatisk tilknyttes."
                    : "Tap on the map in Weather Map to create spots that your trips will automatically be linked to.")}
              </Text>

              {/* Knapper */}
              <View style={styles.noSpotsButtons}>
                <Pressable
                  style={styles.noSpotsButtonPrimary}
                  onPress={() => {
                    setNoSpotsModalVisible(false);
                    if (pendingStartLocation) {
                      // Naviger til spot-weather med koordinater som parameter
                      router.push({
                        pathname: "/spot-weather",
                        params: {
                          createSpotLat: pendingStartLocation.latitude.toString(),
                          createSpotLng: pendingStartLocation.longitude.toString(),
                        },
                      });
                    } else {
                      router.push("/spot-weather");
                    }
                  }}
                >
                  <Ionicons name={noNearbySpots ? "add-circle" : "map"} size={18} color="#000" />
                  <Text style={styles.noSpotsButtonPrimaryText}>
                    {noNearbySpots
                      ? (language === "da" ? "Opret spot her" : "Create spot here")
                      : (language === "da" ? "Åbn Vejrkort" : "Open Weather Map")}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.noSpotsButtonSecondary}
                  onPress={() => setNoSpotsModalVisible(false)}
                >
                  <Text style={styles.noSpotsButtonSecondaryText}>
                    {language === "da" ? "Annuller" : "Cancel"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === KØRER VÆK ADVARSEL MODAL === */}
        <Modal
          visible={drivingAwayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDrivingAwayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.drivingAwayModal}>
              {/* Ikon */}
              <View style={styles.drivingAwayIconCircle}>
                <Ionicons name="car" size={32} color={THEME.danger} />
              </View>

              {/* Titel */}
              <Text style={styles.drivingAwayTitle}>
                {language === "da" ? "Kører du væk?" : "Driving away?"}
              </Text>

              {/* Beskrivelse */}
              <Text style={styles.drivingAwayDescription}>
                {language === "da"
                  ? "Det ser ud til at du bevæger dig med høj hastighed. Har du glemt at stoppe din tur?"
                  : "It looks like you're moving at high speed. Did you forget to stop your trip?"}
              </Text>

              {/* Hastigheds-indikator */}
              <View style={styles.drivingAwaySpeedBadge}>
                <Ionicons name="speedometer" size={16} color={THEME.danger} />
                <Text style={styles.drivingAwaySpeedText}>
                  {language === "da" ? "Høj hastighed detekteret" : "High speed detected"}
                </Text>
              </View>

              {/* Knapper */}
              <View style={styles.drivingAwayButtons}>
                <Pressable
                  style={styles.drivingAwayButtonDanger}
                  onPress={() => {
                    setDrivingAwayModalVisible(false);
                    highSpeedCountRef.current = 0;
                    stop();
                  }}
                >
                  <Ionicons name="stop-circle" size={18} color="#FFF" />
                  <Text style={styles.drivingAwayButtonDangerText}>
                    {language === "da" ? "Stop tur" : "Stop trip"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.drivingAwayButtonSecondary}
                  onPress={() => {
                    setDrivingAwayModalVisible(false);
                    // Reset counter så vi ikke spammer brugeren
                    highSpeedCountRef.current = 0;
                  }}
                >
                  <Text style={styles.drivingAwayButtonSecondaryText}>
                    {language === "da" ? "Fortsæt tracking" : "Continue tracking"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === SMART TRIM MODAL === */}
        <Modal
          visible={trimModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setTrimModalVisible(false);
            setTrimSuggestion(null);
            setFishModal(true);
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.drivingAwayModal}>
              {/* Ikon */}
              <View style={[styles.drivingAwayIconCircle, { backgroundColor: "#F59E0B18" }]}>
                <Ionicons name="cut-outline" size={28} color={THEME.accent} />
              </View>

              {/* Titel */}
              <Text style={styles.drivingAwayTitle}>
                {language === "da" ? "Trim din tur?" : "Trim your trip?"}
              </Text>

              {/* Beskrivelse */}
              <Text style={styles.drivingAwayDescription}>
                {language === "da"
                  ? `Det ser ud til at du stoppede med at fiske kl. ${trimSuggestion ? formatTrimTime(trimSuggestion.suggestedEndMs, "da") : ""}.${
                      trimSuggestion?.reason === "speed_detected" || trimSuggestion?.reason === "high_speed"
                        ? " Vi detekterede at du kørte væk."
                        : " Du bevægede dig ikke i lang tid."
                    }`
                  : `It looks like you stopped fishing at ${trimSuggestion ? formatTrimTime(trimSuggestion.suggestedEndMs, "en") : ""}.${
                      trimSuggestion?.reason === "speed_detected" || trimSuggestion?.reason === "high_speed"
                        ? " We detected you driving away."
                        : " You were idle for a long time."
                    }`}
              </Text>

              {/* Trim detaljer */}
              {trimSuggestion && (
                <View style={styles.drivingAwaySpeedBadge}>
                  <Ionicons name="timer-outline" size={16} color={THEME.accent} />
                  <Text style={[styles.drivingAwaySpeedText, { color: THEME.accent }]}>
                    {language === "da"
                      ? `Fjerner ${formatDuration(trimSuggestion.trimmedSec, "da")} fra turen`
                      : `Removes ${formatDuration(trimSuggestion.trimmedSec, "en")} from trip`}
                  </Text>
                </View>
              )}

              {/* Knapper */}
              <View style={styles.drivingAwayButtons}>
                <Pressable
                  style={[styles.drivingAwayButtonDanger, { backgroundColor: THEME.accent }]}
                  onPress={() => {
                    // Anvend trim
                    if (trimSuggestion) {
                      endIsoRef.current = trimSuggestion.suggestedEndIso;
                      setCursorMs(trimSuggestion.suggestedEndMs);
                      setDistanceM(trimSuggestion.trimmedDistanceM);
                      setCatchMarks(trimSuggestion.validCatchMarks);
                      const startMs = new Date(startIsoRef.current || "").getTime();
                      setSec(Math.round((trimSuggestion.suggestedEndMs - startMs) / 1000));
                    }
                    setTrimModalVisible(false);
                    setTrimSuggestion(null);
                    setFishModal(true);
                  }}
                >
                  <Ionicons name="cut-outline" size={18} color="#000" />
                  <Text style={[styles.drivingAwayButtonDangerText, { color: "#000" }]}>
                    {language === "da"
                      ? `Trim til ${trimSuggestion ? formatTrimTime(trimSuggestion.suggestedEndMs, "da") : ""}`
                      : `Trim to ${trimSuggestion ? formatTrimTime(trimSuggestion.suggestedEndMs, "en") : ""}`}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.drivingAwayButtonSecondary}
                  onPress={() => {
                    // Behold fuld tur
                    setTrimModalVisible(false);
                    setTrimSuggestion(null);
                    setFishModal(true);
                  }}
                >
                  <Text style={styles.drivingAwayButtonSecondaryText}>
                    {language === "da" ? "Behold fuld tur" : "Keep full trip"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* === VANDTEMPERATUR MODAL === */}
        <Modal
          visible={waterTempModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            Keyboard.dismiss();
            setWaterTempModalVisible(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBackdrop}
          >
            <View style={styles.waterTempModal}>
              <View style={styles.waterTempIconCircle}>
                <Ionicons name="thermometer" size={28} color={THEME.graphBlue} />
              </View>

              <Text style={styles.waterTempModalTitle}>{t("waterTempTitle")}</Text>
              <Text style={styles.waterTempModalHint}>{t("waterTempHint")}</Text>

              <View style={styles.waterTempInputRow}>
                <TextInput
                  style={styles.waterTempInput}
                  value={waterTempInput}
                  onChangeText={setWaterTempInput}
                  keyboardType="decimal-pad"
                  placeholder="12.5"
                  placeholderTextColor={THEME.textTertiary}
                  maxLength={5}
                  autoFocus
                />
                <Text style={styles.waterTempUnit}>{t("waterTempUnit")}</Text>
              </View>

              <View style={styles.waterTempButtons}>
                <Pressable
                  style={styles.waterTempButtonPrimary}
                  onPress={saveWaterTemp}
                >
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={styles.waterTempButtonPrimaryText}>{t("save")}</Text>
                </Pressable>

                <Pressable
                  style={styles.waterTempButtonSecondary}
                  onPress={() => {
                    Keyboard.dismiss();
                    setWaterTempModalVisible(false);
                  }}
                >
                  <Text style={styles.waterTempButtonSecondaryText}>
                    {language === "da" ? "Annuller" : "Cancel"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Fangst-længde modal */}
        <Modal
          visible={catchLengthModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            Keyboard.dismiss();
            skipCatchLength();
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBackdrop}
          >
            <View style={styles.waterTempModal}>
              <View style={[styles.waterTempIconCircle, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                <Ionicons name="fish" size={28} color={THEME.graphYellow} />
              </View>

              <Text style={styles.waterTempModalTitle}>
                {t("catchRegisteredTitle")}
              </Text>
              <Text style={styles.waterTempModalHint}>
                {t("enterLengthOptional")}
              </Text>

              <View style={styles.waterTempInputRow}>
                <TextInput
                  style={styles.waterTempInput}
                  value={catchLengthInput}
                  onChangeText={setCatchLengthInput}
                  keyboardType="number-pad"
                  placeholder="45"
                  placeholderTextColor={THEME.textTertiary}
                  maxLength={3}
                  autoFocus
                />
                <Text style={styles.waterTempUnit}>cm</Text>
              </View>

              <View style={styles.waterTempButtons}>
                <Pressable
                  style={styles.waterTempButtonPrimary}
                  onPress={saveCatchLength}
                >
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={styles.waterTempButtonPrimaryText}>{t("save")}</Text>
                </Pressable>

                <Pressable
                  style={styles.waterTempButtonSecondary}
                  onPress={skipCatchLength}
                >
                  <Text style={styles.waterTempButtonSecondaryText}>
                    {t("skip")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </ScrollView>

      {/* Loading overlay - udenfor ScrollView så den dækker hele skærmen */}
      {savingTrip && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.savingText}>{t("savingTrip")}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#161618",
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#A0A0A8",
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    marginRight: 8,
  },
  statusIndicatorActive: {
    backgroundColor: "#F59E0B",
  },
  statusGlow: {
    display: "none",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  statusDotActive: {
    backgroundColor: "#F59E0B",
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  activePulseAnimated: {
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  activeBadgeText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  mapContainer: {
    height: 180,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1E1E21",
    position: "relative",
  },
  mapOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(22, 22, 24, 0.95)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-around",
    overflow: "hidden",
  },
  mapOverlayGlow: {
    display: "none",
  },
  overlayStatBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlayLabel: {
    color: "#606068",
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  overlayValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  heroActions: {
    marginTop: 20,
  },
  startButton: {
    backgroundColor: "#F59E0B",
    height: 64,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 14,
  },
  startButtonIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(13, 13, 15, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  startTextContainer: {
    flex: 1,
  },
  startButtonText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "700",
  },
  startButtonSubtext: {
    color: "rgba(13, 13, 15, 0.5)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  licenseWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  licenseWarningText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    lineHeight: 17,
  },

  runningActions: {
    flexDirection: "row",
    gap: 12,
  },
  catchButtonLarge: {
    flex: 1,
    backgroundColor: "#F59E0B",
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  catchIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(13, 13, 15, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  catchButtonLargeText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  stopButtonNew: {
    backgroundColor: "#FF3B3015",
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
    position: "relative",
  },
  stopButtonGlow: {
    display: "none",
  },
  stopButtonNewText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "600",
  },

  waterTempButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: "#1E1E21",
    borderRadius: 12,
    marginTop: 12,
  },
  waterTempButtonText: {
    color: "#A0A0A8",
    fontSize: 14,
    fontWeight: "500",
  },
  waterTempButtonTextActive: {
    color: THEME.graphBlue,
  },

  catchButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  catchButtonText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },

  stopButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stopButtonSmall: {
    backgroundColor: "#FF3B30",
    borderRadius: 16,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  savingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(13, 13, 15, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 16,
    zIndex: 9999,
  },
  savingText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statsGridSymmetric: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    width: "33.33%",
    alignItems: "center",
    paddingVertical: 14,
  },
  statCellValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  statCellLabel: {
    color: "#606068",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "23%",
    backgroundColor: "transparent",
    alignItems: "center",
    paddingVertical: 12,
  },
  statBoxAccent: {
    backgroundColor: "#1E1E21",
    borderRadius: 12,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#1E1E21",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statLabel: {
    color: "#606068",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 14,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.5,
  },

  card: {
    backgroundColor: "#161618",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  expandableCard: {
    backgroundColor: "#161618",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  expandableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statsHighlight: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: "#1E1E21",
    borderRadius: 16,
  },
  statsHighlightItem: {
    alignItems: "center",
    flex: 1,
  },
  statsHighlightValue: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  statsHighlightLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#606068",
    marginTop: 4,
  },
  statsHighlightDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#2A2A2E",
  },
  allTimeGraphSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2E",
  },
  allTimeGraphTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#606068",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  fishPatternCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2E",
  },
  fishPatternTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fishPatternSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#606068",
  },
  fishPatternHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fishPatternItem: {
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 4,
  },
  fishPatternChipWrap: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  fishPatternChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1E1E21",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
  },
  fishPatternChipText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },

  tripCard: {
    backgroundColor: "#161618",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 12,
    alignItems: "flex-start",
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E1E21",
    alignItems: "center",
    justifyContent: "center",
  },
  tripTitleRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  tripLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    width: "100%",
  },
  tripDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    marginTop: 6,
  },
  tripSpot: {
    flex: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "left",
  },
  tripDate: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 0,
  },
  tripSub: {
    color: "#606068",
    fontSize: 13,
    marginTop: 2,
  },
  tripBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  tripBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D0D0F",
  },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#1E1E21",
  },
  chipActive: {
    backgroundColor: "#F59E0B",
  },
  chipText: { color: "#A0A0A8", fontWeight: "500" },
  chipActiveText: { color: "#0D0D0F", fontWeight: "600" },

  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#1E1E21",
  },
  filterChipActive: {
    backgroundColor: "#F59E0B",
  },
  filterChipText: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#0D0D0F",
    fontSize: 13,
    fontWeight: "600",
  },
  chipFuture: {
    backgroundColor: "#1E1E21",
    opacity: 0.5,
  },
  chipFutureText: {
    color: "#606068",
    fontWeight: "500",
  },

  label: { color: "#A0A0A8", fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
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
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E21",
  },

  noSpotsModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  noSpotsIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  noSpotsTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  noSpotsDescription: {
    fontSize: 15,
    color: "#A0A0A8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  noSpotsAppBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  noSpotsAppBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F59E0B",
  },
  noSpotsHint: {
    fontSize: 13,
    color: "#606068",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  noSpotsButtons: {
    width: "100%",
    gap: 12,
  },
  noSpotsButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F59E0B",
    height: 56,
    borderRadius: 16,
  },
  noSpotsButtonPrimaryText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#0D0D0F",
  },
  noSpotsButtonSecondary: {
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  noSpotsButtonSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0A0A8",
  },

  // Kører væk modal styles
  drivingAwayModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  drivingAwayIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  drivingAwayTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  drivingAwayDescription: {
    fontSize: 15,
    color: "#A0A0A8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  drivingAwaySpeedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 24,
  },
  drivingAwaySpeedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF3B30",
  },
  drivingAwayButtons: {
    width: "100%",
    gap: 12,
  },
  drivingAwayButtonDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FF3B30",
    height: 56,
    borderRadius: 16,
  },
  drivingAwayButtonDangerText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  drivingAwayButtonSecondary: {
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  drivingAwayButtonSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0A0A8",
  },

  waterTempModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  waterTempIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  waterTempModalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  waterTempModalHint: {
    fontSize: 14,
    color: "#A0A0A8",
    textAlign: "center",
    marginBottom: 24,
  },
  waterTempInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  waterTempInput: {
    width: 120,
    height: 56,
    backgroundColor: "#1E1E21",
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 24,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#2A2A2E",
  },
  waterTempUnit: {
    fontSize: 24,
    fontWeight: "600",
    color: "#606068",
  },
  waterTempButtons: {
    width: "100%",
    gap: 12,
  },
  waterTempButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: THEME.graphBlue,
    height: 56,
    borderRadius: 16,
  },
  waterTempButtonPrimaryText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#0D0D0F",
  },
  waterTempButtonSecondary: {
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  waterTempButtonSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0A0A8",
  },

  btn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  primary: { backgroundColor: "#F59E0B" },
  primaryText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  ghost: { backgroundColor: "#1E1E21" },
  ghostText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },

  graphContainer: {
    position: "relative",
    height: 160,
    marginBottom: 16,
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
    paddingHorizontal: 40,
    marginTop: -4,
  },
  graphTimeText: {
    fontSize: 11,
    color: "#606068",
  },
  graphGrid: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 20,
  },
  graphGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#2A2A2E",
  },

  sparkWrap: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 20,
  },
  sparkBarWrapper: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "flex-end",
    height: "100%",
  },
  sparkBar: {
    width: 10,
    borderRadius: 6,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sparkLabel: {
    fontSize: 10,
    color: "#606068",
    marginTop: 4,
    position: "absolute",
    bottom: -18,
  },
  sparkValue: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#1E1E21",
    borderRadius: 8,
    marginBottom: 6,
  },

  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
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

  endTripModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 20,
  },
  endTripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  endTripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  endTripTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  endTripCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  endTripCountText: {
    color: "#0D0D0F",
    fontSize: 16,
    fontWeight: "700",
  },
  endTripSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  endTripSummaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  endTripSummaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A8",
    fontVariant: ["tabular-nums"],
  },
  endTripTimeSelector: {
    alignItems: "center",
    marginBottom: 20,
  },
  endTripTimeCurrent: {
    alignItems: "center",
    backgroundColor: "#1E1E21",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  endTripTimeCurrentLabel: {
    fontSize: 12,
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  endTripTimeCurrentValue: {
    fontSize: 32,
    fontWeight: "300",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  endTripTimelineContainer: {
    marginBottom: 20,
  },
  endTripTimelineBar: {
    height: 140,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
    overflow: "visible",
    position: "relative",
  },
  endTripTimelineGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  endTripCursor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 5,
  },
  endTripCursorLine: {
    position: "absolute",
    top: 0,
    bottom: 20,
    width: 2,
    backgroundColor: "#F59E0B",
    borderRadius: 1,
  },
  endTripCursorDot: {
    position: "absolute",
    bottom: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    borderWidth: 3,
    borderColor: "#161618",
  },
  endTripMarker: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
    zIndex: 10,
  },
  endTripMarkerPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F59E0B20",
    marginBottom: 4,
  },
  endTripMarkerPillActive: {
    backgroundColor: "#F59E0B",
  },
  endTripMarkerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F59E0B",
  },
  endTripMarkerTextActive: {
    color: "#0D0D0F",
  },
  endTripMarkerStem: {
    width: 2,
    height: 60,
    backgroundColor: "#F59E0B",
    opacity: 0.4,
  },
  endTripMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F59E0B",
    marginTop: -1,
  },
  endTripMarkerDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  endTripTimeAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 8,
  },
  endTripTimeAxisText: {
    fontSize: 12,
    color: "#606068",
  },
  endTripActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  endTripAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    height: 56,
    borderRadius: 16,
  },
  endTripAddBtnText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  endTripDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FF3B3015",
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  endTripDeleteBtnDisabled: {
    backgroundColor: "#1E1E21",
  },
  endTripDeleteBtnText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "600",
  },
  endTripDeleteBtnTextDisabled: {
    color: "#606068",
  },
  endTripHint: {
    fontSize: 13,
    color: "#606068",
    textAlign: "center",
    marginBottom: 20,
  },
  endTripFooter: {
    flexDirection: "row",
    gap: 12,
  },
  endTripSaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
  },
  endTripSaveBtnText: {
    color: "#0D0D0F",
    fontSize: 17,
    fontWeight: "600",
  },
  endTripCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  endTripCancelBtnText: {
    color: "#A0A0A8",
    fontSize: 15,
    fontWeight: "600",
  },

  toastOverlay: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 20,
  },
  toastBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastBoxBlue: {
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  toastIconBlue: {
    backgroundColor: "#3B82F6",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  seasonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1E21",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  seasonBtnText: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
  },
  seasonBtnSub: {
    display: "none",
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#1E1E21",
  },
  seasonRowActive: {
    backgroundColor: "#F59E0B20",
  },
  seasonRowText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  seasonRowTextActive: {
    color: "#F59E0B",
    fontSize: 15,
    fontWeight: "600",
  },
  seasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#2A2A2E",
    marginRight: 10,
  },
  seasonRadioActive: {
    borderColor: "#F59E0B",
    backgroundColor: "#F59E0B",
  },
  yearPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  yearPickerBtnText: {
    color: "#A0A0A8",
    fontSize: 13,
    fontWeight: "500",
  },
  yearPill: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  yearPillText: {
    color: "#0D0D0F",
    fontWeight: "600",
    fontSize: 13,
  },

  spotsButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1E1E21",
  },
  spotsButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  spotsButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
  },
  spotsButtonTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A8",
  },
  spotsButtonSubtitle: {
    fontSize: 12,
    color: "#606068",
    marginTop: 2,
  },
  spotListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2E",
    gap: 12,
  },
  spotListIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
  },
  spotListName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  spotListNotes: {
    fontSize: 12,
    color: "#606068",
    marginTop: 2,
  },
  spotListStats: {
    flexDirection: "row",
    gap: 8,
  },
  spotStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1E1E21",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  spotStatText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // ── Confirmation Modal Styles ──
  confirmModal: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  confirmIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  confirmIconDanger: {
    backgroundColor: "rgba(255, 59, 48, 0.12)",
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 15,
    color: "#A0A0A8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  confirmButtons: {
    width: "100%",
    gap: 10,
  },
  confirmButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    height: 52,
    borderRadius: 14,
  },
  confirmButtonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D0D0F",
  },
  confirmButtonDanger: {
    backgroundColor: "#FF3B30",
  },
  confirmButtonDangerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  confirmButtonSecondary: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
  },
  confirmButtonSecondaryText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#606068",
  },

  // ── New Start Screen Styles ──
  greetingSection: {
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: "300",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  greetingDate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#606068",
    marginTop: 4,
    letterSpacing: 0.1,
  },
  mapHero: {
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1E1E21",
    marginBottom: 16,
    position: "relative",
  },
  mapFull: {
    flex: 1,
  },
  mapWeatherRow: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  weatherChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(22, 22, 24, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  weatherChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  quickStatsCard: {
    flexDirection: "row",
    backgroundColor: "#161618",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#2A2A2E",
  },
  quickStatItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  quickStatIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  quickStatValue: {
    fontSize: 22,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  quickStatLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#606068",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  quickStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#2A2A2E",
    alignSelf: "center",
  },
});





