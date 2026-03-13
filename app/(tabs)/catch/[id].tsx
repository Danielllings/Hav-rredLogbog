// app/(tabs)/catch/[id].tsx

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
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
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  UrlTile,
} from "react-native-maps";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeIn, FadeInUp, FadeInDown } from "react-native-reanimated";
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

// Komponenter
import { GlassCard, SolidCard } from "../../../components/statistics/GlassCard";
import {
  CatchHeroPhoto,
  CatchStatsRow,
  CatchStatsDisplay,
  CatchInputCard,
} from "../../../components/catch";
import { APPLE } from "../../../constants/appleTheme";

type LatLng = { latitude: number; longitude: number };
type Stat = { avg: number; min: number; max: number };
type Serie = { ts: number; v: number };

// --- Kort stilarter ---
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
  if (typeof deg !== "number" || deg < 0) return "-";
  const dirs = ["N", "NO", "O", "SO", "S", "SV", "V", "NV"];
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
  const [date, setDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const [len, setLen] = useState("");
  const [kg, setKg] = useState("");
  const [bait, setBait] = useState("");
  const [notes, setNotes] = useState("");
  const [pos, setPos] = useState<LatLng | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Start altid i visning naar skaermen faar fokus
  useFocusEffect(
    useCallback(() => {
      setEdit(false);
      return () => {};
    }, [])
  );

  // hent og normaliser evaluation fra meta_json
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
      } catch (e) {}
    })();
  }, []);

  // hent spots til lokationsvalg
  useEffect(() => {
    (async () => {
      try {
        const s = await listSpots();
        setSpots(s);
      } catch (e) {}
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
    const trip = trackedTrips.find((tt) => tt.id === selectedTripId);
    if (!trip) return null;
    return fmtTripLabel(trip.started_at);
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
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle="light-content" backgroundColor={APPLE.bg} />
        <ActivityIndicator color={APPLE.accent} size="large" />
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

    // Haandter billede
    let finalPhotoUrl: string | null = row.photo_uri ?? null;

    if (photoUri) {
      if (photoUri.startsWith("file://")) {
        try {
          finalPhotoUrl = await uploadCatchImageAsync(photoUri, id);
        } catch (e) {}
      } else {
        finalPhotoUrl = photoUri;
      }
    } else {
      finalPhotoUrl = null;
    }

    await updateCatch(id, {
      date: iso,
      time_of_day: null,
      length_cm: toNum(len),
      weight_kg: toNum(kg),
      bait,
      notes,
      lat: pos?.latitude ?? null,
      lng: pos?.longitude ?? null,
      photo_uri: finalPhotoUrl ?? "",
      trip_id: selectedTripId ?? null,
    });

    router.replace("/catches");
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

  const hasClimate = !!(evaluation?.stationName || evaluation?.stationId);
  const hasOcean = !!(
    evaluation?.oceanStationName || evaluation?.oceanStationId
  );

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={APPLE.bg} />

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
                style={[styles.btn, styles.primaryAccent]}
                onPress={() => setPermissionModalVisible(false)}
              >
                <Text style={styles.primaryText}>{t("ok")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: vaelg tracked tur */}
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
                <Text style={{ color: APPLE.textSecondary, fontSize: 14 }}>
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
                          color={APPLE.bg}
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
                style={[styles.btn, styles.primaryAccent]}
                onPress={() => setTrackedModalVisible(false)}
              >
                <Text style={styles.primaryText}>{t("close")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: vaelg spot / lokation */}
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
                color={APPLE.textSecondary}
                style={{ marginRight: 6 }}
              />
              <TextInput
                style={styles.spotSearchInput}
                placeholder={t("searchSpotName")}
                placeholderTextColor={APPLE.textSecondary}
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
                <Text style={{ color: APPLE.textSecondary, fontSize: 14 }}>
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
                          color={APPLE.bg}
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
                style={[styles.btn, styles.primaryAccent]}
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
        showsVerticalScrollIndicator={false}
      >
        {/* HERO FOTO */}
        <CatchHeroPhoto
          photoUri={photoUri ?? row.photo_uri}
          onPickPhoto={pickImage}
          showEditButton={edit}
          dateBadge={!edit ? fmtDateOnly(row.date) : undefined}
        />

        {!edit ? (
          <>
            {/* VIEW MODE */}

            {/* STATS DISPLAY */}
            <CatchStatsDisplay
              length={row.length_cm}
              weight={row.weight_kg}
              delay={100}
            />

            {/* INFO CARD */}
            <Animated.View entering={FadeInUp.delay(200).duration(400).springify()}>
              <GlassCard style={styles.infoCard}>
                <View style={styles.infoHeader}>
                  <Text style={styles.infoDate}>
                    {new Date(row.date).toLocaleDateString("da-DK", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                  {row.notes && (
                    <View style={styles.spotBadge}>
                      <Ionicons name="location" size={12} color={APPLE.accent} />
                      <Text style={styles.spotBadgeText}>{row.notes}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailSection}>
                  <View style={styles.detailItem}>
                    <Ionicons name="fish-outline" size={16} color={APPLE.accent} />
                    <Text style={styles.detailLabel}>{t("baitFly")}</Text>
                    <Text style={styles.detailValue}>{row.bait || "-"}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={16} color={APPLE.textSecondary} />
                    <Text style={styles.detailLabel}>{t("registered")}</Text>
                    <Text style={styles.detailValue}>{fmtDateOnly(row.created_at)}</Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>

            {/* VEJRFORHOLD */}
            <Animated.View entering={FadeInUp.delay(300).duration(400).springify()}>
              <GlassCard style={styles.weatherCard}>
                <Text style={styles.sectionTitle}>{t("weatherDuringFishing")}</Text>

                {!evaluation ? (
                  <Text style={styles.bodyText}>
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
                        fmt={(v) => `${v.toFixed(1)} C`}
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
                        fmt={(v) => `${v.toFixed(1)} C`}
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
                        unit=" C"
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
                        unit=" C"
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
                            color={hasClimate ? APPLE.accent : "#FF3B30"}
                          />
                          <Text style={styles.sourceStatusText}>{t("weatherDataLabel")}</Text>
                        </View>

                        <View style={styles.sourceStatus}>
                          <Ionicons
                            name={hasOcean ? "checkmark-circle" : "close-circle"}
                            size={16}
                            color={hasOcean ? APPLE.accent : "#FF3B30"}
                          />
                          <Text style={styles.sourceStatusText}>{t("oceanDataLabel")}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </GlassCard>
            </Animated.View>

            {/* KORT */}
            {pos && (
              <Animated.View entering={FadeInUp.delay(400).duration(400).springify()}>
                <GlassCard style={styles.mapCard} noPadding>
                  <View style={styles.mapHeader}>
                    <Text style={styles.sectionTitle}>{t("catchLocation")}</Text>
                  </View>
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
                </GlassCard>
              </Animated.View>
            )}

            {/* HANDLINGSKNAPPER */}
            <Animated.View
              entering={FadeInDown.delay(500).duration(400).springify()}
              style={styles.actionRow}
            >
              <Pressable
                style={styles.editBtn}
                onPress={() => setEdit(true)}
              >
                <Ionicons name="create-outline" size={18} color={APPLE.bg} />
                <Text style={styles.editBtnText}>{t("edit")}</Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                <Text style={styles.deleteBtnText}>{t("delete")}</Text>
              </Pressable>
            </Animated.View>
          </>
        ) : (
          <>
            {/* EDIT MODE */}

            {/* STATS ROW */}
            <CatchStatsRow
              length={len}
              weight={kg}
              onLengthChange={setLen}
              onWeightChange={setKg}
              delay={100}
            />

            {/* DATO PICKER */}
            <Animated.View entering={FadeInUp.delay(200).duration(400).springify()}>
              <GlassCard style={styles.dateCard}>
                <Text style={styles.sectionLabel}>{t("date")}</Text>
                <Pressable
                  style={styles.dateInput}
                  onPress={() => setShowPicker((prev) => !prev)}
                >
                  <View style={styles.dateIconCircle}>
                    <Ionicons name="calendar" size={18} color={APPLE.accent} />
                  </View>
                  <Text style={styles.dateText}>{date || t("selectDate")}</Text>
                  <Ionicons name="chevron-down" size={18} color={APPLE.textSecondary} />
                </Pressable>

                {showPicker && (
                  <DateTimePicker
                    value={new Date(date)}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    themeVariant="dark"
                    textColor="#FFF"
                    accentColor={APPLE.accent}
                    onChange={(e, d) => {
                      if (Platform.OS !== "ios") setShowPicker(false);
                      if (d) setDate(isoDay(d));
                    }}
                  />
                )}
              </GlassCard>
            </Animated.View>

            {/* AGN/FLUE INPUT */}
            <CatchInputCard
              label={t("baitFly")}
              value={bait}
              onChangeText={setBait}
              placeholder="fx Sandeel ..."
              icon="fish"
              delay={300}
            />

            {/* TRIP LINK */}
            <Animated.View entering={FadeInUp.delay(400).duration(400).springify()}>
              <GlassCard style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <Ionicons name="analytics" size={20} color={APPLE.accent} />
                  <Text style={styles.tripTitle}>
                    {t("trackedTripOptional")}
                  </Text>
                </View>
                <Text style={styles.tripHint}>
                  {t("trackedTripHint")}
                </Text>
                <Pressable
                  style={styles.tripButton}
                  onPress={() => setTrackedModalVisible(true)}
                >
                  <Ionicons name="navigate-circle" size={20} color={APPLE.accent} />
                  <Text style={styles.tripButtonText}>
                    {selectedTripLabel ?? t("selectTrackedTripOptional")}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={APPLE.textSecondary} />
                </Pressable>
              </GlassCard>
            </Animated.View>

            {/* LOKATION */}
            <Animated.View entering={FadeInUp.delay(500).duration(400).springify()}>
              <GlassCard style={styles.locationCard}>
                <View style={styles.locationHeader}>
                  <View style={styles.locationIconCircle}>
                    <Ionicons name="location" size={22} color={APPLE.accent} />
                  </View>
                  <View style={styles.locationTitleContainer}>
                    <Text style={styles.locationTitle}>{t("location")}</Text>
                    <Text style={styles.locationSubtitle}>{t("selectFromYourSpots")}</Text>
                  </View>
                </View>

                {notes ? (
                  <View style={styles.selectedSpotCard}>
                    <View style={styles.selectedSpotInfo}>
                      <Ionicons name="location" size={20} color={APPLE.accent} />
                      <Text style={styles.selectedSpotName}>{notes}</Text>
                    </View>
                    <Pressable
                      style={styles.changeSpotBtn}
                      onPress={() => setSpotModalVisible(true)}
                    >
                      <Text style={styles.changeSpotBtnText}>{t("change")}</Text>
                    </Pressable>
                  </View>
                ) : spots.length > 0 ? (
                  <Pressable
                    style={styles.selectSpotBtn}
                    onPress={() => setSpotModalVisible(true)}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={APPLE.accent} />
                    <Text style={styles.selectSpotBtnText}>{t("selectSpot")}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.noSpotsContainer}>
                    <Text style={styles.noSpotsText}>{t("noSpotsYet")}</Text>
                  </View>
                )}
              </GlassCard>
            </Animated.View>

            {/* GEM/ANNULLER */}
            <Animated.View
              entering={FadeInDown.delay(600).duration(400).springify()}
              style={styles.editActionRow}
            >
              <Pressable
                style={styles.editCancelBtn}
                onPress={() => setEdit(false)}
              >
                <Text style={styles.editCancelBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable style={styles.editSaveBtn} onPress={onSave}>
                <Ionicons name="checkmark" size={20} color={APPLE.bg} />
                <Text style={styles.editSaveBtnText}>{t("saveChanges")}</Text>
              </Pressable>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </>
  );
}

// Wind Compass Component
function WindCompass({ directionDeg }: { directionDeg?: number }) {
  if (directionDeg === undefined || Number.isNaN(directionDeg)) {
    return (
      <View style={styles.compass}>
        <Text style={styles.compassN}>N</Text>
        <Ionicons name="arrow-up" size={20} color={APPLE.textSecondary} />
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
        color={APPLE.accent}
        style={{ transform: [{ rotate: `${rot}deg` }] }}
      />
    </View>
  );
}

// StatLine Component
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
          <Text style={styles.statLabel}>{label}</Text>
          {minMaxValue && <Text style={styles.minMaxText}>{minMaxValue}</Text>}
        </View>
        <View style={styles.windRight}>
          <View style={{ alignItems: "flex-end", marginRight: 8 }}>
            <Text style={styles.statValue}>{avgValue}</Text>
            <Text style={styles.windDirText}>
              {compassTxt} ({Math.round(direction)} gr.)
            </Text>
          </View>
          <WindCompass directionDeg={direction} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.statValue}>{avgValue}</Text>
        {minMaxValue && <Text style={styles.minMaxText}>{minMaxValue}</Text>}
      </View>
    </View>
  );
}

// StatGraph Component
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

  if (sampled.length < 2) return null;

  const firstTime = new Date(sampled[0].ts).getHours().toString().padStart(2, "0");
  const lastTime = new Date(sampled[sampled.length - 1].ts)
    .getHours()
    .toString()
    .padStart(2, "0");

  const HEIGHT = 100;
  const PADDING_X = 12;
  const PADDING_Y = 14;
  const GRAPH_H = HEIGHT - PADDING_Y * 2;

  const graphWidth = Math.max(layoutWidth - PADDING_X * 2, 0);

  const points = sampled.map((d, i) => {
    const x = PADDING_X + (i / (sampled.length - 1)) * graphWidth;
    const y = PADDING_Y + GRAPH_H - ((d.v - min) / span) * GRAPH_H;
    return { x, y, data: d };
  });

  const makeSmoothPath = () => {
    if (points.length < 2) return "";

    let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

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

  const activePoint = touchIndex !== null ? points[touchIndex] : null;
  const activeData = activePoint?.data;
  const activeTimeStr = activeData
    ? new Date(activeData.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const activeValStr = activeData ? `${activeData.v.toFixed(1)}${unit}` : null;

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
              {min.toFixed(1)} - {max.toFixed(1)}
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
                <Stop offset="0" stopColor={APPLE.accent} stopOpacity="0.25" />
                <Stop offset="1" stopColor={APPLE.accent} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            <Path d={areaPath} fill={`url(#grad-${label})`} />
            <Path
              d={linePath}
              fill="none"
              stroke={APPLE.accent}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {activePoint && (
              <>
                <Path
                  d={`M ${activePoint.x},0 L ${activePoint.x},${HEIGHT}`}
                  stroke={APPLE.accent}
                  strokeWidth="1.5"
                  opacity={0.8}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="8"
                  fill={APPLE.accent}
                  opacity={0.3}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="5"
                  fill={APPLE.accent}
                />
              </>
            )}

            {!activePoint && (
              <>
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="6"
                  fill={APPLE.accent}
                  opacity={0.3}
                />
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="4"
                  fill={APPLE.accent}
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
    backgroundColor: APPLE.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Info Card (View Mode)
  infoCard: {
    marginBottom: 12,
  },
  infoHeader: {
    marginBottom: 16,
  },
  infoDate: {
    fontSize: 15,
    fontWeight: "600",
    color: APPLE.text,
    textTransform: "capitalize",
    marginBottom: 8,
  },
  spotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: APPLE.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  spotBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: APPLE.accent,
  },
  detailSection: {
    gap: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    color: APPLE.textSecondary,
    fontSize: 13,
  },
  detailValue: {
    color: APPLE.text,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: "auto",
  },

  // Weather Card
  weatherCard: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: APPLE.textSecondary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bodyText: {
    color: APPLE.text,
    fontSize: 14,
  },
  noteText: {
    color: "#FF3B30",
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 4,
  },

  // Map Card
  mapCard: {
    marginBottom: 12,
  },
  mapHeader: {
    padding: 20,
    paddingBottom: 12,
  },
  mapContainer: {
    height: 220,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
  },

  // Action Buttons (View Mode)
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  editBtn: {
    flex: 1,
    backgroundColor: APPLE.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
  },
  editBtnText: {
    color: APPLE.bg,
    fontSize: 15,
    fontWeight: "600",
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
  },
  deleteBtnText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "600",
  },

  // Edit Mode Styles
  dateCard: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: APPLE.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: {
    color: APPLE.text,
    fontSize: 17,
    fontWeight: "500",
    flex: 1,
  },

  // Trip Card
  tripCard: {
    marginBottom: 12,
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  tripTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tripHint: {
    fontSize: 12,
    color: APPLE.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  tripButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: APPLE.glass,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  tripButtonText: {
    color: APPLE.text,
    fontSize: 15,
    flex: 1,
  },

  // Location Card
  locationCard: {
    marginBottom: 12,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  locationIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: APPLE.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  locationTitleContainer: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: APPLE.text,
  },
  locationSubtitle: {
    color: APPLE.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  selectedSpotCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: APPLE.accentMuted,
    borderRadius: 16,
    padding: 16,
  },
  selectedSpotInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  selectedSpotName: {
    fontSize: 15,
    fontWeight: "600",
    color: APPLE.text,
    flex: 1,
  },
  changeSpotBtn: {
    backgroundColor: APPLE.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  changeSpotBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.bg,
  },
  selectSpotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: APPLE.glass,
    borderRadius: 16,
    height: 56,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    borderStyle: "dashed",
  },
  selectSpotBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: APPLE.accent,
  },
  noSpotsContainer: {
    backgroundColor: APPLE.glass,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  noSpotsText: {
    fontSize: 14,
    color: APPLE.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Edit Action Buttons
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
    height: 56,
    borderRadius: 16,
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  editCancelBtnText: {
    color: APPLE.textSecondary,
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
    backgroundColor: APPLE.accent,
  },
  editSaveBtnText: {
    color: APPLE.bg,
    fontSize: 17,
    fontWeight: "600",
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    backgroundColor: APPLE.cardSolid,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  modalBoxTall: {
    width: "100%",
    backgroundColor: APPLE.cardSolid,
    borderRadius: 24,
    padding: 20,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    color: APPLE.text,
  },
  modalText: {
    fontSize: 15,
    color: APPLE.textSecondary,
    marginBottom: 16,
    lineHeight: 22,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryAccent: {
    backgroundColor: APPLE.accent,
  },
  primaryText: {
    color: APPLE.bg,
    fontSize: 15,
    fontWeight: "600",
  },
  ghost: {
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  ghostText: {
    color: APPLE.text,
    fontSize: 15,
    fontWeight: "600",
  },
  danger: {
    backgroundColor: "#FF3B30",
  },
  dangerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Trip/Spot List
  tripItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: APPLE.glass,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripItemActive: {
    backgroundColor: APPLE.accent,
  },
  tripItemText: {
    color: APPLE.text,
    fontSize: 14,
    fontWeight: "500",
  },
  tripItemTextActive: {
    color: APPLE.bg,
    fontSize: 14,
    fontWeight: "600",
  },

  // Spot Search
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: APPLE.glass,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  spotSearchInput: {
    flex: 1,
    color: APPLE.text,
    fontSize: 15,
  },

  // Stat Rows
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: APPLE.glassBorder,
  },
  statLabel: {
    color: APPLE.textSecondary,
    fontSize: 14,
  },
  statValue: {
    color: APPLE.text,
    fontSize: 16,
    fontWeight: "600",
  },
  minMaxText: {
    fontSize: 12,
    color: APPLE.textTertiary,
    marginTop: 2,
    fontStyle: "italic",
  },

  // Sparkline Graph
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
    color: APPLE.text,
  },
  sparklineValueRow: {
    alignItems: "flex-end",
  },
  sparklineValue: {
    fontSize: 18,
    fontWeight: "700",
    color: APPLE.accent,
  },
  sparklineRange: {
    fontSize: 11,
    color: APPLE.textSecondary,
    marginTop: 2,
  },
  sparklineGraph: {
    height: 100,
    borderRadius: 16,
    backgroundColor: APPLE.accentMuted,
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
    color: APPLE.textSecondary,
  },

  // Source Section
  sourceSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: APPLE.glassBorder,
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sourceLabel: {
    fontSize: 12,
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sourceTime: {
    fontSize: 11,
    color: APPLE.textTertiary,
  },
  sourceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sourceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceStatusText: {
    fontSize: 12,
    color: APPLE.textTertiary,
    fontWeight: "500",
  },

  // Wind Compass
  windRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  windDirText: {
    fontSize: 12,
    color: APPLE.textSecondary,
    marginTop: 2,
  },
  compass: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    backgroundColor: APPLE.glass,
  },
  compassN: {
    position: "absolute",
    top: 3,
    fontSize: 9,
    fontWeight: "600",
    color: APPLE.textSecondary,
  },
});
