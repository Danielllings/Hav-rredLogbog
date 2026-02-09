// app/(tabs)/spot-weather.tsx
// SpotWeather med DMI EDR, vandstand/bølger og 0-cm reference-linje på vandstandsgrafen

import React, { useEffect, useState, useRef } from "react";
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
import Constants from "expo-constants";
import MapView, {
  Marker,
  MapPressEvent,
  UrlTile,
  Callout,
  Region,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
} from "react-native-maps";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
  G,
} from "react-native-svg";
import SunCalc from "suncalc";

import {
  getSpotForecastEdr,
  type EdrForecast,
  type Serie,
} from "../../lib/dmi";
import { ORTO_FORAAR_URL } from "../../lib/maps";
import {
  createSpot,
  listSpots,
  deleteSpot,
  updateSpot,
  type SpotRow,
} from "../../lib/spots";

// BRUG trips-helper i stedet for catches
import { getFishCountForSpot } from "../../lib/trips";
import { useLanguage } from "../../lib/i18n";

type LatLng = { latitude: number; longitude: number };

type MapLayerType = "standard" | "orto";

const MARKER_BOX_WIDTH = 140;
const MARKER_BOX_HEIGHT = 80;

const THEME = {
  bg: "#121212",
  card: "#1E1E1E",
  primary: "#FFFFFF",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  inputBg: "#2C2C2E",
  border: "#333333",
  graphYellow: "#F59E0B",
  danger: "#FF453A",
  success: "#22C55E",
  blue: "#5E9EFF",
  cyan: "#40E0D0",
  purple: "#C084FC",
};
const BEST_SPOT_COLOR = "#F4D03F";


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

const MAP_STYLE = LIGHT_MAP_STYLE;
const MAP_UI_STYLE = "light";
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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

