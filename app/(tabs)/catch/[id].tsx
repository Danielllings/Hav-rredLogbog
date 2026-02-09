// app/(tabs)/catch/[id].tsx

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import MapView, {
  Marker,
  MapPressEvent,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  UrlTile,
} from "react-native-maps";
import * as Location from "expo-location";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";

import { getCatch, deleteCatch, updateCatch } from "../../../lib/catches";
import {
  getTrip,
  getTrackedTrips,
  type TrackedTrip,
} from "../../../lib/trips";
import { uploadCatchImageAsync } from "../../../lib/storage";
import { ORTO_FORAAR_URL } from "../../../lib/maps";
import { listSpots, type Spot } from "../../../lib/spots";
import { useLanguage } from "../../../lib/i18n";

type LatLng = { latitude: number; longitude: number };
type Stat = { avg: number; min: number; max: number };
type Serie = { ts: number; v: number };

// --- TEMA (matcher de andre skærme) ---
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",

  primary: "#FFFFFF",
  primaryText: "#000000",

  saveGreen: "#22C55E",
  calendarAccent: "#F59E0B",
  graphYellow: "#F59E0B",
  startGreen: "#22C55E",

  text: "#FFFFFF",
  textSec: "#A1A1AA",
  danger: "#FF453A",
  inputBg: "#2C2C2E",
  border: "#333333",
  ghost: "#333333",
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

function fmtDateOnly(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

const isoDay = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);

