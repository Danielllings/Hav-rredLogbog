// app/(tabs)/spot-weather.tsx
// SpotWeather med DMI EDR, vandstand/bølger og 0-cm reference-linje på vandstandsgrafen

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  StatusBar,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import MapView, {
  Marker,
  MapPressEvent,
  UrlTile,
  Callout,
  Region,
  Polygon,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
} from "react-native-maps";
import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import * as ExpoLinking from "expo-linking";
import Ionicons from "@expo/vector-icons/Ionicons";
import SunCalc from "suncalc";

import {
  getSpotForecastEdr,
  warmUpDmiProxy,
  type EdrForecast,
  type Serie,
} from "../../lib/dmi";
import { ORTO_FORAAR_URL } from "../../lib/maps";
import {
  createSpot,
  listSpots,
  deleteSpot,
  updateSpot,
  getWindType,
  getWindTypeLabel,
  type SpotRow,
  type CoastDirection,
} from "../../lib/spots";

// BRUG trips-helper i stedet for catches
import { getFishCountForSpot } from "../../lib/trips";
import {
  fetchFredningsbaelter,
  findFredningsbaelterAtPoint,
  getPeriodeType,
  getPeriodeColor,
  getPeriodeFillColor,
  getPeriodeLabel,
  isFredningActive,
  type FredningsbaelterGeoJSON,
  type FredningsbaelteFeature,
} from "../../lib/fredningsbaelter";
import { OCEAN_STATIONS_DK } from "../../lib/dmiOcean";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { SpotMarker } from "../../shared/components/SpotMarker";
import { DmiStationMarker } from "../../shared/components/DmiStationMarker";
import { ScrollableGraph } from "../../shared/components/ScrollableGraph";
import { SunMoonAnimation } from "../../shared/components/SunMoonAnimation";
import { CurrentVelocityOverlay } from "../../shared/components/CurrentVelocityOverlay";
import { WaveSwellOverlay } from "../../shared/components/WaveSwellOverlay";
import { SalinityHeatmapOverlay } from "../../shared/components/SalinityHeatmapOverlay";
import { WaterLevelOverlay } from "../../shared/components/WaterLevelOverlay";
import { WindOverlay } from "../../shared/components/WindOverlay";

type LatLng = { latitude: number; longitude: number };

type MapLayerType = "standard" | "orto";

// Storage key for map layer settings
const MAP_SETTINGS_KEY = "spot_weather_map_settings";

const MARKER_BOX_WIDTH = 140;
const MARKER_BOX_HEIGHT = 80;

// --- NERO TEMA ---
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",

  primary: "#FFFFFF",
  primaryText: "#0D0D0F",

  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",

  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  accentBorder: "#F59E0B40",

  inputBg: "#1E1E21",
  border: "#2A2A2E",

  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
  success: "#F59E0B",

  // Graph colors
  graphGreen: "#F59E0B",
  graphBlue: "#3B82F6",
  blue: "#3B82F6",
  cyan: "#40E0D0",
  purple: "#A855F7",

  // Legacy
  graphYellow: "#F59E0B",
};
const BEST_SPOT_COLOR = "#F59E0B";


// --- Kort stilarter (lys på Android for bedre synlighed) ---
// --- Antracit / mørk grå stil (land lyst, vand mørkt) ---
const ANTHRACITE_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9a9a9a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#3a3a3a" }] },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#404040" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#454545" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#4a4a4a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#353535" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#505050" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f0f1a" }],
  },
];

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
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
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
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
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
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
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
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
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

const MAP_STYLE = ANTHRACITE_MAP_STYLE;
const MAP_UI_STYLE = "dark";
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// CartoDB tile styles - swap between dark/light
const CARTO_DARK_URL = "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png";
const CARTO_DARK_LABELS_URL = "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png";
// Light alternatives (uncomment to use):
// const CARTO_LIGHT_URL = "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";
// const CARTO_LIGHT_LABELS_URL = "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png";

const DEFAULT_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 2,
  longitudeDelta: 2,
};

function getWeatherIcon(
  temp: number,
  isNight: boolean
): { name: any; color: string } {
  if (temp > 15) return { name: "sunny", color: THEME.graphYellow };
  if (temp > 5) return { name: "cloudy", color: THEME.textSec };
  if (temp > 0) return { name: "rainy", color: THEME.blue };
  return { name: isNight ? "snow" : "snow", color: THEME.blue };
}

type TranslateFn = (key: any) => string;

function getForecastDays(edrData: EdrForecast | null, t?: TranslateFn) {
  if (!edrData || !edrData.airTempSeries || edrData.airTempSeries.length === 0)
    return [];

  const dayNames = t
    ? [t("sun"), t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat")]
    : ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
  const todayLabel = t ? t("today") : "I dag";

  const days: { label: string; icon: any; temp: number }[] = [];
  const today = new Date();

  for (let i = 0; i < 5; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const middayTs = checkDate.setHours(13, 0, 0, 0);

    const validSeries = edrData.airTempSeries.filter(
      (p) => typeof p.v === "number" && !isNaN(p.v)
    );

    if (validSeries.length === 0) return [];

    const dataPoint = validSeries.reduce(
      (prev, curr) =>
        Math.abs(curr.ts - middayTs) < Math.abs(prev.ts - middayTs)
          ? curr
          : prev,
      validSeries[0]
    );

    const isNight =
      checkDate.getHours() < 6 || checkDate.getHours() > 20;

    days.push({
      label: i === 0 ? todayLabel : dayNames[checkDate.getDay()],
      icon: getWeatherIcon(dataPoint.v, isNight).name,
      temp: dataPoint.v,
    });
  }
  return days;
}

function getSunTimes(lat: number, lon: number) {
  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lon);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return {
    sunrise: fmt(times.sunrise),
    sunset: fmt(times.sunset),
  };
}