type TranslateFn = (key: string) => string;

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
  const { t } = useLanguage();

  const [pos, setPos] = useState<LatLng | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  const [edrData, setEdrData] = useState<EdrForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // søg
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [permissionModalVisible, setPermissionModalVisible] =
    useState(false);
  const [mapLayer, setMapLayer] = useState<MapLayerType>("standard");
  const [layerModalVisible, setLayerModalVisible] = useState(false);
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
  const [bestSpotId, setBestSpotId] = useState<number | null>(null);

  // lille action-UI ved valgt lokation (klik på kort / søg / current location)
  const [showLocationActions, setShowLocationActions] = useState(false);

  // tilføj spot-modal
  const [addSpotModalVisible, setAddSpotModalVisible] = useState(false);
  const [newSpotName, setNewSpotName] = useState("");
  const [addingSpot, setAddingSpot] = useState(false);

  // animation til bottomsheet (Vejr & Hav)
  const sheetAnim = useRef(new Animated.Value(0)).current;

  // SPOT-DETAIL UI
  const [selectedSpot, setSelectedSpot] = useState<SpotRow | null>(null);
  const [spotEdrData, setSpotEdrData] = useState<EdrForecast | null>(null);
  const [spotLoading, setSpotLoading] = useState(false);
  const [spotErrorMsg, setSpotErrorMsg] = useState<string | null>(null);
  const [spotFishCount, setSpotFishCount] = useState<number | null>(null);
  const [spotDeleteLoading, setSpotDeleteLoading] = useState(false);
  const [spotDeleteTarget, setSpotDeleteTarget] = useState<SpotRow | null>(
    null
  );
  const [renameTarget, setRenameTarget] = useState<SpotRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // hent gemte spots ved mount
  useEffect(() => {
    (async () => {
      try {
        const rows = await listSpots();
        setSpots(rows);
      } catch (e) {
        console.log("Could not load spots", e);
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
        let bestId: number | null = null;
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
        console.log("Could not calculate best spot", e);
        setBestSpotId(null);
      }
    })();
  }, [spots]);

  // hent vejr når pos + showForecast er sat (fri lokation -> Vejr & Hav)
  useEffect(() => {
    if (!pos || !showForecast) return;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      setEdrData(null);

      try {
        const edr = await getSpotForecastEdr(pos.latitude, pos.longitude);

        if (edr) {
          console.log("Modtog EDR data:", {
            air: edr.airTempSeries.length,
            ocean: edr.waterLevelSeries.length,
            waves: edr.waveHeightSeries.length,
          });
          setEdrData(edr);
        } else {
          setErrorMsg(t("noWeatherDataAvailable"));
        }
      } catch (e) {
        console.log("Error:", e);
        setErrorMsg(t("error"));
      } finally {
        setLoading(false);
      }
    })();
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

  // hent vejr + fiskestatistik for selectedSpot (spot-detail UI)
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

    (async () => {
      setSpotLoading(true);
      setSpotErrorMsg(null);
      setSpotEdrData(null);
      try {
        const edr = await getSpotForecastEdr(p.latitude, p.longitude);
        if (!edr) {
          setSpotErrorMsg(t("noWeatherDataAvailable"));
        } else {
          setSpotEdrData(edr);
        }
      } catch (e) {
        console.log("Error spot-EDR:", e);
        setSpotErrorMsg(t("error"));
      } finally {
        setSpotLoading(false);
      }
    })();

    (async () => {
      try {
        const count = await getFishCountForSpot(selectedSpot.id);
        setSpotFishCount(count);
      } catch (e) {
        console.log("Could not fetch fish count for spot", e);
        setSpotFishCount(0);
      }
    })();
  }, [selectedSpot]);

  const handleDeleteSpot = async (spot: SpotRow) => {
    setSpotDeleteLoading(true);
    try {
      await deleteSpot(spot.id);
      setSpots((prev) => prev.filter((s) => s.id !== spot.id));
      if (selectedSpot?.id === spot.id) setSelectedSpot(null);
      setSpotDeleteTarget(null);
    } catch (e: any) {
      console.log("Could not delete spot:", e);
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
    setRenameError(null);
  };

  const closeRenameModal = () => {
    if (renameLoading) return;
    setRenameTarget(null);
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
      await updateSpot(renameTarget.id, { name: newName });
      setSpots((prev) =>
        prev.map((s) =>
          s.id === renameTarget.id ? { ...s, name: newName } : s
        )
      );
      setSelectedSpot((prev) =>
        prev && prev.id === renameTarget.id ? { ...prev, name: newName } : prev
      );
      setRenameTarget(null);
    } catch (e) {
      console.log("Could not rename spot", e);
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
      console.log(e);
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
      edrData.cloudCoverSeries.length > 0);

  const forecastDays = getForecastDays(edrData, t);

  const mapBackground = mapLayer === "orto" ? "#0b0b0f" : THEME.bg;
  const currentMapStyle = isAndroid
    ? mapLayer === "orto"
      ? DARK_MAP_STYLE
      : MAP_STYLE
    : undefined;
  const currentUiStyle = mapLayer === "orto" ? "dark" : MAP_UI_STYLE;
  const hasGoogleMapsKey =
    !isAndroid ? true : Boolean(Constants.expoConfig?.extra?.mapsApiKey);
  const useStandardTileFallback =
    isAndroid && mapLayer === "standard" && !hasGoogleMapsKey;
  const mapType =
    isAndroid && (mapLayer === "orto" || useStandardTileFallback)
      ? "none"
      : "standard";
  const mapProvider = isAndroid
    ? hasGoogleMapsKey
      ? PROVIDER_GOOGLE
      : PROVIDER_DEFAULT
    : undefined;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={"transparent"} />

      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: mapBackground }]}
          initialRegion={DEFAULT_REGION}
          onPress={onMapPress}
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

          {/* Gemte spots som røde cirkel-markører med label-boble.
              Tryk på spot -> åbner spot-detail UI. */}
          {showSpots &&
            spots.map((spot) => {
              const isBestSpot = bestSpotId != null && bestSpotId === spot.id;
              return (
            <SpotMarker
              key={`${spot.id}-${isBestSpot ? "best" : "norm"}`}
              spot={spot}
              isBestSpot={isBestSpot}
              useNativeMarker={hasGoogleMapsKey}
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

        {mapLayer === "orto" && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(0,0,0,0.28)" },
            ]}
          />
        )}

        {/* Topknapper: søg, lokation, lag, X (nu lodret) */}
        <View style={styles.topButtonsRow}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setSearchOpen(true)}
          >
            <Ionicons name="search" size={20} color="#000" />
          </Pressable>

          <Pressable style={styles.iconBtn} onPress={useCurrentLocation}>
            <Ionicons name="locate" size={20} color="#000" />
          </Pressable>

          <Pressable
            style={styles.iconBtn}
            onPress={() => setLayerModalVisible(true)}
          >
            <Ionicons name="layers" size={20} color="#000" />
          </Pressable>

          {(pos || selectedSpot) && (
            <Pressable style={styles.iconBtn} onPress={clearSelection}>
              <Ionicons name="close" size={20} color="#000" />
            </Pressable>
          )}
        </View>

        {/* Infoboks i bunden når der ikke er åben prognose / lokations-UI / spot-detail */}
        {!showForecast && !showLocationActions && !selectedSpot && (
          <View style={styles.hintCard}>
            <View style={styles.hintIconWrap}>
              <Ionicons name="information-circle" size={20} color={THEME.graphYellow} />
            </View>
            <Text style={styles.hintText}>
              Tryk på kortet for at vælge en lokation og se vejr & hav data.
            </Text>
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
                <Ionicons name="cloud" size={16} color="#000" />
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
                <Ionicons name="bookmark-outline" size={16} color={THEME.text} />
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

            <View style={{ paddingHorizontal: 20 }}>
              {/* Title row */}
              <View style={styles.weatherTitleRow}>
                <View style={styles.weatherTitleIcon}>
                  <Ionicons name="cloud" size={20} color={THEME.graphYellow} />
                </View>
                <Text style={styles.weatherTitle}>{t("weatherAndSea")}</Text>
              </View>

              {/* Sun times */}
              {sunTimes && (
                <View style={styles.sunTimesRow}>
                  <View style={styles.sunTimeCard}>
                    <View style={styles.sunriseIconWrap}>
                      <Ionicons name="sunny" size={20} color="#FFA500" />
                      <View style={styles.sunriseArrow}>
                        <Ionicons name="arrow-up" size={10} color="#FFA500" />
                      </View>
                      <View style={styles.horizonLine} />
                    </View>
                    <View>
                      <Text style={styles.sunTimeLabel}>{t("sunrise")}</Text>
                      <Text style={styles.sunTimeValue}>{sunTimes.sunrise}</Text>
                    </View>
                  </View>
                  <View style={styles.sunTimeCard}>
                    <View style={styles.sunsetIconWrap}>
                      <Ionicons name="sunny" size={20} color="#FF6347" />
                      <View style={styles.sunsetArrow}>
                        <Ionicons name="arrow-down" size={10} color="#FF6347" />
                      </View>
                      <View style={[styles.horizonLine, { backgroundColor: "#FF6347" }]} />
                    </View>
                    <View>
                      <Text style={styles.sunTimeLabel}>{t("sunset")}</Text>
                      <Text style={styles.sunTimeValue}>{sunTimes.sunset}</Text>
                    </View>
                  </View>
                </View>
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
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {edrData && !loading && (
                <View style={{ marginTop: 10 }}>
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
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {/* Layer-modal */}
      <Modal
        transparent
        visible={layerModalVisible}
        animationType="fade"
        onRequestClose={() => setLayerModalVisible(false)}
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            {/* Header */}
            <View style={styles.popupHeader}>
              <View style={styles.popupTitleRow}>
                <View style={styles.popupIconCircle}>
                  <Ionicons name="layers" size={20} color="#000" />
                </View>
                <Text style={styles.popupTitle}>{t("mapLayer")}</Text>
              </View>
              <Pressable
                style={styles.popupCloseBtn}
                onPress={() => setLayerModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={THEME.textSec} />
              </Pressable>
            </View>

            {/* Options */}
            <View style={styles.popupSection}>
              <Pressable
                style={[
                  styles.layerOptionCard,
                  mapLayer === "standard" && styles.layerOptionCardActive,
                ]}
                onPress={() => {
                  setMapLayer("standard");
                  setLayerModalVisible(false);
                }}
              >
                <View style={styles.layerOptionLeft}>
                  <Ionicons name="map-outline" size={20} color={mapLayer === "standard" ? THEME.graphYellow : THEME.textSec} />
                  <Text style={[styles.layerOptionLabel, mapLayer === "standard" && styles.layerOptionLabelActive]}>{t("standardMap")}</Text>
                </View>
                {mapLayer === "standard" && (
                  <Ionicons name="checkmark-circle" size={22} color={THEME.graphYellow} />
                )}
              </Pressable>

              <Pressable
                style={[
                  styles.layerOptionCard,
                  mapLayer === "orto" && styles.layerOptionCardActive,
                ]}
                onPress={() => {
                  setMapLayer("orto");
                  setLayerModalVisible(false);
                }}
              >
                <View style={styles.layerOptionLeft}>
                  <Ionicons name="earth" size={20} color={mapLayer === "orto" ? THEME.graphYellow : THEME.textSec} />
                  <Text style={[styles.layerOptionLabel, mapLayer === "orto" && styles.layerOptionLabelActive]}>{t("orthoMap")}</Text>
                </View>
                {mapLayer === "orto" && (
                  <Ionicons name="checkmark-circle" size={22} color={THEME.graphYellow} />
                )}
              </Pressable>
            </View>

            {/* Toggle */}
            <View style={styles.popupToggleRow}>
              <View style={styles.popupToggleLeft}>
                <Ionicons name="location" size={18} color={THEME.textSec} />
                <Text style={styles.popupToggleLabel}>{t("showYourSpots")}</Text>
              </View>
              <Pressable
                style={[
                  styles.toggleTrack,
                  showSpots && styles.toggleTrackActive,
                ]}
                onPress={() => setShowSpots((v) => !v)}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    showSpots && styles.toggleThumbActive,
                  ]}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  <Ionicons name="search" size={20} color="#000" />
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
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color="#000" />
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
                  <View style={[styles.popupIconCircle, { backgroundColor: THEME.success }]}>
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

              {/* Buttons */}
              <View style={styles.popupBtnRow}>
                <Pressable
                  style={styles.popupSecondaryBtn}
                  onPress={() => setAddSpotModalVisible(false)}
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
                      });
                      setSpots((prev) => [created, ...prev]);
                      setAddSpotModalVisible(false);
                      setShowLocationActions(false);
                    } catch (e) {
                      console.log("Could not create spot", e);
                    } finally {
                      setAddingSpot(false);
                    }
                  }}
                >
                  {addingSpot ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#000" />
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
                <Ionicons name="checkmark" size={18} color="#000" />
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
                  {isAndroid && (
                    <Pressable
                      style={styles.spotEditBtn}
                      onPress={() => {
                        if (renameLoading || spotDeleteLoading) return;
                        setRenameTarget(selectedSpot);
                        setRenameValue(selectedSpot.name || "");
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color="#000" />
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.spotCloseBtn}
                    onPress={() => setSelectedSpot(null)}
                  >
                    <Ionicons name="close" size={20} color={THEME.textSec} />
                  </Pressable>
                </View>
              </View>

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

                  <ScrollView
                    style={{ marginTop: 10 }}
                    contentContainerStyle={{ paddingBottom: 24 }}
                  >
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
                  </ScrollView>
                </>
              )}
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
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#000" />
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
    </>
  );
}