const toNum = (s: string) => {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Label til tracked tur-chip (dato + tid)
function fmtTripLabel(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("da-DK", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function degToCompass(deg?: number) {
  if (typeof deg !== "number" || deg < 0) return "—";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  const ix = Math.round(deg / 45) % 8;
  return dirs[ix];
}

export default function CatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  const [row, setRow] = useState<any | null>(null);
  const [edit, setEdit] = useState(false);

  // vejr-evaluering fra tilknyttet tur
  const [evaluation, setEvaluation] = useState<any | null>(null);

  // tracked ture til valg
  const [trackedTrips, setTrackedTrips] = useState<TrackedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [trackedModalVisible, setTrackedModalVisible] = useState(false);
  const [spotSearch, setSpotSearch] = useState("");

  // spots til valg af lokation
  const [spots, setSpots] = useState<Spot[]>([]);
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // modals
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");

  // edit state
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [showPicker, setShowPicker] = useState(false);

  const [timeOfDay, setTimeOfDay] = useState<string | undefined>();
  const [len, setLen] = useState("");
  const [kg, setKg] = useState("");
  const [bait, setBait] = useState("");
  const [notes, setNotes] = useState("");
  const [pos, setPos] = useState<LatLng | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Sørg for altid at starte i visning, når skærmen får fokus
  useFocusEffect(
    useCallback(() => {
      setEdit(false);
      return () => {};
    }, [])
  );

  // hent og normalisér evaluation fra meta_json
  const loadTripEvaluation = useCallback(async (tripId: string | null) => {
    if (!tripId) {
      setEvaluation(null);
      return;
    }
    try {
      const trip = await getTrip(tripId);
      if (!trip?.meta_json) {
        setEvaluation(null);
        return;
      }
      let meta: any = {};
      try {
        meta = JSON.parse(trip.meta_json);
      } catch {
        meta = {};
      }

      let ev: any =
        meta?.evaluation ||
        meta?.summary?.evaluation ||
        (meta && meta.source ? meta : null);

      if (ev) {
        if (ev.seaTempC && !ev.waterTempC) {
          ev.waterTempC = ev.seaTempC;
        }
        if (ev.waterLevelCm && !ev.waterLevelCM) {
          ev.waterLevelCM = ev.waterLevelCm;
        }
        if (ev.seaTempSeries && !ev.waterTempSeries) {
          ev.waterTempSeries = ev.seaTempSeries;
        }
        if (!ev.waterLevelSeries && ev.waterLevelCmSeries) {
          ev.waterLevelSeries = ev.waterLevelCmSeries;
        }
      }

      setEvaluation(ev || null);
    } catch (e) {
      console.log("Fejl ved hentning af trip/meta til fangst", e);
      setEvaluation(null);
    }
  }, []);

  // hent fangst
  useEffect(() => {
    (async () => {
      if (!id) return;
      const data = await getCatch(id);
      setRow(data);

      if (data) {
        setEdit(false);

        setDate(new Date(data.date).toISOString().slice(0, 10));
        setTimeOfDay(data.time_of_day ?? undefined);
        setLen(data.length_cm ? String(data.length_cm) : "");
        setKg(data.weight_kg ? String(data.weight_kg) : "");
        setBait(data.bait ?? "");
        setNotes(data.notes ?? "");
        setPhotoUri(data.photo_uri ?? null);

        if (typeof data.lat === "number" && typeof data.lng === "number") {
          setPos({ latitude: data.lat, longitude: data.lng });
        } else {
          setPos(null);
        }

        const initialTripId = data.trip_id ?? null;
        setSelectedTripId(initialTripId);
        await loadTripEvaluation(initialTripId);
      }
    })();
  }, [id, loadTripEvaluation]);

  // hent liste af trackede ture
  useEffect(() => {
    (async () => {
      try {
        const trips = await getTrackedTrips(50, 60);
        setTrackedTrips(trips);
      } catch (e) {
        console.log("Fejl ved getTrackedTrips", e);
      }
    })();
  }, []);

  // hent spots til lokationsvalg
  useEffect(() => {
    (async () => {
      try {
        const s = await listSpots();
        setSpots(s);
      } catch (e) {
        console.log("Fejl ved listSpots", e);
      }
    })();
  }, []);

  const filteredSpots = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((sp) => sp.name.toLowerCase().includes(q));
  }, [spots, spotSearch]);

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

  const selectedTripLabel = useMemo(() => {
    if (!selectedTripId) return null;
    const t = trackedTrips.find((tt) => tt.id === selectedTripId);
    if (!t) return null;
    return fmtTripLabel(t.started_at);
  }, [selectedTripId, trackedTrips]);

  async function handleSelectSpot(spot: Spot) {
    setSelectedSpotId(spot.id);
    setNotes(spot.name);
    if (
      typeof (spot as any).lat === "number" &&
      typeof (spot as any).lng === "number"
    ) {
      setPos({ latitude: (spot as any).lat, longitude: (spot as any).lng });
    }
    setSpotModalVisible(false);
  }

  if (!row)
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
        <ActivityIndicator color={THEME.primary} size="large" />
      </View>
    );

  async function onDelete() {
    setDeleteModalVisible(true);
  }

  async function confirmDelete() {
    setDeleteModalVisible(false);
    if (!id) return;
    await deleteCatch(id);
    router.back();
  }

  async function onSave() {
    if (!id) return;

    const iso = `${date}T00:00:00.000Z`;

    // Håndtér billede
    let finalPhotoUrl: string | null = row.photo_uri ?? null;

    if (photoUri) {
      if (photoUri.startsWith("file://")) {
        try {
          finalPhotoUrl = await uploadCatchImageAsync(photoUri, id);
        } catch (e) {
          console.log("Fejl ved upload af fangstbillede:", e);
        }
      } else {
        finalPhotoUrl = photoUri;
      }
    } else {
      finalPhotoUrl = null;
    }

    await updateCatch(id, {
      date: iso,
      time_of_day: timeOfDay ?? null,
      length_cm: toNum(len),
      weight_kg: toNum(kg),
      bait,
      notes,
      lat: pos?.latitude ?? null,
      lng: pos?.longitude ?? null,
      photo_uri: finalPhotoUrl,
      trip_id: selectedTripId ?? null,
    });

    router.replace("/catches");
  }

  async function useCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermissionMessage(t("appNeedsLocationAccess"));
      setPermissionModalVisible(true);
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  }

  function onMapPress(e: MapPressEvent) {
    if (!edit) return;
    setPos(e.nativeEvent.coordinate);
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setPermissionMessage(t("appNeedsPhotoAccess"));
      setPermissionModalVisible(true);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.length) {
      setPhotoUri(res.assets[0].uri);
    }
  }

  async function onSelectTrip(tripId: string | null) {
    setSelectedTripId(tripId);
    await loadTripEvaluation(tripId);
  }

  const timeOptions = [
    { key: "morning", label: t("morning") },
    { key: "lateMorning", label: t("lateMorning") },
    { key: "afternoon", label: t("afternoon") },
    { key: "evening", label: t("evening") },
    { key: "night", label: t("night") },
  ];

  const hasClimate = !!(evaluation?.stationName || evaluation?.stationId);
  const hasOcean = !!(
    evaluation?.oceanStationName || evaluation?.oceanStationId
  );

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* SLET-FANGST MODAL */}
      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("deleteCatch")}</Text>
            <Text style={styles.modalText}>
              {t("deleteCatchConfirm")}
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.btn, styles.ghost]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.ghostText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.danger]} onPress={confirmDelete}>
                <Text style={styles.dangerText}>{t("delete")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* TILLADELSES-MODAL */}
      <Modal
        transparent
        visible={permissionModalVisible}
        animationType="fade"
        onRequestClose={() => setPermissionModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("accessDenied")}</Text>
            <Text style={styles.modalText}>{permissionMessage}</Text>
            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.btn, styles.primary]}
                onPress={() => setPermissionModalVisible(false)}
              >
                <Text style={styles.primaryText}>{t("ok")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: vælg tracked tur */}
      <Modal
        transparent
        visible={trackedModalVisible}
        animationType="fade"
        onRequestClose={() => setTrackedModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBoxTall}>
            <Text style={styles.modalTitle}>{t("selectTrackedTrip")}</Text>
            <Text style={styles.modalText}>
              {t("selectTrackedTripDesc")}
            </Text>

            <ScrollView
              style={{ maxHeight: 320, marginBottom: 12 }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {trackedTrips.length === 0 ? (
                <Text style={{ color: THEME.textSec, fontSize: 14 }}>
                  {t("noTrackedTrips")}
                </Text>
              ) : (
                trackedTrips.map((trip) => {
                  const label = fmtTripLabel(trip.started_at);
                  const active = selectedTripId === trip.id;

                  return (
                    <Pressable
                      key={trip.id}
                      style={[
                        styles.tripItem,
                        active && styles.tripItemActive,
                      ]}
                    onPress={() => {
                      onSelectTrip(trip.id);
                      setTrackedModalVisible(false);
                    }}
                  >
                    <Text
                      style={
                        active
                          ? styles.tripItemTextActive
                          : styles.tripItemText
                      }
                    >
                      {label}
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
              {selectedTripId && (
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => {
                    onSelectTrip(null);
                    setTrackedModalVisible(false);
                  }}
                >
                  <Text style={styles.ghostText}>{t("removeSelection")}</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btn, styles.primaryYellow]}
                onPress={() => setTrackedModalVisible(false)}
              >
                <Text style={styles.primaryText}>{t("close")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: vælg spot / lokation */}
      <Modal
        transparent
        visible={spotModalVisible}
        animationType="fade"
        onRequestClose={() => setSpotModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBoxTall}>
            <Text style={styles.modalTitle}>{t("selectSpot")}</Text>
            <Text style={styles.modalText}>
              {t("selectSpotDesc")}
            </Text>

            <View style={styles.spotSearchRow}>
              <Ionicons
                name="search"
                size={18}
                color={THEME.textSec}
                style={{ marginRight: 6 }}
              />
              <TextInput
                style={styles.spotSearchInput}
                placeholder={t("searchSpotName")}
                placeholderTextColor={THEME.textSec}
                value={spotSearch}
                onChangeText={setSpotSearch}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              style={{ maxHeight: 320, marginBottom: 12 }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {filteredSpots.length === 0 ? (
                <Text style={{ color: THEME.textSec, fontSize: 14 }}>
                  {t("noSpotsFound")}
                </Text>
              ) : (
                filteredSpots.map((spot) => {
                  const active = selectedSpotId === spot.id;
                  return (
                    <Pressable
                      key={spot.id}
                      style={[
                        styles.tripItem,
                        active && styles.tripItemActive,
                      ]}
                      onPress={() => handleSelectSpot(spot)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={
                            active
                              ? styles.tripItemTextActive
                              : styles.tripItemText
                          }
                        >
                          {spot.name || t("withoutName")}
                        </Text>
                      </View>
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
              {selectedSpotId && (
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => {
                    setSelectedSpotId(null);
                    setPos(null);
                    setSpotModalVisible(false);
                  }}
                >
                  <Text style={styles.ghostText}>{t("removeSpot")}</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btn, styles.primaryYellow]}
                onPress={() => setSpotModalVisible(false)}
              >
                <Text style={styles.primaryText}>{t("close")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* INDHOLD */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* HERO FOTO */}
        <View style={styles.hero}>
          <Image
            source={{ uri: photoUri ?? row.photo_uri }}
            style={styles.heroImg}
          />
          <View style={styles.heroBadge}>
            <Ionicons name="calendar-outline" size={16} color="#fff" />
            <Text style={styles.heroBadgeText}>{fmtDateOnly(row.date)}</Text>
          </View>

          {edit && (
            <Pressable style={styles.changePhotoBtn} onPress={pickImage}>
              <Ionicons name="image" size={16} color="#000" />
              <Text style={{ color: "#000", fontWeight: "700", marginLeft: 6 }}>
                {t("changePhoto")}
              </Text>
            </Pressable>
          )}
        </View>

        {!edit ? (
          <>
            {/* FANGSTDATA (View Mode) */}
            <View style={styles.card}>
              {/* Card header med dato */}
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>
                  {new Date(row.date).toLocaleDateString("da-DK", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                {row.notes && (
                  <View style={styles.spotBadge}>
                    <Ionicons name="location" size={12} color={THEME.graphYellow} />
                    <Text style={styles.spotBadgeText}>{row.notes}</Text>
                  </View>
                )}
              </View>

              {/* Symmetrisk grid */}
              <View style={styles.infoGrid}>
                <Info
                  label={t("measure")}
                  value={row.length_cm ? `${row.length_cm} cm` : "—"}
                  highlight
                />
                <Info
                  label={t("weight")}
                  value={row.weight_kg ? `${row.weight_kg} kg` : "—"}
                  highlight
                />
                <Info label={t("timeOfDay")} value={row.time_of_day || "—"} />
              </View>

              {/* Ekstra info */}
              <View style={styles.detailSection}>
                <View style={styles.detailItem}>
                  <Ionicons name="fish-outline" size={16} color={THEME.graphYellow} />
                  <Text style={styles.detailLabel}>{t("baitFly")}</Text>
                  <Text style={styles.detailValue}>{row.bait || "—"}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar-outline" size={16} color={THEME.textSec} />
                  <Text style={styles.detailLabel}>{t("registered")}</Text>
                  <Text style={styles.detailValue}>{fmtDateOnly(row.created_at)}</Text>
                </View>
              </View>
            </View>

            {/* VEJRFORHOLD (View Mode) */}
            <View style={styles.card}>
              <Text style={styles.title}>{t("weatherDuringFishing")}</Text>

              {!evaluation ? (
                <Text style={styles.body}>
                  {t("noWeatherData")}
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {evaluation.note && (
                    <Text style={styles.noteText}>
                      {t("note")}: {evaluation.note}
                    </Text>
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
                      {dataTimeStr && (
                        <Text style={styles.sourceTime}>{dataTimeStr}</Text>
                      )}
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

            {/* KORT – VISNING */}
            {pos && (
              <View style={styles.card}>
                <Text style={styles.title}>{t("catchLocation")}</Text>
                <View style={styles.mapContainer}>
                  <MapView
                    style={{ flex: 1 }}
                    region={{
                      latitude: pos.latitude,
                      longitude: pos.longitude,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    pitchEnabled
                    rotateEnabled
                    scrollEnabled
                    zoomEnabled
                    customMapStyle={MAP_STYLE}
                    userInterfaceStyle={MAP_UI_STYLE}
                    provider={MAP_PROVIDER}
                    mapType={MAP_TYPE}
                  >
                    <UrlTile
                      urlTemplate={ORTO_FORAAR_URL}
                      maximumZ={21}
                      tileSize={256}
                    />
                    <Marker coordinate={pos} title="Fangststed" />
                  </MapView>
                </View>
              </View>
            )}

            {/* HANDLINGSKNAPPER */}
            <View style={styles.actionRow}>
              <Pressable
                style={styles.editBtn}
                onPress={() => setEdit(true)}
              >
                <Ionicons name="create-outline" size={18} color="#000" />
                <Text style={styles.editBtnText}>{t("edit")}</Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={18} color={THEME.danger} />
                <Text style={styles.deleteBtnText}>{t("delete")}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* REDIGERING */}
            <View style={styles.card}>
              <Text style={styles.title}>{t("editCatch")}</Text>

              <Text style={styles.sectionLabel}>{t("date")}</Text>
              <Pressable
                style={styles.dateInput}
                onPress={() => setShowPicker((prev) => !prev)}
              >
                <Ionicons name="calendar" size={18} color={THEME.textSec} />
                <Text style={styles.dateText}>{date || t("selectDate")}</Text>
              </Pressable>

              {showPicker && (
                <DateTimePicker
                  value={new Date(date)}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  themeVariant="dark"
                  textColor="#FFF"
                  accentColor={THEME.calendarAccent}
                  onChange={(e, d) => {
                    if (Platform.OS !== "ios") setShowPicker(false);
                    if (d) setDate(isoDay(d));
                  }}
                />
              )}

              <Text style={styles.sectionLabel}>{t("timeOfDay")}</Text>
              <View style={styles.chipRow}>
                {timeOptions.map((opt) => {
                  const active = timeOfDay === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setTimeOfDay(active ? undefined : opt.key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={
                          active ? styles.chipActiveText : styles.chipText
                        }
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* VALG AF TRACKED TUR TIL VEJRDATA */}
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                {t("trackedTripOptional")}
              </Text>
              <Pressable
                style={styles.dateInput}
                onPress={() => setTrackedModalVisible(true)}
              >
                <Ionicons name="time" size={18} color={THEME.textSec} />
                <Text style={styles.dateText}>
                  {selectedTripLabel ?? t("selectTrackedTripOptional")}
                </Text>
              </Pressable>
              <Text
                style={{
                  fontSize: 12,
                  color: THEME.textSec,
                  marginBottom: 10,
                }}
              >
                {t("trackedTripHint")}
              </Text>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label={t("lengthCm")}
                    value={len}
                    onChangeText={setLen}
                    keyboardType="numeric"
                    placeholder="fx 60"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label={t("weightKg")}
                    value={kg}
                    onChangeText={setKg}
                    keyboardType="numeric"
                    placeholder="fx 2,1"
                  />
                </View>
              </View>

              <LabeledInput
                label={t("baitFly")}
                value={bait}
                onChangeText={setBait}
                placeholder="fx Sandeel …"
              />

              {/* LOKATION VIA SPOTS */}
              <Text style={styles.sectionLabel}>{t("location")}</Text>
              <Pressable
                style={styles.dateInput}
                onPress={() => setSpotModalVisible(true)}
              >
                <Ionicons name="location" size={18} color={THEME.textSec} />
                <Text style={styles.dateText}>
                  {notes ? notes : t("addLocation")}
                </Text>
              </Pressable>
              <Text
                style={{
                  fontSize: 12,
                  color: THEME.textSec,
                  marginTop: 4,
                  marginBottom: 8,
                }}
              >
                {t("locationFromSpotHint")}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>{t("locationOnMap")}</Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 8,
                  marginBottom: 8,
                }}
              >
                <Pressable
                  onPress={useCurrentLocation}
                  style={styles.smallBtn}
                >
                  <Text
                    style={{
                      color: THEME.text,
                      fontWeight: "600",
                    }}
                  >
                    {t("useMyPosition")}
                  </Text>
                </Pressable>
                {pos && (
                  <Pressable
                    onPress={() => setPos(null)}
                    style={styles.smallBtn}
                  >
                    <Text
                      style={{
                        color: THEME.text,
                        fontWeight: "600",
                      }}
                    >
                      {t("clear")}
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.mapContainer}>
                <MapView
                  style={{ flex: 1 }}
                  onPress={(e: MapPressEvent) => onMapPress(e)}
                  initialRegion={{
                    latitude: pos?.latitude ?? 55.6761,
                    longitude: pos?.longitude ?? 12.5683,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  region={
                    pos
                      ? {
                          latitude: pos.latitude,
                          longitude: pos.longitude,
                          latitudeDelta: 0.01,
                          longitudeDelta: 0.01,
                        }
                      : undefined
                  }
                  pitchEnabled
                  rotateEnabled
                scrollEnabled
                zoomEnabled
                customMapStyle={MAP_STYLE}
                userInterfaceStyle={MAP_UI_STYLE}
                provider={MAP_PROVIDER}
                mapType={MAP_TYPE}
              >
                  <UrlTile
                    urlTemplate={ORTO_FORAAR_URL}
                    maximumZ={21}
                    tileSize={256}
                  />
                  {pos && <Marker coordinate={pos} title="Fangststed" />}
                </MapView>
              </View>
            </View>

            <View style={styles.editActionRow}>
              <Pressable
                style={styles.editCancelBtn}
                onPress={() => setEdit(false)}
              >
                <Text style={styles.editCancelBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable style={styles.editSaveBtn} onPress={onSave}>
                <Ionicons name="checkmark" size={20} color="#000" />
                <Text style={styles.editSaveBtnText}>{t("saveChanges")}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoVal, highlight && styles.infoValHighlight]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

function LabeledInput(props: any) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={THEME.textSec}
        style={[styles.textInput, style]}
      />
    </View>
  );
}

// Kompas med pil
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

// StatLinje
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

// Graf – Modern Sparkline (matcher trips/[id].tsx)
function StatGraph({
  series,
  label,
  unit,
}: {
  series: Serie[];
  label: string;
  unit: string;
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

  // Display value
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

            {/* Endpoint dot */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },

  hero: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: THEME.card,
    marginBottom: 16,
    position: "relative",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  heroImg: { width: "100%", height: 280 },
  heroBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroBadgeText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  changePhotoBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
    backgroundColor: THEME.graphYellow,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
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
  infoVal: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  infoValHighlight: {
    color: THEME.graphYellow,
  },
  infoLabel: {
    color: THEME.textSec,
    fontSize: 11,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  detailSection: {
    gap: 8,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    color: THEME.textSec,
    fontSize: 13,
  },
  detailValue: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: "auto",
  },

  sectionLabel: {
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: { color: THEME.text },

  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },

  primary: { backgroundColor: THEME.primary },
  primaryText: { color: THEME.primaryText, fontSize: 16, fontWeight: "700" },

  // gul variant til lokations-UI (tema-gul)
  primaryYellow: {
    backgroundColor: THEME.calendarAccent,
  },

  saveBtn: { backgroundColor: THEME.saveGreen },

  danger: { backgroundColor: THEME.danger },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  ghost: { backgroundColor: THEME.ghost },
  ghostText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  editBtn: {
    flex: 1,
    backgroundColor: THEME.graphYellow,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  editBtnText: { color: "#000", fontSize: 15, fontWeight: "700" },
  deleteBtn: {
    flex: 1,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  deleteBtnText: { color: THEME.danger, fontSize: 15, fontWeight: "600" },

  editActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  editCancelBtn: {
    flex: 0.4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  editCancelBtnText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "600",
  },
  editSaveBtn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: THEME.saveGreen,
  },
  editSaveBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },

  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.ghost,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700" },
  chipActiveText: { color: THEME.primaryText, fontWeight: "700" },

  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  dateText: { color: THEME.text, fontSize: 15 },

  textInput: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    backgroundColor: THEME.inputBg,
    fontSize: 16,
  },

  // Kort-container
  mapContainer: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
    backgroundColor: "#000",
  },

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
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: THEME.text,
  },
  modalText: {
    fontSize: 16,
    color: "#CCC",
    marginBottom: 16,
    lineHeight: 22,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  noteText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 4,
  },

  // Stat / grafer
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

  // Sparkline grafer (matcher trips)
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

  // Source section
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

  // tracked tur-liste (genbruges til spots)
  tripItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginBottom: 10,
    backgroundColor: THEME.inputBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripItemActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  tripItemText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  tripItemTextActive: {
    color: THEME.primaryText,
    fontSize: 14,
    fontWeight: "600",
  },

  searchInput: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: THEME.text,
    backgroundColor: THEME.inputBg,
    fontSize: 14,
    marginBottom: 10,
  },
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  spotSearchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
  },
});