export default function SpotWeatherScreen() {
  const mapRef = useRef<MapView | null>(null);
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ createSpotLat?: string; createSpotLng?: string }>();

  const [pos, setPos] = useState<LatLng | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  const [edrData, setEdrData] = useState<EdrForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // søg
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [permissionModalVisible, setPermissionModalVisible] =
    useState(false);
  const [mapLayer, setMapLayer] = useState<MapLayerType>("standard");
  const [showSpots, setShowSpots] = useState(true);
  const isAndroid = Platform.OS === "android";

  const [sunTimes, setSunTimes] = useState<{
    sunrise: string;
    sunset: string;
  } | null>(null);

  // gemte spots
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const forecastCacheRef = useRef<
    Record<string, { data: EdrForecast; ts: number }>
  >({});

  // bedste spot (stjerne)
  const [bestSpotId, setBestSpotId] = useState<string | null>(null);

  // lille action-UI ved valgt lokation (klik på kort / søg / current location)
  const [showLocationActions, setShowLocationActions] = useState(false);

  // tilføj spot-modal
  const [addSpotModalVisible, setAddSpotModalVisible] = useState(false);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotCoastDir, setNewSpotCoastDir] = useState<CoastDirection | null>(null);
  const [addingSpot, setAddingSpot] = useState(false);

  // animation til bottomsheet (Vejr & Hav)
  const sheetAnim = useRef(new Animated.Value(0)).current;

  // Expandable menu animation
  const menuExpandAnim = useRef(new Animated.Value(0)).current;
  const menuContentAnim = useRef(new Animated.Value(0)).current;
  const [activeMenuPanel, setActiveMenuPanel] = useState<"layers" | "weather" | null>(null);

  // SPOT-DETAIL UI
  const [selectedSpot, setSelectedSpot] = useState<SpotRow | null>(null);
  const [spotEdrData, setSpotEdrData] = useState<EdrForecast | null>(null);
  const [spotLoading, setSpotLoading] = useState(false);
  const [spotLoadingSlow, setSpotLoadingSlow] = useState(false);
  const [spotErrorMsg, setSpotErrorMsg] = useState<string | null>(null);
  const [spotFishCount, setSpotFishCount] = useState<number | null>(null);
  const [spotDeleteLoading, setSpotDeleteLoading] = useState(false);
  const [spotDeleteTarget, setSpotDeleteTarget] = useState<SpotRow | null>(
    null
  );
  const [renameTarget, setRenameTarget] = useState<SpotRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameCoastDir, setRenameCoastDir] = useState<CoastDirection | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Fredningsbælter
  const [fredningsbaelter, setFredningsbaelter] = useState<FredningsbaelterGeoJSON | null>(null);
  const [showFredningsbaelter, setShowFredningsbaelter] = useState(false);
  const [selectedZone, setSelectedZone] = useState<FredningsbaelteFeature | null>(null);

  // DMI ocean stations
  const [showDmiStations, setShowDmiStations] = useState(false);

  // Ocean overlay state
  const [showCurrents, setShowCurrents] = useState(false);
  const [showSalinity, setShowSalinity] = useState(false);
  const [showWaves, setShowWaves] = useState(false);
  const [showWaterLevel, setShowWaterLevel] = useState(false);
  const [showWind, setShowWind] = useState(false);

  // Track current map region for passing to overlays
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 55.5,
    longitude: 11.0,
    latitudeDelta: 5,
    longitudeDelta: 5,
  });

  // Track if settings have been loaded from storage
  const [settingsLoaded, setSettingsLoaded] = useState(false);


  // Reset overlays when leaving screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup when screen loses focus - reset to normal map view
        setShowCurrents(false);
        setShowSalinity(false);
        setShowWaves(false);
        setShowWaterLevel(false);
        setShowWind(false);
        setActiveMenuPanel(null);
      };
    }, [])
  );

  // Load saved map settings on mount + warm up DMI proxy
  useEffect(() => {
    // Pre-warm DMI proxy for hurtigere vejr-kald
    warmUpDmiProxy();

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(MAP_SETTINGS_KEY);
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.mapLayer) setMapLayer(settings.mapLayer);
          if (typeof settings.showSpots === "boolean") setShowSpots(settings.showSpots);
          if (typeof settings.showFredningsbaelter === "boolean") setShowFredningsbaelter(settings.showFredningsbaelter);
          if (typeof settings.showDmiStations === "boolean") setShowDmiStations(settings.showDmiStations);
        }
      } catch (e) {
        // Ignore errors loading settings
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  // Handle incoming params to create spot at specific location
  useEffect(() => {
    if (params.createSpotLat && params.createSpotLng) {
      const lat = parseFloat(params.createSpotLat);
      const lng = parseFloat(params.createSpotLng);

      if (!isNaN(lat) && !isNaN(lng)) {
        // Set the position
        setPos({ latitude: lat, longitude: lng });

        // Animate map to location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 500);
        }

        // Open the add spot modal after a short delay
        setTimeout(() => {
          setNewSpotName("");
          setNewSpotCoastDir(null);
          setAddSpotModalVisible(true);
        }, 600);
      }
    }
  }, [params.createSpotLat, params.createSpotLng]);

  // Save map settings when they change
  useEffect(() => {
    if (!settingsLoaded) return; // Don't save until initial load is complete

    (async () => {
      try {
        await AsyncStorage.setItem(
          MAP_SETTINGS_KEY,
          JSON.stringify({
            mapLayer,
            showSpots,
            showFredningsbaelter,
            showDmiStations,
          })
        );
      } catch (e) {
        // Ignore errors saving settings
      }
    })();
  }, [mapLayer, showSpots, showFredningsbaelter, showDmiStations, settingsLoaded]);

  // Hent gemte spots ved mount + prefetch weather i baggrunden
  useEffect(() => {
    (async () => {
      try {
        const rows = await listSpots();
        setSpots(rows);

        // OPTIMIZED: Prefetch weather for user spots in background (fire and forget)
        // This makes spot selection feel faster
        if (rows.length > 0) {
          rows.slice(0, 5).forEach((s) => {
            getSpotForecastEdr(s.lat, s.lng).catch(() => {});
          });
        }
      } catch (e) {
        // console.log("Could not load spots", e);
      }
    })();
  }, []);

  // hent fredningsbælter ved mount
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchFredningsbaelter();
        setFredningsbaelter(data);
      } catch (e) {
        // Ignorer fejl ved load af fredningsbælter
      }
    })();
  }, []);


  // find spot med flest fisk -> stjerne på kortet
  useEffect(() => {
    if (!spots || spots.length === 0) {
      setBestSpotId(null);
      return;
    }
    (async () => {
      try {
        let bestId: string | null = null;
        let bestCount = 0;
        for (const s of spots) {
          const c = await getFishCountForSpot(s.id);
          if (c > bestCount) {
            bestCount = c;
            bestId = s.id;
          }
        }
        setBestSpotId(bestId);
      } catch (e) {
        // console.log("Could not calculate best spot", e);
        setBestSpotId(null);
      }
    })();
  }, [spots]);

  // Track slow loading for free location (> 3 sekunder)
  useEffect(() => {
    if (!loading) {
      setLoadingSlow(false);
      return;
    }
    const timer = setTimeout(() => setLoadingSlow(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Hent vejr når pos + showForecast er sat (fri lokation -> Vejr & Hav)
  // OPTIMIZED: dmi.ts håndterer nu caching internt
  useEffect(() => {
    if (!pos || !showForecast) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const edr = await getSpotForecastEdr(pos.latitude, pos.longitude);

        if (cancelled) return;

        if (edr) {
          setEdrData(edr);
        } else {
          setErrorMsg(t("noWeatherDataAvailable"));
        }
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(t("error"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pos, showForecast]);

  // solopgang/solnedgang for aktiv position (fri lokation)
  useEffect(() => {
    if (!pos) {
      setSunTimes(null);
      return;
    }
    const { sunrise, sunset } = getSunTimes(pos.latitude, pos.longitude);
    setSunTimes({ sunrise, sunset });
  }, [pos]);

  // styr animation på Vejr & Hav-bottomsheet
  useEffect(() => {
    if (showForecast) {
      Animated.timing(sheetAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [showForecast, sheetAnim]);

  // Expandable menu animation - menu expands horizontally, then content fades in
  useEffect(() => {
    if (activeMenuPanel) {
      menuContentAnim.setValue(0);
      Animated.sequence([
        Animated.spring(menuExpandAnim, {
          toValue: 1,
          tension: 100,
          friction: 12,
          useNativeDriver: false,
        }),
        Animated.timing(menuContentAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(menuContentAnim, {
          toValue: 0,
          duration: 80,
          useNativeDriver: false,
        }),
        Animated.spring(menuExpandAnim, {
          toValue: 0,
          tension: 120,
          friction: 14,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [activeMenuPanel, menuExpandAnim, menuContentAnim]);

  // Hent vejr + fiskestatistik for selectedSpot (spot-detail UI)
  // OPTIMIZED: dmi.ts håndterer nu caching internt
  useEffect(() => {
    if (!selectedSpot) {
      setSpotEdrData(null);
      setSpotErrorMsg(null);
      setSpotFishCount(null);
      return;
    }

    const p = { latitude: selectedSpot.lat, longitude: selectedSpot.lng };
    setPos(p);
    mapRef.current?.animateToRegion(
      { ...p, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      500
    );

    let cancelled = false;

    (async () => {
      setSpotLoading(true);
      setSpotErrorMsg(null);

      try {
        const edr = await getSpotForecastEdr(p.latitude, p.longitude);
        if (cancelled) return;

        if (!edr) {
          setSpotErrorMsg(t("noWeatherDataAvailable"));
        } else {
          setSpotEdrData(edr);
        }
      } catch (e) {
        if (cancelled) return;
        setSpotErrorMsg(t("error"));
      } finally {
        if (!cancelled) {
          setSpotLoading(false);
        }
      }
    })();

    (async () => {
      try {
        const count = await getFishCountForSpot(selectedSpot.id);
        if (!cancelled) setSpotFishCount(count);
      } catch (e) {
        if (!cancelled) setSpotFishCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSpot]);

  // Track slow loading for spot (> 3 sekunder)
  useEffect(() => {
    if (!spotLoading) {
      setSpotLoadingSlow(false);
      return;
    }
    const timer = setTimeout(() => setSpotLoadingSlow(true), 3000);
    return () => clearTimeout(timer);
  }, [spotLoading]);

  const handleDeleteSpot = async (spot: SpotRow) => {
    setSpotDeleteLoading(true);
    try {
      await deleteSpot(spot.id);
      setSpots((prev) => prev.filter((s) => s.id !== spot.id));
      if (selectedSpot?.id === spot.id) setSelectedSpot(null);
      setSpotDeleteTarget(null);
    } catch (e: any) {
      // console.log("Could not delete spot:", e);
      Alert.alert(
        t("error"),
        e?.message ?? t("couldNotDeleteSpot")
      );
    } finally {
      setSpotDeleteLoading(false);
    }
  };

  const openRenameModal = (spot: SpotRow) => {
    setRenameTarget(spot);
    setRenameValue(spot.name || "");
    setRenameCoastDir(spot.coastDirection || null);
    setRenameError(null);
  };

  const closeRenameModal = () => {
    if (renameLoading) return;
    setRenameTarget(null);
    setRenameCoastDir(null);
    setRenameError(null);
  };

  const handleDeleteFromRename = () => {
    if (!renameTarget || renameLoading) return;
    setSpotDeleteTarget(renameTarget);
    setRenameTarget(null);
  };

  async function handleRenameSpot() {
    if (!renameTarget) return;
    const newName = renameValue.trim();
    if (!newName) {
      setRenameError(t("nameRequired"));
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    try {
      await updateSpot(renameTarget.id, { name: newName, coastDirection: renameCoastDir });
      setSpots((prev) =>
        prev.map((s) =>
          s.id === renameTarget.id ? { ...s, name: newName, coastDirection: renameCoastDir } : s
        )
      );
      setSelectedSpot((prev) =>
        prev && prev.id === renameTarget.id ? { ...prev, name: newName, coastDirection: renameCoastDir } : prev
      );
      setRenameTarget(null);
      setRenameCoastDir(null);
    } catch (e) {
      // console.log("Could not rename spot", e);
      setRenameError(t("couldNotRenameSpot"));
    } finally {
      setRenameLoading(false);
    }
  }

  async function useCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermissionModalVisible(true);
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const p = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
    setPos(p);
    setShowForecast(false);
    setEdrData(null);
    setErrorMsg(null);
    setShowLocationActions(true);
    setSelectedSpot(null);
    mapRef.current?.animateToRegion(
      { ...p, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      500
    );
  }

  function onMapPress(e: MapPressEvent) {
    // På Android kan marker-tryk komme ind som "marker-press" her – dem ignorerer vi
    // @ts-ignore
    if (e.nativeEvent?.action === "marker-press") return;

    const c = e.nativeEvent.coordinate;

    // Tjek om tappet er inden for et fredningsbælte
    if (showFredningsbaelter && fredningsbaelter) {
      const zones = findFredningsbaelterAtPoint(c.latitude, c.longitude, fredningsbaelter);
      if (zones.length > 0) {
        // Vis det første matchende fredningsbælte
        setSelectedZone(zones[0]);
        return; // Stop her - vis ikke normal map press behavior
      }
    }

    setPos(c);
    setShowForecast(false);
    setEdrData(null);
    setErrorMsg(null);
    setShowLocationActions(true);
    setSelectedSpot(null);
    mapRef.current?.animateToRegion(
      { ...c, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      500
    );
  }

  async function searchLocation() {
    const q = searchText.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const res = await Location.geocodeAsync(q);
      if (res && res.length > 0) {
        const p = {
          latitude: res[0].latitude,
          longitude: res[0].longitude,
        };
        setPos(p);
        setShowForecast(false);
        setEdrData(null);
        setErrorMsg(null);
        setShowLocationActions(true);
        setSelectedSpot(null);
        mapRef.current?.animateToRegion(
          { ...p, latitudeDelta: 0.2, longitudeDelta: 0.2 },
          500
        );
      }
    } catch (e) {
      // console.log(e);
    } finally {
      setSearchLoading(false);
      setSearchOpen(false);
    }
  }

  function clearSelection() {
    setPos(null);
    setEdrData(null);
    setErrorMsg(null);
    setShowForecast(false);
    setShowLocationActions(false);
    setSelectedSpot(null);
    setSpotEdrData(null);
    setSpotErrorMsg(null);
    setSpotFishCount(null);
    mapRef.current?.animateToRegion(DEFAULT_REGION, 500);
  }

  const hasAnyData =
    edrData &&
    (edrData.airTempSeries.length > 0 ||
      edrData.windSpeedSeries.length > 0 ||
      edrData.waterLevelSeries.length > 0 ||
      edrData.waveHeightSeries.length > 0 ||
      edrData.humiditySeries.length > 0 ||
      edrData.pressureSeries.length > 0 ||
      edrData.cloudCoverSeries.length > 0 ||
      (edrData.precipitationSeries && edrData.precipitationSeries.length > 0));

  const forecastDays = getForecastDays(edrData, t);

  // Check if any ocean overlay is active
  const oceanOverlayActive = showCurrents || showSalinity || showWaves || showWaterLevel || showWind;
  // Use blue/anthracite background for orto, dark for standard
  const mapBackground = mapLayer === "orto" ? "#0f1a2e" : "#0a0a12";
  // Dark styles for both map layers
  const currentMapStyle = mapLayer === "orto" ? DARK_MAP_STYLE : MAP_STYLE;
  const currentUiStyle = "dark";
  const hasGoogleMapsKey = Boolean(Constants.expoConfig?.extra?.mapsApiKey);
  const useStandardTileFallback =
    isAndroid && mapLayer === "standard" && !hasGoogleMapsKey;

  // iOS: Use native Apple Maps dark mode for standard, "none" for orto (custom tiles)
  // Android: Use "none" for both (CartoDB/orto tiles)
  const mapType = isAndroid
    ? "none"
    : mapLayer === "standard"
      ? "mutedStandard"
      : "none";

  // iOS: Use Apple Maps (DEFAULT) for standard mode to get native dark mode
  // Android: Use Google Maps if available
  const mapProvider = isAndroid
    ? (hasGoogleMapsKey ? PROVIDER_GOOGLE : PROVIDER_DEFAULT)
    : (mapLayer === "standard" ? PROVIDER_DEFAULT : PROVIDER_DEFAULT);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={"transparent"} />

      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: mapBackground }]}
          initialRegion={DEFAULT_REGION}
          onPress={onMapPress}
          onRegionChangeComplete={setMapRegion}
          userInterfaceStyle={currentUiStyle}
          mapType={mapType}
          provider={mapProvider}
          {...(currentMapStyle ? { customMapStyle: currentMapStyle } : {})}
        >
          {useStandardTileFallback && (
            <UrlTile
              urlTemplate={OSM_TILE_URL}
              maximumZ={19}
              tileSize={256}
              zIndex={0}
            />
          )}
          {mapLayer === "orto" && (
            <UrlTile
              urlTemplate={ORTO_FORAAR_URL}
              maximumZ={21}
              tileSize={256}
              zIndex={0}
            />
          )}

          {/* Dark CartoDB tiles as default base map (standard mode) - Android only */}
          {/* iOS uses native Apple Maps dark mode */}
          {isAndroid && mapLayer !== "orto" && (
            <>
              <UrlTile
                urlTemplate={CARTO_DARK_URL}
                maximumZ={19}
                tileSize={512}
                zIndex={0}
              />
              <UrlTile
                urlTemplate={CARTO_DARK_LABELS_URL}
                maximumZ={19}
                tileSize={512}
                zIndex={10}
                opacity={0.7}
              />
            </>
          )}

          {/* Ocean overlays are now rendered as animated WebView overlays after MapView */}

          {/* Fredningsbælter polygoner */}
          {showFredningsbaelter && fredningsbaelter?.features?.map((feature) => {
            const periodeType = getPeriodeType(feature);
            const strokeColor = getPeriodeColor(periodeType);
            const fillColor = getPeriodeFillColor(periodeType);
            const coords = (feature.geometry.type === "Polygon"
              ? feature.geometry.coordinates[0]
              : feature.geometry.coordinates[0][0]) as number[][]; // MultiPolygon

            // Beregn centroid for markør
            const sumLat = coords.reduce((acc, c) => acc + c[1], 0);
            const sumLng = coords.reduce((acc, c) => acc + c[0], 0);
            const centroid = {
              latitude: sumLat / coords.length,
              longitude: sumLng / coords.length,
            };

            return (
              <React.Fragment key={`zone-${feature.id}`}>
                <Polygon
                  coordinates={coords.map((c) => ({
                    latitude: c[1],
                    longitude: c[0],
                  }))}
                  strokeColor={strokeColor}
                  fillColor={fillColor}
                  strokeWidth={2}
                  tappable={false}
                  zIndex={1}
                />
                {/* Usynlig tap-markør i midten af zonen */}
                <Marker
                  coordinate={centroid}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => setSelectedZone(feature)}
                  tracksViewChanges={false}
                >
                  <View style={{
                    width: 40,
                    height: 40,
                    backgroundColor: "rgba(0,0,0,0.01)",
                  }} />
                </Marker>
              </React.Fragment>
            );
          })}

          {/* DMI OceanObs stationer */}
          {showDmiStations &&
            OCEAN_STATIONS_DK.map((station) => (
              <DmiStationMarker
                key={`dmi-${station.id}`}
                station={station}
                t={t}
              />
            ))}

          {/* Gemte spots som røde cirkel-markører med label-boble.
              Tryk på spot -> åbner spot-detail UI. */}
          {showSpots &&
            spots.map((spot) => {
              const isBestSpot = bestSpotId != null && bestSpotId === spot.id;
              return (
            <SpotMarker
              key={`spot-${spot.id}`}
              spot={spot}
              isBestSpot={isBestSpot}
              t={t}
              onPress={() => {
                setShowLocationActions(false);
                setShowForecast(false);
                setSelectedSpot(spot);
              }}
              onLongPress={() => {
                if (spotDeleteLoading || renameLoading) return;
                openRenameModal(spot);
              }}
            />
          );
        })}
		  



          {/* Aktuel valgt lokation (gul markør) – skjul hvis et gemt spot er valgt */}
          {pos && !selectedSpot && (
            <Marker
              coordinate={pos}
              title={t("selectedPoint")}
              centerOffset={{ x: 0, y: -15 }}
            >
              <View style={styles.pinBody}>
                <View style={styles.pinInner} />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Animated ocean overlays - vises over kortet */}
        {showCurrents && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <CurrentVelocityOverlay
              visible={true}
              onClose={() => setShowCurrents(false)}
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={Math.round(Math.log2(360 / mapRegion.latitudeDelta))}
            />
          </View>
        )}
        {showWaves && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <WaveSwellOverlay
              visible={true}
              onClose={() => setShowWaves(false)}
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={Math.round(Math.log2(360 / mapRegion.latitudeDelta))}
            />
          </View>
        )}
        {showSalinity && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <SalinityHeatmapOverlay
              visible={true}
              onClose={() => setShowSalinity(false)}
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={Math.round(Math.log2(360 / mapRegion.latitudeDelta))}
            />
          </View>
        )}
        {showWaterLevel && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <WaterLevelOverlay
              visible={true}
              onClose={() => setShowWaterLevel(false)}
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={Math.round(Math.log2(360 / mapRegion.latitudeDelta))}
            />
          </View>
        )}
        {showWind && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <WindOverlay
              visible={true}
              onClose={() => setShowWind(false)}
              initialLat={mapRegion.latitude}
              initialLng={mapRegion.longitude}
              initialZoom={Math.round(Math.log2(360 / mapRegion.latitudeDelta))}
            />
          </View>
        )}

        {/* Scale bars and sliders are now built into each animated overlay */}


        {mapLayer === "orto" && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(0,0,0,0.28)" },
            ]}
          />
        )}

        {/* Dismiss overlay when menu is expanded */}
        {activeMenuPanel && (
          <Pressable
            style={styles.menuDismissOverlay}
            onPress={() => setActiveMenuPanel(null)}
          />
        )}

        {/* Expandable Menu - knapper til højre, indhold udvider til venstre */}
        <Animated.View
          style={[
            styles.expandableMenu,
            {
              width: menuExpandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [58, 240],
              }),
            },
          ]}
        >
          {/* Expanded content area (left side) */}
          <Animated.View
            style={[
              styles.menuExpandedContent,
              {
                opacity: menuContentAnim,
                width: menuExpandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 182],
                }),
              },
            ]}
            pointerEvents={activeMenuPanel ? "auto" : "none"}
          >
            {activeMenuPanel === "layers" && (
              <View style={styles.menuPanelContent}>
                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => setShowSpots((v) => !v)}
                >
                  <View style={[styles.menuOptionIcon, showSpots && styles.menuOptionIconActive]}>
                    <Ionicons name="location" size={14} color={showSpots ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Spots" : "Spots"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => setShowFredningsbaelter((v) => !v)}
                >
                  <View style={[styles.menuOptionIcon, showFredningsbaelter && { backgroundColor: "#EF4444" }]}>
                    <Ionicons name="warning" size={14} color={showFredningsbaelter ? "#FFF" : "#EF4444"} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Fredning" : "Zones"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => setShowDmiStations((v) => !v)}
                >
                  <View style={[styles.menuOptionIcon, showDmiStations && { backgroundColor: "#3B82F6" }]}>
                    <Ionicons name="analytics" size={14} color={showDmiStations ? "#FFF" : "#3B82F6"} />
                  </View>
                  <Text style={styles.menuOptionLabel}>DMI</Text>
                </Pressable>
              </View>
            )}

            {activeMenuPanel === "weather" && (
              <View style={styles.menuPanelContent}>
                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => {
                    setShowCurrents(false);
                    setShowSalinity(false);
                    setShowWaves(false);
                    setShowWaterLevel(false);
                    setShowWind(!showWind);
                  }}
                >
                  <View style={[styles.menuOptionIcon, showWind && styles.menuOptionIconActive]}>
                    <Ionicons name="flag" size={14} color={showWind ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Vind" : "Wind"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => {
                    setShowSalinity(false);
                    setShowWaves(false);
                    setShowWaterLevel(false);
                    setShowWind(false);
                    setShowCurrents(!showCurrents);
                  }}
                >
                  <View style={[styles.menuOptionIcon, showCurrents && styles.menuOptionIconActive]}>
                    <Ionicons name="navigate" size={14} color={showCurrents ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Strøm" : "Current"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => {
                    setShowCurrents(false);
                    setShowSalinity(false);
                    setShowWaterLevel(false);
                    setShowWind(false);
                    setShowWaves(!showWaves);
                  }}
                >
                  <View style={[styles.menuOptionIcon, showWaves && styles.menuOptionIconActive]}>
                    <Ionicons name="water" size={14} color={showWaves ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Bølger" : "Waves"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => {
                    setShowCurrents(false);
                    setShowWaves(false);
                    setShowWaterLevel(false);
                    setShowWind(false);
                    setShowSalinity(!showSalinity);
                  }}
                >
                  <View style={[styles.menuOptionIcon, showSalinity && styles.menuOptionIconActive]}>
                    <Ionicons name="flask" size={14} color={showSalinity ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Salt" : "Salinity"}</Text>
                </Pressable>

                <Pressable
                  style={styles.menuOptionRow}
                  onPress={() => {
                    setShowCurrents(false);
                    setShowSalinity(false);
                    setShowWaves(false);
                    setShowWind(false);
                    setShowWaterLevel(!showWaterLevel);
                  }}
                >
                  <View style={[styles.menuOptionIcon, showWaterLevel && styles.menuOptionIconActive]}>
                    <Ionicons name="trending-up" size={14} color={showWaterLevel ? "#000" : THEME.graphYellow} />
                  </View>
                  <Text style={styles.menuOptionLabel}>{language === "da" ? "Vand" : "Level"}</Text>
                </Pressable>

                {(showWind || showCurrents || showWaves || showSalinity || showWaterLevel) && (
                  <Pressable
                    style={styles.menuOptionRow}
                    onPress={() => {
                      setShowCurrents(false);
                      setShowSalinity(false);
                      setShowWaves(false);
                      setShowWaterLevel(false);
                      setShowWind(false);
                    }}
                  >
                    <View style={styles.menuOptionIconOff}>
                      <Ionicons name="eye-off" size={14} color="#666" />
                    </View>
                    <Text style={[styles.menuOptionLabel, { color: THEME.textTertiary }]}>
                      {language === "da" ? "Sluk" : "Off"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>

          {/* Button bar (right side) - always visible */}
          <View style={styles.menuButtonBar}>
            <Pressable
              style={styles.menuIconBtn}
              onPress={() => setSearchOpen(true)}
            >
              <Ionicons name="search" size={20} color={THEME.graphYellow} />
            </Pressable>

            <Pressable style={styles.menuIconBtn} onPress={useCurrentLocation}>
              <Ionicons name="locate" size={20} color={THEME.graphYellow} />
            </Pressable>

            <Pressable
              style={[styles.menuIconBtn, activeMenuPanel === "layers" && styles.menuIconBtnActive]}
              onPress={() => setActiveMenuPanel(activeMenuPanel === "layers" ? null : "layers")}
            >
              <Ionicons name="layers" size={20} color={activeMenuPanel === "layers" ? "#000" : THEME.graphYellow} />
            </Pressable>

            <Pressable
              style={[
                styles.menuIconBtn,
                (activeMenuPanel === "weather" || showWind || showCurrents || showWaves || showSalinity || showWaterLevel) && styles.menuIconBtnActive,
              ]}
              onPress={() => setActiveMenuPanel(activeMenuPanel === "weather" ? null : "weather")}
            >
              <Ionicons
                name="partly-sunny"
                size={20}
                color={(activeMenuPanel === "weather" || showWind || showCurrents || showWaves || showSalinity || showWaterLevel) ? "#000" : THEME.graphYellow}
              />
            </Pressable>

            {(pos || selectedSpot) && (
              <Pressable style={styles.menuIconBtn} onPress={clearSelection}>
                <Ionicons name="close" size={20} color={THEME.graphYellow} />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Floating Map Type Selector - Bottom Left (hidden when ocean overlay is active) */}
        {!oceanOverlayActive && (
          <View style={styles.mapTypeSelectorContainer}>
            <Pressable
              style={[styles.mapTypeCard, mapLayer === "standard" && styles.mapTypeCardActive]}
              onPress={() => setMapLayer("standard")}
            >
              <View style={[styles.mapTypeIconWrap, mapLayer === "standard" && styles.mapTypeIconWrapActive]}>
                <Ionicons name="map" size={18} color={mapLayer === "standard" ? "#000" : THEME.graphYellow} />
              </View>
              <Text style={[styles.mapTypeLabel, mapLayer === "standard" && styles.mapTypeLabelActive]}>
                {language === "da" ? "Kort" : "Map"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.mapTypeCard, mapLayer === "orto" && styles.mapTypeCardActive]}
              onPress={() => setMapLayer("orto")}
            >
              <View style={[styles.mapTypeIconWrap, mapLayer === "orto" && styles.mapTypeIconWrapActive]}>
                <Ionicons name="earth" size={18} color={mapLayer === "orto" ? "#000" : THEME.graphYellow} />
              </View>
              <Text style={[styles.mapTypeLabel, mapLayer === "orto" && styles.mapTypeLabelActive]}>
                {language === "da" ? "Satellit" : "Satellite"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Lille UI når en lokation er valgt på kortet (ikke spot) */}
        {pos && showLocationActions && !selectedSpot && (
          <View style={styles.locationCard}>
            <View style={styles.locationCardHeader}>
              <View style={styles.locationCardIcon}>
                <Ionicons name="location" size={18} color={THEME.graphYellow} />
              </View>
              <View style={styles.locationCardInfo}>
                <Text style={styles.locationCardTitle}>{t("selectedLocation")}</Text>
                <Text style={styles.locationCardCoords}>
                  {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                </Text>
              </View>
            </View>

            <View style={styles.locationCardBtns}>
              <Pressable
                style={styles.locationPrimaryBtn}
                onPress={() => {
                  setShowLocationActions(false);
                  setShowForecast(true);
                }}
              >
                <Ionicons name="cloud" size={16} color={THEME.graphYellow} />
                <Text style={styles.locationPrimaryBtnText}>{t("getWeather")}</Text>
              </Pressable>

              <Pressable
                style={styles.locationSecondaryBtn}
                onPress={() => {
                  if (!pos) return;
                  setNewSpotName("");
                  setAddSpotModalVisible(true);
                }}
              >
                <Ionicons name="bookmark-outline" size={16} color={THEME.graphYellow} />
                <Text style={styles.locationSecondaryBtnText}>{t("saveSpot")}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Vejr & Hav-bottomsheet (til fri lokation) */}
        {showForecast && (
          <Animated.View
            style={[
              styles.weatherSheet,
              {
                opacity: sheetAnim,
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Handle & close */}
            <View style={styles.weatherSheetHeader}>
              <View style={styles.weatherSheetHandle} />
              <Pressable
                onPress={() => {
                  setShowForecast(false);
                  setEdrData(null);
                  setErrorMsg(null);
                }}
                style={styles.weatherSheetCloseBtn}
              >
                <Ionicons name="close" size={20} color={THEME.textSec} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Title row */}
              <View style={styles.weatherTitleRow}>
                <View style={styles.weatherTitleIcon}>
                  <Ionicons name="cloud" size={20} color={THEME.graphYellow} />
                </View>
                <Text style={styles.weatherTitle}>{t("weatherAndSea")}</Text>
              </View>

              {/* Animated Sun/Moon visualization */}
              {sunTimes && (
                <SunMoonAnimation
                  sunrise={sunTimes.sunrise}
                  sunset={sunTimes.sunset}
                />
              )}

              {/* Day forecast */}
              {forecastDays.length > 0 && (
                <View style={styles.dayForecastRow}>
                  {forecastDays.map((day, index) => (
                    <View key={index} style={styles.dayForecastItem}>
                      <Text style={styles.dayForecastLabel}>{day.label}</Text>
                      <View style={styles.dayForecastIconWrap}>
                        <Ionicons name={day.icon} size={22} color={THEME.text} />
                      </View>
                      <Text style={styles.dayForecastTemp}>{day.temp.toFixed(0)}°</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Loading state */}
              {loading && (
                <View style={styles.weatherLoadingRow}>
                  <ActivityIndicator color={THEME.graphYellow} />
                  <Text style={styles.weatherLoadingText}>{t("loadingForecasts")}</Text>
                </View>
              )}

              {/* Error state */}
              {!loading && errorMsg && (
                <View style={styles.weatherErrorBox}>
                  <Ionicons name="alert-circle" size={18} color={THEME.danger} />
                  <Text style={styles.weatherErrorText}>{errorMsg}</Text>
                </View>
              )}

              {!loading && edrData && !hasAnyData && (
                <View style={styles.weatherEmptyBox}>
                  <Ionicons name="cloud-offline" size={24} color={THEME.textSec} />
                  <Text style={styles.weatherEmptyText}>{t("noDataAvailable")}</Text>
                </View>
              )}

              {edrData && !loading && (
                <View style={{ marginTop: 8 }}>
                  {edrData.airTempSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.airTempSeries}
                      label={t("airTemperature")}
                      unit="°C"
                      color={THEME.graphYellow}
                    />
                  )}
                  {edrData.windSpeedSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.windSpeedSeries}
                      dirSeries={edrData.windDirSeries}
                      label={`${t("windSpeed")} & ${t("windDir")}`}
                      unit="m/s"
                      color={THEME.textSec}
                    />
                  )}
                  {edrData.humiditySeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.humiditySeries}
                      label={t("humidity")}
                      unit="%"
                      color={THEME.cyan}
                    />
                  )}
                  {edrData.pressureSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.pressureSeries}
                      label={t("pressure")}
                      unit="hPa"
                      color={THEME.purple}
                    />
                  )}
                  {edrData.cloudCoverSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.cloudCoverSeries}
                      label={t("cloudCover")}
                      unit="%"
                      color={THEME.textSec}
                      showWeatherIcons={true}
                      iconType="cloud"
                    />
                  )}
                  {edrData.precipitationSeries && edrData.precipitationSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.precipitationSeries}
                      label={t("precipitation")}
                      unit="mm/h"
                      color="#60A5FA"
                      showAsBars={true}
                      pixelsPerPoint={35}
                      showWeatherIcons={true}
                      iconType="rain"
                    />
                  )}
                  {edrData.waveHeightSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.waveHeightSeries}
                      label={t("waveHeight")}
                      unit="m"
                      color={THEME.blue}
                    />
                  )}
                  {edrData.waterLevelSeries.length > 0 && (
                    <ScrollableGraph
                      series={edrData.waterLevelSeries}
                      label={t("waterLevel")}
                      unit="cm"
                      color={THEME.blue}
                      zeroLineAt={0}
                    />
                  )}
                  {edrData.oceanFallbackStation && (
                    <Text style={styles.oceanFallbackNote}>
                      {language === "da"
                        ? `Hav-data fra ${edrData.oceanFallbackStation}`
                        : `Ocean data from ${edrData.oceanFallbackStation}`}
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {/* Fuldskærms søge-overlay */}
      <Modal
        transparent
        visible={searchOpen}
        animationType="fade"
        onRequestClose={() => setSearchOpen(false)}
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            {/* Header */}
            <View style={styles.popupHeader}>
              <View style={styles.popupTitleRow}>
                <View style={styles.popupIconCircle}>
                  <Ionicons name="search" size={20} color={THEME.graphYellow} />
                </View>
                <Text style={styles.popupTitle}>{t("searchPlace")}</Text>
              </View>
              <Pressable
                style={styles.popupCloseBtn}
                onPress={() => setSearchOpen(false)}
              >
                <Ionicons name="close" size={20} color={THEME.textSec} />
              </Pressable>
            </View>

            {/* Input */}
            <View style={styles.popupInputWrapper}>
              <Ionicons name="location-outline" size={18} color={THEME.textSec} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.popupInput}
                placeholder={t("searchPlaceholder")}
                placeholderTextColor={THEME.textSec}
                value={searchText}
                onChangeText={setSearchText}
                onSubmitEditing={searchLocation}
              />
            </View>

            {/* Button */}
            <Pressable
              style={styles.popupPrimaryBtn}
              onPress={searchLocation}
              disabled={searchLoading}
            >
              {searchLoading ? (
                <ActivityIndicator color={THEME.graphYellow} />
              ) : (
                <>
                  <Ionicons name="search" size={18} color={THEME.graphYellow} />
                  <Text style={styles.popupPrimaryBtnText}>{t("search")}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Tilføj spot-modal */}
      {addSpotModalVisible && pos && (
        <Modal
          transparent
          visible={addSpotModalVisible}
          animationType="fade"
          onRequestClose={() => setAddSpotModalVisible(false)}
        >
          <View style={styles.popupBackdrop}>
            <View style={styles.popupCard}>
              {/* Header */}
              <View style={styles.popupHeader}>
                <View style={styles.popupTitleRow}>
                  <View style={[styles.popupIconCircle, { backgroundColor: THEME.graphYellow }]}>
                    <Ionicons name="add" size={20} color="#000" />
                  </View>
                  <Text style={styles.popupTitle}>{t("addSpot")}</Text>
                </View>
                <Pressable
                  style={styles.popupCloseBtn}
                  onPress={() => setAddSpotModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={THEME.textSec} />
                </Pressable>
              </View>

              {/* Coordinates badge */}
              <View style={styles.coordBadge}>
                <Ionicons name="navigate" size={14} color={THEME.graphYellow} />
                <Text style={styles.coordBadgeText}>
                  {pos.latitude.toFixed(4)}, {pos.longitude.toFixed(4)}
                </Text>
              </View>

              {/* Input */}
              <View style={styles.popupInputWrapper}>
                <Ionicons name="bookmark-outline" size={18} color={THEME.textSec} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.popupInput}
                  placeholder={t("spotName")}
                  placeholderTextColor={THEME.textSec}
                  value={newSpotName}
                  onChangeText={setNewSpotName}
                />
              </View>

              {/* Coast Direction Selector */}
              <View style={styles.coastDirSection}>
                <View style={styles.coastDirHeader}>
                  <Ionicons name="compass-outline" size={16} color={THEME.graphYellow} />
                  <Text style={styles.coastDirTitle}>{language === "da" ? "Kystretning" : "Coast Direction"}</Text>
                </View>
                <Text style={styles.coastDirDesc}>
                  {language === "da" ? "Hvilken retning vender vandet?" : "Which direction does the water face?"}
                </Text>
                <View style={styles.coastDirGrid}>
                  {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map((dir) => (
                    <Pressable
                      key={dir}
                      style={[styles.coastDirBtn, newSpotCoastDir === dir && styles.coastDirBtnActive]}
                      onPress={() => setNewSpotCoastDir(newSpotCoastDir === dir ? null : dir)}
                    >
                      <Text style={[styles.coastDirBtnText, newSpotCoastDir === dir && styles.coastDirBtnTextActive]}>
                        {dir}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.popupBtnRow}>
                <Pressable
                  style={styles.popupSecondaryBtn}
                  onPress={() => {
                    setAddSpotModalVisible(false);
                    setNewSpotCoastDir(null);
                  }}
                >
                  <Text style={styles.popupSecondaryBtnText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.popupPrimaryBtn, { flex: 1 }]}
                  onPress={async () => {
                    if (!pos || addingSpot) return;
                    try {
                      setAddingSpot(true);
                      const created = await createSpot({
                        name: newSpotName.trim() || t("spot"),
                        lat: pos.latitude,
                        lng: pos.longitude,
                        coastDirection: newSpotCoastDir,
                      });
                      setSpots((prev) => [created, ...prev]);
                      setAddSpotModalVisible(false);
                      setShowLocationActions(false);
                      setNewSpotCoastDir(null);
                    } catch (e) {
                      // console.log("Could not create spot", e);
                    } finally {
                      setAddingSpot(false);
                    }
                  }}
                >
                  {addingSpot ? (
                    <ActivityIndicator color={THEME.graphYellow} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color={THEME.graphYellow} />
                      <Text style={styles.popupPrimaryBtnText}>{t("saveSpot")}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Permission-modal */}
      {permissionModalVisible && (
        <Modal
          transparent
          visible={permissionModalVisible}
          animationType="fade"
          onRequestClose={() => setPermissionModalVisible(false)}
        >
          <View style={styles.popupBackdrop}>
            <View style={styles.popupCard}>
              {/* Header */}
              <View style={styles.popupHeader}>
                <View style={styles.popupTitleRow}>
                  <View style={[styles.popupIconCircle, { backgroundColor: THEME.blue }]}>
                    <Ionicons name="location" size={20} color="#fff" />
                  </View>
                  <Text style={styles.popupTitle}>{t("locationRequired")}</Text>
                </View>
              </View>

              <Text style={styles.popupDescription}>
                {t("locationPermissionDesc")}
              </Text>

              <Pressable
                style={styles.popupPrimaryBtn}
                onPress={() => setPermissionModalVisible(false)}
              >
                <Ionicons name="checkmark" size={18} color={THEME.graphYellow} />
                <Text style={styles.popupPrimaryBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* SPOT-DETAIL UI (spot-navn + Antal fisk + spot-vejr) */}
      {selectedSpot && (
        <Modal
          transparent
          visible={!!selectedSpot}
          animationType="slide"
          onRequestClose={() => setSelectedSpot(null)}
        >
          <View style={styles.spotSheetBackdrop}>
            <View style={styles.spotSheet}>
              {/* Handle */}
              <View style={styles.spotSheetHandle} />

              {/* Header */}
              <View style={styles.spotSheetHeader}>
                <View style={styles.spotSheetTitleArea}>
                  {bestSpotId != null && selectedSpot.id === bestSpotId && (
                    <View style={styles.bestSpotBadge}>
                      <Ionicons name="star" size={12} color="#000" />
                      <Text style={styles.bestSpotBadgeText}>{t("bestSpot")}</Text>
                    </View>
                  )}
                  <Text style={styles.spotSheetTitle} numberOfLines={2}>
                    {selectedSpot.name}
                  </Text>
                </View>
                <View style={styles.spotSheetActions}>
                  <Pressable
                    style={styles.spotEditBtn}
                    onPress={() => {
                      if (renameLoading || spotDeleteLoading) return;
                      const spotToEdit = selectedSpot;
                      setSelectedSpot(null);
                      setTimeout(() => openRenameModal(spotToEdit), 100);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#000" />
                  </Pressable>
                  <Pressable
                    style={styles.spotCloseBtn}
                    onPress={() => setSelectedSpot(null)}
                  >
                    <Ionicons name="close" size={20} color={THEME.textSec} />
                  </Pressable>
                </View>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Stats */}
                <View style={styles.spotStatsGrid}>
                  <View style={styles.spotStatCard}>
                    <View style={styles.spotStatIconWrap}>
                      <Ionicons name="fish" size={18} color={THEME.graphYellow} />
                    </View>
                    <View>
                      <Text style={styles.spotStatValue}>{spotFishCount ?? 0}</Text>
                      <Text style={styles.spotStatLabel}>{t("catches")}</Text>
                    </View>
                  </View>
                  <View style={styles.spotStatCard}>
                    <View style={[styles.spotStatIconWrap, { backgroundColor: "rgba(94, 158, 255, 0.15)" }]}>
                      <Ionicons name="navigate" size={18} color={THEME.blue} />
                    </View>
                    <View>
                      <Text style={styles.spotStatValue}>{selectedSpot.lat.toFixed(2)}°</Text>
                      <Text style={styles.spotStatLabel}>{t("location")}</Text>
                    </View>
                  </View>
                </View>

                {spotLoading && (
                  <View style={styles.spotLoadingRow}>
                    <ActivityIndicator color={THEME.graphYellow} />
                    <Text style={styles.spotLoadingText}>{t("loadingWeather")}</Text>
                  </View>
                )}

                {!spotLoading && spotErrorMsg && (
                  <View style={styles.spotErrorBox}>
                    <Ionicons name="alert-circle" size={18} color={THEME.danger} />
                    <Text style={styles.spotErrorText}>{spotErrorMsg}</Text>
                  </View>
                )}

                {!spotLoading && spotEdrData && (
                  <>
                    {getForecastDays(spotEdrData, t).length > 0 && (
                      <View style={styles.spotDayForecast}>
                        {getForecastDays(spotEdrData, t).map((day, index) => (
                          <View key={index} style={styles.spotDayItem}>
                            <Text style={styles.spotDayLabel}>{day.label}</Text>
                            <View style={styles.spotDayIconWrap}>
                              <Ionicons name={day.icon} size={22} color={THEME.text} />
                            </View>
                            <Text style={styles.spotDayTemp}>{day.temp.toFixed(0)}°</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {spotEdrData.airTempSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.airTempSeries}
                        label={t("airTemperature")}
                        unit="°C"
                        color={THEME.graphYellow}
                      />
                    )}
                    {spotEdrData.windSpeedSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.windSpeedSeries}
                        dirSeries={spotEdrData.windDirSeries}
                        label={`${t("windSpeed")} & ${t("windDir")}`}
                        unit="m/s"
                        color={THEME.textSec}
                      />
                    )}
                    {spotEdrData.humiditySeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.humiditySeries}
                        label={t("humidity")}
                        unit="%"
                        color={THEME.cyan}
                      />
                    )}
                    {spotEdrData.pressureSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.pressureSeries}
                        label={t("pressure")}
                        unit="hPa"
                        color={THEME.purple}
                      />
                    )}
                    {spotEdrData.cloudCoverSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.cloudCoverSeries}
                        label={t("cloudCover")}
                        unit="%"
                        color={THEME.textSec}
                        showWeatherIcons={true}
                        iconType="cloud"
                      />
                    )}
                    {spotEdrData.precipitationSeries && spotEdrData.precipitationSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.precipitationSeries}
                        label={t("precipitation")}
                        unit="mm/h"
                        color="#60A5FA"
                        showAsBars={true}
                        pixelsPerPoint={35}
                        showWeatherIcons={true}
                        iconType="rain"
                      />
                    )}
                    {spotEdrData.waveHeightSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.waveHeightSeries}
                        label={t("waveHeight")}
                        unit="m"
                        color={THEME.blue}
                        pixelsPerPoint={40}
                        minWidth={2400}
                        showTimeRange
                        dateTickEvery={6}
                      />
                    )}
                    {spotEdrData.waterLevelSeries.length > 0 && (
                      <ScrollableGraph
                        series={spotEdrData.waterLevelSeries}
                        label={t("waterLevel")}
                        unit="cm"
                        color={THEME.blue}
                        zeroLineAt={0}
                        pixelsPerPoint={40}
                        minWidth={2400}
                        showTimeRange
                        dateTickEvery={6}
                      />
                    )}
                    {spotEdrData.oceanFallbackStation && (
                      <Text style={styles.oceanFallbackNote}>
                        {language === "da"
                          ? `Hav-data fra ${spotEdrData.oceanFallbackStation}`
                          : `Ocean data from ${spotEdrData.oceanFallbackStation}`}
                      </Text>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
      {/* Redigér spot-navn */}
      <Modal
        transparent
        visible={!!renameTarget}
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            {/* Header */}
            <View style={styles.popupHeader}>
              <View style={styles.popupTitleRow}>
                <View style={[styles.popupIconCircle, { backgroundColor: THEME.blue }]}>
                  <Ionicons name="create" size={20} color="#fff" />
                </View>
                <Text style={styles.popupTitle}>{t("editSpot")}</Text>
              </View>
              <Pressable
                style={styles.popupCloseBtn}
                onPress={closeRenameModal}
                disabled={renameLoading}
              >
                <Ionicons name="close" size={20} color={THEME.textSec} />
              </Pressable>
            </View>

            <Text style={styles.popupDescription}>
              {t("renameSpotDesc")}
            </Text>

            {/* Input */}
            <View style={styles.popupInputWrapper}>
              <Ionicons name="bookmark-outline" size={18} color={THEME.textSec} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.popupInput}
                placeholder={t("spotName")}
                placeholderTextColor={THEME.textSec}
                value={renameValue}
                onChangeText={setRenameValue}
                editable={!renameLoading}
              />
            </View>

            {/* Coast Direction Selector */}
            <View style={styles.coastDirSection}>
              <View style={styles.coastDirHeader}>
                <Ionicons name="compass-outline" size={16} color={THEME.graphYellow} />
                <Text style={styles.coastDirTitle}>{language === "da" ? "Kystretning" : "Coast Direction"}</Text>
              </View>
              <Text style={styles.coastDirDesc}>
                {language === "da" ? "Hvilken retning vender vandet?" : "Which direction does the water face?"}
              </Text>
              <View style={styles.coastDirGrid}>
                {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map((dir) => (
                  <Pressable
                    key={dir}
                    style={[styles.coastDirBtn, renameCoastDir === dir && styles.coastDirBtnActive]}
                    onPress={() => setRenameCoastDir(renameCoastDir === dir ? null : dir)}
                    disabled={renameLoading}
                  >
                    <Text style={[styles.coastDirBtnText, renameCoastDir === dir && styles.coastDirBtnTextActive]}>
                      {dir}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {renameError && (
              <View style={styles.popupErrorBox}>
                <Ionicons name="alert-circle" size={16} color={THEME.danger} />
                <Text style={styles.popupErrorText}>{renameError}</Text>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.popupBtnRow}>
              <Pressable
                style={styles.popupSecondaryBtn}
                onPress={closeRenameModal}
                disabled={renameLoading}
              >
                <Text style={styles.popupSecondaryBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.popupPrimaryBtn, { flex: 1 }]}
                onPress={handleRenameSpot}
                disabled={renameLoading}
              >
                {renameLoading ? (
                  <ActivityIndicator color={THEME.graphYellow} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={THEME.graphYellow} />
                    <Text style={styles.popupPrimaryBtnText}>{t("saveName")}</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Delete button */}
            <Pressable
              style={styles.popupDangerBtn}
              onPress={handleDeleteFromRename}
              disabled={renameLoading}
            >
              <Ionicons name="trash-outline" size={18} color={THEME.danger} />
              <Text style={styles.popupDangerBtnText}>{t("deleteSpot")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Slet spot UI (custom modal) */}
      <Modal
        transparent
        visible={!!spotDeleteTarget}
        animationType="fade"
        onRequestClose={() => {
          if (spotDeleteLoading) return;
          setSpotDeleteTarget(null);
        }}
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            {/* Header */}
            <View style={styles.popupHeader}>
              <View style={styles.popupTitleRow}>
                <View style={[styles.popupIconCircle, { backgroundColor: THEME.danger }]}>
                  <Ionicons name="trash" size={20} color="#fff" />
                </View>
                <Text style={styles.popupTitle}>{t("deleteSpot")}</Text>
              </View>
            </View>

            <View style={styles.deleteSpotInfo}>
              <Text style={styles.deleteSpotName}>{spotDeleteTarget?.name ?? t("spot")}</Text>
              <Text style={styles.deleteSpotDesc}>
                {t("deleteSpotConfirmation")}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.popupBtnRow}>
              <Pressable
                style={styles.popupSecondaryBtn}
                onPress={() => {
                  if (spotDeleteLoading) return;
                  setSpotDeleteTarget(null);
                }}
                disabled={spotDeleteLoading}
              >
                <Text style={styles.popupSecondaryBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                style={styles.deleteConfirmBtn}
                onPress={() => {
                  if (!spotDeleteTarget || spotDeleteLoading) return;
                  handleDeleteSpot(spotDeleteTarget);
                }}
                disabled={spotDeleteLoading}
              >
                {spotDeleteLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={styles.deleteConfirmBtnText}>{t("deleteSpot")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fredningsbælte details modal */}
      <Modal
        transparent
        visible={selectedZone !== null}
        animationType="fade"
        onRequestClose={() => setSelectedZone(null)}
      >
        <Pressable
          style={styles.popupBackdrop}
          onPress={() => setSelectedZone(null)}
        >
          <View
            style={[styles.popupCard, { maxHeight: "85%" }]}
            onStartShouldSetResponder={() => true}
          >
            {selectedZone && (
              <>
                {/* Header med status */}
                <View style={styles.zoneHeader}>
                  <View style={styles.zoneHeaderLeft}>
                    <View style={[styles.zoneHeaderIcon, { backgroundColor: getPeriodeColor(getPeriodeType(selectedZone)) }]}>
                      <Ionicons name="shield" size={18} color="#FFF" />
                    </View>
                    <View style={styles.zoneHeaderText}>
                      <Text style={styles.zoneHeaderTitle} numberOfLines={1}>
                        {selectedZone.properties.NAVN || "Fredningsbælte"}
                      </Text>
                      <View style={styles.zoneHeaderStatus}>
                        <View style={[
                          styles.zoneStatusDot,
                          { backgroundColor: isFredningActive(selectedZone) ? "#EF4444" : "#22C55E" }
                        ]} />
                        <Text style={[
                          styles.zoneHeaderStatusText,
                          { color: isFredningActive(selectedZone) ? "#EF4444" : "#22C55E" }
                        ]}>
                          {isFredningActive(selectedZone)
                            ? (language === "da" ? "Aktiv" : "Active")
                            : (language === "da" ? "Inaktiv" : "Inactive")}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable style={styles.popupCloseBtn} onPress={() => setSelectedZone(null)}>
                    <Ionicons name="close" size={20} color={THEME.textSec} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
                  {/* Kompakt info-grid */}
                  <View style={styles.zoneInfoGrid}>
                    {/* Periode */}
                    <View style={styles.zoneInfoItem}>
                      <Ionicons name="calendar-outline" size={16} color={THEME.textSec} />
                      <Text style={styles.zoneInfoLabel}>{language === "da" ? "Periode" : "Period"}</Text>
                      <Text style={styles.zoneInfoValue}>
                        {selectedZone.properties.FREDNINGSP || getPeriodeLabel(getPeriodeType(selectedZone), language)}
                      </Text>
                    </View>

                    {/* Lovgrundlag */}
                    {selectedZone.properties.LOVGRUNDLA && (
                      <View style={styles.zoneInfoItem}>
                        <Ionicons name="document-text-outline" size={16} color={THEME.textSec} />
                        <Text style={styles.zoneInfoLabel}>{language === "da" ? "Lovgrundlag" : "Legal basis"}</Text>
                        <Text style={styles.zoneInfoValue} numberOfLines={2}>{selectedZone.properties.LOVGRUNDLA}</Text>
                      </View>
                    )}

                    {/* Baglimit */}
                    {selectedZone.properties.Baglimit !== null && selectedZone.properties.Baglimit !== undefined && (
                      <View style={styles.zoneInfoItem}>
                        <Ionicons name="fish-outline" size={16} color={THEME.textSec} />
                        <Text style={styles.zoneInfoLabel}>{language === "da" ? "Dagskvoter" : "Daily limit"}</Text>
                        <Text style={styles.zoneInfoValue}>{selectedZone.properties.Baglimit} stk.</Text>
                      </View>
                    )}

                    {/* Redskab */}
                    {selectedZone.properties.Redskab && (
                      <View style={styles.zoneInfoItem}>
                        <Ionicons name="construct-outline" size={16} color={THEME.textSec} />
                        <Text style={styles.zoneInfoLabel}>{language === "da" ? "Redskaber" : "Gear"}</Text>
                        <Text style={styles.zoneInfoValue} numberOfLines={2}>{selectedZone.properties.Redskab}</Text>
                      </View>
                    )}
                  </View>

                  {/* Beskrivelse/Bemærkninger */}
                  {(selectedZone.properties.Beskrivels || selectedZone.properties.BEMARKNING) && (
                    <View style={styles.zoneDescBox}>
                      <Text style={styles.zoneDescText}>
                        {selectedZone.properties.Beskrivels || selectedZone.properties.BEMARKNING}
                      </Text>
                    </View>
                  )}

                  {/* Links sektion */}
                  <View style={styles.zoneLinkSection}>
                    {/* Specifik bekendtgørelse hvis tilgængelig */}
                    {selectedZone.properties.WWW && (
                      <Pressable
                        style={styles.zonePrimaryLink}
                        onPress={() => ExpoLinking.openURL(selectedZone.properties.WWW!)}
                      >
                        <Ionicons name="document-text" size={18} color="#FFF" />
                        <Text style={styles.zonePrimaryLinkText}>
                          {language === "da" ? "Se bekendtgørelse" : "View regulation"}
                        </Text>
                        <Ionicons name="open-outline" size={16} color="#FFF" />
                      </Pressable>
                    )}

                    {/* Generelt link til Fiskeristyrelsen */}
                    <Pressable
                      style={styles.zoneSecondaryLink}
                      onPress={() => ExpoLinking.openURL("https://fiskeristyrelsen.dk/lyst-og-fritidsfiskeri/fredningsbaelter")}
                    >
                      <Ionicons name="globe-outline" size={16} color="#3B82F6" />
                      <Text style={styles.zoneSecondaryLinkText}>
                        {language === "da" ? "Fiskeristyrelsen.dk" : "Danish Fisheries Agency"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Vandløbsnummer (lille tekst i bunden) */}
                  {selectedZone.properties.VANDLOBSNR && (
                    <Text style={styles.zoneFooterText}>
                      {language === "da" ? "Vandløbsnr." : "Watercourse no."}: {selectedZone.properties.VANDLOBSNR}
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

    </>
  );
}

function SpotDeleteConfirm({
  visible,
  onCancel,
  onConfirm,
  spotName,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  spotName: string | undefined | null;
}) {
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },

  // Expandable Menu - glass pill that expands horizontally
  expandableMenu: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "rgba(12, 12, 14, 0.85)",
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
    overflow: "hidden",
  },
  menuButtonBar: {
    width: 58,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 9,
  },
  menuIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconBtnActive: {
    backgroundColor: THEME.accent,
  },
  menuExpandedContent: {
    overflow: "hidden",
    paddingVertical: 8,
    paddingLeft: 12,
    justifyContent: "center",
  },
  menuPanelContent: {
    gap: 2,
  },
  menuOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  menuOptionIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuOptionIconActive: {
    backgroundColor: THEME.accent,
  },
  menuOptionIconOff: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuOptionLabel: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "500",
  },
  menuDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },

  // Legacy - keep for backwards compatibility
  topButtonsRow: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 12,
    flexDirection: "column",
    gap: 6,
    backgroundColor: "rgba(12, 12, 14, 0.75)",
    borderRadius: 28,
    padding: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    backgroundColor: THEME.accent,
  },

  // Floating Map Type Selector - Glass pill
  mapTypeSelectorContainer: {
    position: "absolute",
    bottom: 24,
    left: 12,
    flexDirection: "row",
    gap: 0,
    backgroundColor: "rgba(12, 12, 14, 0.75)",
    borderRadius: 26,
    padding: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  mapTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    gap: 10,
  },
  mapTypeCardActive: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  mapTypeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapTypeIconWrapActive: {
    backgroundColor: THEME.accent,
  },
  mapTypeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.text,
    letterSpacing: 0.2,
  },
  mapTypeLabelActive: {
    color: THEME.text,
    fontWeight: "700",
  },

  // Floating Ocean Overlay Card - Premium compact design
  oceanOverlayDismiss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  oceanOverlayCard: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 12,
    backgroundColor: "rgba(12, 12, 14, 0.92)",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
    transformOrigin: "top right",
  },
  oceanOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  oceanOverlayTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  oceanOverlayCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  oceanOverlayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 20,
    marginVertical: 2,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  oceanOverlayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  oceanOverlayIconActive: {
    backgroundColor: THEME.accent,
  },
  oceanOverlayIconOff: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  oceanOverlayLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: THEME.text,
  },
  oceanOverlayLabelOff: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  oceanFallbackNote: {
    fontSize: 11,
    color: THEME.textTertiary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
    fontStyle: "italic",
  },

  // Pin marker
  pinBody: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  pinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFF",
  },

  // Hint card - Modern glassmorphism
  hintCard: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: "5%",
    backgroundColor: "rgba(15, 15, 20, 0.9)",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  hintIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    flex: 1,
    color: THEME.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },

  // Location action card - Modern glassmorphism
  locationCard: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: "5%",
    backgroundColor: "rgba(15, 15, 20, 0.92)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  locationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  locationCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  locationCardInfo: {
    flex: 1,
  },
  locationCardTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
  },
  locationCardCoords: {
    color: THEME.textSec,
    fontSize: 12,
    marginTop: 2,
  },
  locationCardBtns: {
    flexDirection: "row",
    gap: 10,
  },
  locationPrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.accent,
    height: 56,
    borderRadius: 16,
  },
  locationPrimaryBtnText: {
    color: THEME.primaryText,
    fontSize: 15,
    fontWeight: "600",
  },
  locationSecondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.elevated,
    height: 56,
    borderRadius: 16,
  },
  locationSecondaryBtnText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "600",
  },

  // Weather bottom sheet - NERO Style
  weatherSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: THEME.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: THEME.cardBorder,
    paddingTop: 12,
    maxHeight: "80%",
  },
  weatherSheetHeader: {
    alignItems: "center",
    paddingBottom: 12,
  },
  weatherSheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: THEME.border,
    borderRadius: 3,
  },
  weatherSheetCloseBtn: {
    position: "absolute",
    right: 16,
    top: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.elevated,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  weatherTitleIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: THEME.text,
    letterSpacing: 0.3,
  },
  sunTimesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  sunTimeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  sunTimeLabel: {
    color: THEME.textTertiary,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  sunTimeValue: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  sunriseIconWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    backgroundColor: "rgba(255, 165, 0, 0.15)",
    borderRadius: 12,
  },
  sunriseArrow: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  sunsetIconWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    backgroundColor: "rgba(255, 99, 71, 0.15)",
    borderRadius: 12,
  },
  sunsetArrow: {
    position: "absolute",
    bottom: 2,
    right: 2,
  },
  horizonLine: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    height: 2,
    backgroundColor: "#FFA500",
    borderRadius: 1,
  },
  dayForecastRow: {
    flexDirection: "row",
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  dayForecastItem: {
    flex: 1,
    alignItems: "center",
  },
  dayForecastLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dayForecastIconWrap: {
    marginBottom: 6,
    width: 36,
    height: 36,
    backgroundColor: THEME.elevated,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayForecastTemp: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  weatherLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
    backgroundColor: THEME.card,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  weatherLoadingText: {
    color: THEME.textSec,
    fontSize: 14,
    fontWeight: "500",
  },
  weatherErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: THEME.dangerMuted,
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  weatherErrorText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  weatherEmptyBox: {
    alignItems: "center",
    gap: 12,
    padding: 32,
    marginTop: 8,
    backgroundColor: THEME.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  weatherEmptyText: {
    color: THEME.textSec,
    fontSize: 14,
  },

  // Popup/Modal styles (shared) - Glass pill design
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    padding: 24,
  },
  popupCard: {
    backgroundColor: "rgba(12, 12, 14, 0.8)",
    borderRadius: 32,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.8,
    shadowRadius: 48,
    elevation: 24,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  popupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  popupIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  popupTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: THEME.text,
    letterSpacing: 0.3,
  },
  popupCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  popupDescription: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  popupSection: {
    gap: 10,
    marginBottom: 20,
  },
  popupInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  popupInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 16,
    paddingVertical: 16,
  },
  popupBtnRow: {
    flexDirection: "row",
    gap: 12,
  },
  popupPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.accent,
    height: 56,
    borderRadius: 16,
  },
  popupPrimaryBtnText: {
    color: THEME.primaryText,
    fontSize: 16,
    fontWeight: "600",
  },
  popupSecondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  popupSecondaryBtnText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 16,
    fontWeight: "600",
  },

  // Coast Direction Selector
  coastDirSection: {
    marginBottom: 18,
  },
  coastDirHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  coastDirTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.text,
  },
  coastDirDesc: {
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 12,
  },
  coastDirGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  coastDirBtn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  coastDirBtnActive: {
    backgroundColor: THEME.accentMuted,
    borderColor: THEME.accentBorder,
    borderWidth: 1.5,
  },
  coastDirBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSec,
  },
  coastDirBtnTextActive: {
    color: THEME.text,
  },

  popupDangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 12,
  },
  popupDangerBtnText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  popupErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  popupErrorText: {
    color: THEME.danger,
    fontSize: 13,
  },
  popupToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.elevated,
    padding: 16,
    borderRadius: 16,
  },
  popupToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  popupToggleLabel: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "500",
  },

  // Layer option cards - Modern glassmorphism
  layerOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  layerOptionCardActive: {
    borderColor: THEME.accent,
    borderWidth: 2,
    backgroundColor: THEME.accentMuted,
  },
  layerOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  layerOptionLabel: {
    color: THEME.textSec,
    fontSize: 16,
    fontWeight: "500",
  },
  layerOptionLabelActive: {
    color: THEME.accent,
    fontWeight: "600",
  },

  // Toggle - Nero style
  toggleTrack: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.elevated,
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackActive: {
    backgroundColor: THEME.accentMuted,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.textTertiary,
  },
  toggleThumbActive: {
    backgroundColor: THEME.accent,
    marginLeft: "auto",
  },

  // Overlay section - Nero style
  overlaysSectionTitle: {
    color: THEME.accent,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 12,
    marginLeft: 4,
  },
  overlaysSection: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    overflow: "hidden",
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.1)",
  },
  overlayRowActive: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  overlayRowChecked: {
    backgroundColor: THEME.accentMuted,
  },
  overlayRowText: {
    flex: 1,
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "500",
  },
  overlayRowTextActive: {
    color: THEME.text,
    fontWeight: "600",
  },

  // Coord badge
  coordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: THEME.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  coordBadgeText: {
    color: THEME.accent,
    fontSize: 12,
    fontWeight: "600",
  },

  // Delete spot
  deleteSpotInfo: {
    backgroundColor: THEME.elevated,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  deleteSpotName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  deleteSpotDesc: {
    color: THEME.textSec,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.danger,
    height: 56,
    borderRadius: 16,
  },
  deleteConfirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // Spot sheet - NERO Style
  spotSheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  spotSheet: {
    backgroundColor: THEME.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: THEME.cardBorder,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  spotSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: THEME.border,
    marginBottom: 16,
  },
  spotSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  spotSheetTitleArea: {
    flex: 1,
    marginRight: 12,
  },
  spotSheetTitle: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  spotSheetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spotEditBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  spotCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: THEME.elevated,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bestSpotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: THEME.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 10,
  },
  bestSpotBadgeText: {
    color: THEME.primaryText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  spotStatsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  spotStatCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotStatIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  spotStatValue: {
    color: THEME.text,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  spotStatLabel: {
    color: THEME.textTertiary,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
    marginTop: 2,
  },
  spotLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
    backgroundColor: THEME.card,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotLoadingText: {
    color: THEME.textSec,
    fontSize: 14,
    fontWeight: "500",
  },
  spotErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: THEME.dangerMuted,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  spotErrorText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  spotDayForecast: {
    flexDirection: "row",
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  spotDayItem: {
    flex: 1,
    alignItems: "center",
  },
  spotDayLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  spotDayIconWrap: {
    marginBottom: 6,
    width: 36,
    height: 36,
    backgroundColor: THEME.elevated,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  spotDayTemp: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  // Graph styles
  graphContainer: { marginTop: 20, marginBottom: 10 },
  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    color: THEME.textSec,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  graphVal: { fontWeight: "700", fontSize: 16 },
  scrollWrapper: { height: 140, position: "relative" },
  yAxisOverlay: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    width: 30,
    zIndex: 10,
    pointerEvents: "none",
  },
  axisLabel: {
    color: THEME.textSec,
    fontSize: 10,
    position: "absolute",
    backgroundColor: "rgba(30,30,30,0.7)",
    paddingHorizontal: 2,
  },
  timeRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginTop: 6,
  },
  timeRangeText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "600",
  },

  // Legacy styles (for compatibility)
  body: { color: THEME.textSec, fontSize: 14 },
  dayOverview: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    marginBottom: 10,
  },
  dayItem: { alignItems: "center", flex: 1, paddingHorizontal: 5 },
  dayLabel: {
    color: THEME.textSec,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  dayTemp: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },

  // Ocean overlay styles
  scaleBarsContainer: {
    position: "absolute",
    left: 12,
    top: 100,
    flexDirection: "column",
    gap: 8,
  },
  scaleBarItem: {
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    minWidth: 50,
  },
  scaleTitle: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 4,
  },
  scaleGradient: {
    width: 16,
    height: 80,
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "column",
  },
  scaleSegment: {
    flex: 1,
  },
  scaleLabels: {
    flexDirection: "column",
    justifyContent: "space-between",
    height: 80,
    position: "absolute",
    right: -22,
    top: 22,
  },
  scaleLabelText: {
    color: "#fff",
    fontSize: 9,
  },
  scaleUnit: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    marginTop: 4,
  },
  oceanLoadingIndicator: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  oceanLoadingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },

  // Fredningsbælte zone detail styles - kompakt design
  zoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  zoneHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  zoneHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneHeaderText: {
    flex: 1,
  },
  zoneHeaderTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
  },
  zoneHeaderStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  zoneHeaderStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  zoneStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneInfoGrid: {
    backgroundColor: THEME.inputBg,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  zoneInfoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  zoneInfoLabel: {
    color: THEME.textSec,
    fontSize: 12,
    fontWeight: "500",
    width: 70,
  },
  zoneInfoValue: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  zoneDescBox: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: THEME.graphYellow,
  },
  zoneDescText: {
    color: THEME.text,
    fontSize: 13,
    lineHeight: 19,
  },
  zoneLinkSection: {
    marginTop: 16,
    gap: 10,
  },
  zonePrimaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 12,
  },
  zonePrimaryLinkText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  zoneSecondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  zoneSecondaryLinkText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "500",
  },
  zoneFooterText: {
    color: THEME.textSec,
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
});