function SpotMarker({
  spot,
  isBestSpot,
  onPress,
  onLongPress,
  useNativeMarker = true,
  t,
}: {
  spot: SpotRow;
  isBestSpot: boolean;
  onPress: () => void;
  onLongPress: () => void;
  useNativeMarker?: boolean;
  t: TranslateFn;
}) {
  const isAndroid = Platform.OS === "android";
  const defaultPin = "#FF3B30"; // Android default-rød
  const color = isBestSpot ? BEST_SPOT_COLOR : defaultPin;

  // Android: brug native marker når Google-provider er tilgængelig.
  // Ellers fallback til custom marker med eksplicit onLongPress-håndtering.
  if (isAndroid && useNativeMarker) {
    return (
      <Marker
        coordinate={{ latitude: spot.lat, longitude: spot.lng }}
        pinColor={isBestSpot ? BEST_SPOT_COLOR : defaultPin}
        title={spot.name}
        description={t("spot")}
        onPress={onPress}
        onCalloutPress={onLongPress} // klik på callout = samme som langtryk
        onLongPress={onLongPress}
        onCalloutLongPress={onLongPress}
        tracksViewChanges={false}
        zIndex={isBestSpot ? 2 : 1}
      >
        <Callout
          tooltip={false}
          onPress={onLongPress}
          onLongPress={onLongPress}
        >
          <View style={{ padding: 8, maxWidth: 200 }}>
            <Text style={{ fontWeight: "700", marginBottom: 4 }}>
              {spot.name}
            </Text>
            <Text style={{ color: "#666", fontSize: 12 }}>
              {t("tapToClose")}
            </Text>
          </View>
        </Callout>
      </Marker>
    );
  }

  if (isAndroid && !useNativeMarker) {
    return (
      <Marker
        coordinate={{ latitude: spot.lat, longitude: spot.lng }}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
        zIndex={isBestSpot ? 2 : 1}
      >
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
            paddingVertical: 4,
          }}
        >
          <Ionicons
            name="location-sharp"
            size={34}
            color={isBestSpot ? BEST_SPOT_COLOR : defaultPin}
            style={{ textShadowColor: "#000", textShadowRadius: 2 }}
          />
          <Text
            style={{
              color: "#fff",
              fontSize: 11,
              fontWeight: "700",
              backgroundColor: "rgba(0,0,0,0.65)",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              marginTop: -6,
            }}
            numberOfLines={1}
          >
            {spot.name}
          </Text>
        </Pressable>
      </Marker>
    );
  }

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      anchor={{ x: 0.5, y: 1 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      tracksViewChanges={false}
      onPress={onPress}
      identifier={String(spot.id)}
      flat
      zIndex={isBestSpot ? 2 : 1}
    >
      <Pressable
        style={({ pressed }) => [
          {
            width: 120,
            minHeight: 60,
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 4,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        collapsable={false}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={600}
        hitSlop={12}
      >
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: "#111",
            borderWidth: 1,
            borderColor: "#222",
            flexDirection: "row",
            alignItems: "center",
            maxWidth: 140,
            marginBottom: 6,
          }}
        >
          {isBestSpot && (
            <Ionicons
              name="star"
              size={12}
              color={BEST_SPOT_COLOR}
              style={{ marginRight: 4 }}
            />
          )}
          <Text
            style={{
              color: THEME.text,
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {spot.name}
          </Text>
        </View>

        <View style={{ position: "relative", alignItems: "center" }}>
          <View
            style={{
              position: "absolute",
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: isBestSpot ? "#c29d00" : "#b71c1c",
              top: 8,
            }}
          />
          <Ionicons
            name="location-sharp"
            size={34}
            color={isBestSpot ? BEST_SPOT_COLOR : "#e53935"}
            style={{ textShadowColor: "#000", textShadowRadius: 2 }}
          />
        </View>
      </Pressable>
    </Marker>
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

function ScrollableGraph({
  series,
  dirSeries,
  label,
  unit,
  color,
  zeroLineAt,
  pixelsPerPoint = 40,
  minWidth = 350,
  showTimeRange = false,
  dateTickEvery = 6, // vis dato på hver N'te tick (udover time:minute)
}: {
  series: Serie[];
  dirSeries?: Serie[];
  label: string;
  unit: string;
  color: string;
  zeroLineAt?: number;
  pixelsPerPoint?: number;
  minWidth?: number;
  showTimeRange?: boolean;
  dateTickEvery?: number;
}) {
  const arrowAnim = useRef(new Animated.Value(0)).current;

  const parseTs = (val: any): number | null => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      if (num > 1e12) return num; // ms
      if (num > 1e9) return num * 1000; // sek -> ms
    }
    const parsed = Date.parse(String(val));
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  };

  const validSeries: Serie[] = Array.isArray(series)
    ? series
        .filter((d) => typeof d.v === "number" && !isNaN(d.v))
        .map((d, i) => {
          const ts = parseTs(d.ts);
          return ts != null ? { ...d, ts } : null;
        })
        .filter((d): d is Serie => d !== null)
        .sort((a, b) => a.ts - b.ts)
    : [];

  const hasData = validSeries.length > 0;
  const displaySeries = hasData ? validSeries : [];

  const values = displaySeries.map((d) => d.v);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;

  const graphMin =
    typeof zeroLineAt === "number" ? Math.min(rawMin, zeroLineAt) : rawMin;
  const graphMax =
    typeof zeroLineAt === "number" ? Math.max(rawMax, zeroLineAt) : rawMax;

  const graphSpan = graphMax - graphMin || 1;

  const GRAPH_HEIGHT = 100;
  const TOP_PAD = 20;
  const graphWidth = Math.max(displaySeries.length * pixelsPerPoint, minWidth);
  const startTime = hasData ? Math.min(...displaySeries.map((d) => d.ts)) : 0;
  const endTime = hasData ? Math.max(...displaySeries.map((d) => d.ts)) : 0;
  const timeSpan = Math.max(endTime - startTime, 1);
  const xForTs = (ts: number) => {
    const rel = (ts - startTime) / timeSpan;
    const clamped = Math.min(1, Math.max(0, rel));
    return clamped * graphWidth;
  };
  const nowTs = Date.now();
  const nowX =
    hasData && nowTs >= startTime && nowTs <= endTime ? xForTs(nowTs) : null;

  const makePath = () => {
    const points = displaySeries.map((d) => {
      const x = xForTs(d.ts);
      const y =
        TOP_PAD +
        GRAPH_HEIGHT -
        ((d.v - graphMin) / graphSpan) * GRAPH_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return "M" + points.join(" L");
  };

  const path = makePath();
  const area = `${path} L ${graphWidth},${
    TOP_PAD + GRAPH_HEIGHT
  } L 0,${TOP_PAD + GRAPH_HEIGHT} Z`;

  const ticks: {
    x: number;
    label: string;
    label2?: string;
    showArrow: boolean;
    rotation: number;
  }[] = [];

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  displaySeries.forEach((pt, idx) => {
    const x = xForTs(pt.ts);
    const date = new Date(pt.ts);
    const hhmm = `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const label2 =
      idx % dateTickEvery === 0
        ? `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`
        : undefined;

    let rotation = 0;
    let showArrow = false;
    if (dirSeries && dirSeries.length > 0) {
      const match = dirSeries.find(
        (d) => Math.abs(d.ts - pt.ts) < 1800000
      );
      if (match) {
        rotation = match.v;
        showArrow = true;
      }
    }
    ticks.push({ x, label: hhmm, label2, showArrow, rotation });
  });

  const gradId = `grad-${label.replace(/[^a-zA-Z0-9]/g, "")}`;
  const arrowPath = "M -4 -4 L 0 4 L 4 -4 L 0 -2 Z";
  const valueAtNow = (() => {
    if (!hasData || nowX == null) return null;
    let best = displaySeries[0];
    let bestDiff = Math.abs(best.ts - nowTs);
    for (let i = 1; i < displaySeries.length; i++) {
      const candidate = displaySeries[i];
      const diff = Math.abs(candidate.ts - nowTs);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best.v;
  })();
  const fallbackValue = hasData ? displaySeries[displaySeries.length - 1].v : 0;
  const headerValueStr = (valueAtNow ?? fallbackValue).toFixed(1);

  const firstVal = hasData ? displaySeries[0].v : 0;
  const lastVal = hasData ? displaySeries[displaySeries.length - 1].v : 0;
  const diff = lastVal - firstVal;

  let trend: "up" | "down" | "flat" = "flat";
  if (diff > 0.5) trend = "up";
  else if (diff < -0.5) trend = "down";

  const showTrendArrow = hasData && unit === "cm" && trend !== "flat";

  useEffect(() => {
    if (!showTrendArrow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [showTrendArrow, arrowAnim]);

  const translateY = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  const zeroLineY =
    typeof zeroLineAt === "number" &&
    zeroLineAt >= graphMin &&
    zeroLineAt <= graphMax
      ? 20 +
        GRAPH_HEIGHT -
        ((zeroLineAt - graphMin) / graphSpan) * GRAPH_HEIGHT
      : null;

  if (!hasData) {
    return null;
  }

  return (
    <View style={styles.graphContainer}>
      <View style={styles.graphHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {showTrendArrow && (
            <Animated.View style={{ transform: [{ translateY }] }}>
              <Ionicons
                name={trend === "up" ? "arrow-up" : "arrow-down"}
                size={14}
                color={color}
              />
            </Animated.View>
          )}
          <Text style={[styles.graphVal, { color }]}>
            {headerValueStr} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.scrollWrapper}>
        <View style={styles.yAxisOverlay}>
          <Text style={[styles.axisLabel, { top: 20 }]}>
            {graphMax.toFixed(1)}
          </Text>
          <Text
            style={[
              styles.axisLabel,
              { top: 20 + 100 - 10 },
            ]}
          >
            {graphMin.toFixed(1)}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={{ width: graphWidth }}
        >
          <Svg width={graphWidth} height={140}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.3} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {nowX != null && (
              <>
                <Line
                  x1={nowX}
                  y1={10}
                  x2={nowX}
                  y2={20 + GRAPH_HEIGHT + 6}
            stroke={THEME.graphYellow}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
            <SvgText
              x={Math.min(nowX + 6, graphWidth - 12)}
              y={14}
              fill={THEME.graphYellow}
              fontSize={10}
              fontWeight="700"
              textAnchor="start"
            >
              Nu
            </SvgText>
              </>
            )}

            {ticks.map((t, i) => (
              <React.Fragment key={i}>
                <Line
                  x1={t.x}
                  y1={20}
                  x2={t.x}
                  y2={20 + 100}
                  stroke={THEME.border}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                {t.showArrow && (
                  <G
                    x={t.x}
                    y={20 + 10}
                    rotation={t.rotation}
                    origin="0, 0"
                  >
                    <Path d={arrowPath} fill={THEME.text} />
                  </G>
                )}
                <SvgText
                  x={t.x}
                  y={140 - 5}
                  fill={THEME.textSec}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {t.label}
                </SvgText>
                {t.label2 && (
                  <SvgText
                    x={t.x}
                    y={140 - 18}
                    fill={THEME.textSec}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {t.label2}
                  </SvgText>
                )}
              </React.Fragment>
            ))}

            {zeroLineY !== null && (
              <>
                <Line
                  x1={0}
                  y1={zeroLineY}
                  x2={graphWidth}
                  y2={zeroLineY}
                  stroke="lightgray"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
                <SvgText
                  x={5}
                  y={zeroLineY - 4}
                  fill="lightgray"
                  fontSize={10}
                >
                  0 {unit}
                </SvgText>
              </>
            )}

            <Path d={area} fill={`url(#${gradId})`} />
            <Path d={path} fill="none" stroke={color} strokeWidth={2} />
            <Circle
              cx={0}
              cy={
                20 +
                100 -
                ((displaySeries[0].v - graphMin) / graphSpan) * 100
              }
              r={4}
              fill={color}
            />
          </Svg>
        </ScrollView>
      </View>
      {showTimeRange && (
        <View style={styles.timeRangeRow}>
          <Text style={styles.timeRangeText}>{formatTs(startTime)}</Text>
          <Text style={styles.timeRangeText}>{formatTs(endTime)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },

  // Top buttons
  topButtonsRow: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 16,
    flexDirection: "column",
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.graphYellow,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  // Pin marker
  pinBody: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.graphYellow,
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

  // Hint card
  hintCard: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: "5%",
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  hintIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    flex: 1,
    color: THEME.textSec,
    fontSize: 13,
    lineHeight: 18,
  },

  // Location action card
  locationCard: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: "5%",
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  locationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  locationCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
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
    gap: 6,
    backgroundColor: THEME.graphYellow,
    paddingVertical: 12,
    borderRadius: 12,
  },
  locationPrimaryBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  locationSecondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.inputBg,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  locationSecondaryBtnText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },

  // Weather bottom sheet
  weatherSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: THEME.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: THEME.border,
    paddingTop: 8,
    maxHeight: "75%",
  },
  weatherSheetHeader: {
    alignItems: "center",
    paddingBottom: 8,
  },
  weatherSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
  },
  weatherSheetCloseBtn: {
    position: "absolute",
    right: 16,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  weatherTitleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  weatherTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  sunTimesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  sunTimeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: THEME.inputBg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  sunTimeLabel: {
    color: THEME.textSec,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sunTimeValue: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  sunriseIconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sunriseArrow: {
    position: "absolute",
    top: -2,
    right: -2,
  },
  sunsetIconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sunsetArrow: {
    position: "absolute",
    bottom: -2,
    right: -2,
  },
  horizonLine: {
    position: "absolute",
    bottom: 4,
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: "#FFA500",
    borderRadius: 1,
  },
  dayForecastRow: {
    flexDirection: "row",
    backgroundColor: THEME.inputBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  dayForecastItem: {
    flex: 1,
    alignItems: "center",
  },
  dayForecastLabel: {
    color: THEME.textSec,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  dayForecastIconWrap: {
    marginBottom: 4,
  },
  dayForecastTemp: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
  },
  weatherLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: THEME.inputBg,
    borderRadius: 12,
    marginTop: 8,
  },
  weatherLoadingText: {
    color: THEME.textSec,
    fontSize: 14,
  },
  weatherErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderRadius: 12,
    marginTop: 8,
  },
  weatherErrorText: {
    color: THEME.danger,
    fontSize: 14,
  },
  weatherEmptyBox: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    marginTop: 8,
  },
  weatherEmptyText: {
    color: THEME.textSec,
    fontSize: 14,
  },

  // Popup/Modal styles (shared)
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 20,
  },
  popupCard: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  popupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  popupIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.graphYellow,
    alignItems: "center",
    justifyContent: "center",
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  popupCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  popupDescription: {
    color: THEME.textSec,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  popupSection: {
    gap: 8,
    marginBottom: 16,
  },
  popupInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  popupInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
    paddingVertical: 14,
  },
  popupBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  popupPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.graphYellow,
    paddingVertical: 14,
    borderRadius: 14,
  },
  popupPrimaryBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  popupSecondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  popupSecondaryBtnText: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
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
    backgroundColor: THEME.inputBg,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
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

  // Layer option cards
  layerOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.inputBg,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  layerOptionCardActive: {
    borderColor: THEME.graphYellow,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  layerOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  layerOptionLabel: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "500",
  },
  layerOptionLabelActive: {
    color: THEME.graphYellow,
    fontWeight: "600",
  },

  // Toggle
  toggleTrack: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#444",
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackActive: {
    backgroundColor: THEME.graphYellow,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#222",
  },
  toggleThumbActive: {
    backgroundColor: "#000",
    marginLeft: "auto",
  },

  // Coord badge
  coordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  coordBadgeText: {
    color: THEME.graphYellow,
    fontSize: 12,
    fontWeight: "600",
  },

  // Delete spot
  deleteSpotInfo: {
    backgroundColor: THEME.inputBg,
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  deleteSpotName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
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
    paddingVertical: 14,
    borderRadius: 14,
  },
  deleteConfirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Spot sheet
  spotSheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  spotSheet: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  spotSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    marginBottom: 12,
  },
  spotSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  spotSheetTitleArea: {
    flex: 1,
    marginRight: 12,
  },
  spotSheetTitle: {
    color: THEME.text,
    fontSize: 22,
    fontWeight: "700",
  },
  spotSheetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  spotEditBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.graphYellow,
    alignItems: "center",
    justifyContent: "center",
  },
  spotCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bestSpotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  bestSpotBadgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "700",
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
    backgroundColor: THEME.inputBg,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  spotStatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotStatValue: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
  },
  spotStatLabel: {
    color: THEME.textSec,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  spotLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: THEME.inputBg,
    borderRadius: 12,
    marginBottom: 16,
  },
  spotLoadingText: {
    color: THEME.textSec,
    fontSize: 14,
  },
  spotErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderRadius: 12,
    marginBottom: 16,
  },
  spotErrorText: {
    color: THEME.danger,
    fontSize: 14,
  },
  spotDayForecast: {
    flexDirection: "row",
    backgroundColor: THEME.inputBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  spotDayItem: {
    flex: 1,
    alignItems: "center",
  },
  spotDayLabel: {
    color: THEME.textSec,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  spotDayIconWrap: {
    marginBottom: 4,
  },
  spotDayTemp: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "700",
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
});




