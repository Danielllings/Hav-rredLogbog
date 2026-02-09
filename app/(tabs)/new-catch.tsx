import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Alert,
  ScrollView,
  Platform,
  StyleSheet,
  Modal,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, {
  Marker,
  MapPressEvent,
  UrlTile,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { addCatch } from "../../lib/catches";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { useLanguage } from "../../lib/i18n";

// HENT TRACKED TURE (til vejrdata-link)
import { getTrackedTrips, TrackedTrip } from "../../lib/trips";

// Ortofoto fra Dataforsyningen
import { ORTO_FORAAR_URL } from "../../lib/maps";

// Spots fra spot-weather
import { listSpots, type Spot } from "../../lib/spots";

type LatLng = { latitude: number; longitude: number };

// --- TEMAFARVER (matcher index.tsx) ---
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  primary: "#FFFFFF",
  primaryText: "#000000",

  saveGreen: "#22C55E", // samme som startGreen
  calendarAccent: "#F59E0B", // samme som graphYellow

  text: "#FFFFFF",
  textSec: "#A1A1AA",
  danger: "#FF453A",
  inputBg: "#2C2C2E",
  border: "#2C2C2E",
  ghost: "#333333",
};

// --- MØRKT KORT STIL ---
// --- Kort stilarter (lys på Android for bedre synlighed) ---
const LIGHT_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [{ color: "#f5f5f5" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f5f5f5" }],
  },
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
  {
    elementType: "geometry",
    stylers: [{ color: "#242f3e" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#746855" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#242f3e" }],
  },
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

function isoDay(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} kl. ${d
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      .replace(":", ".")}`;
  } catch {
    return iso;
  }
}

export default function NewCatch() {
  const router = useRouter();
  const { t } = useLanguage();

  // form state
  const [photo, setPhoto] = useState<string | undefined>();
  const [date, setDate] = useState<Date>(new Date());
  const [len, setLen] = useState("");
  const [kg, setKg] = useState("");
  const [bait, setBait] = useState("");
  const [locationDesc, setLocationDesc] = useState("");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<string | undefined>();
  const [showPicker, setShowPicker] = useState(false);

  // søgefelt til kortet
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // tracked ture / vejrdata-link
  const [trackedTrips, setTrackedTrips] = useState<TrackedTrip[]>([]);
  const [trackedModalVisible, setTrackedModalVisible] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTripLabel, setSelectedTripLabel] = useState<string | null>(
    null
  );

  // spots til lokationsvalg
  const [spots, setSpots] = useState<Spot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotModalVisible, setSpotModalVisible] = useState(false);
  const [spotSearch, setSpotSearch] = useState("");
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  const loadTrackedTrips = useCallback(async () => {
    try {
      const rows = await getTrackedTrips();
      setTrackedTrips(rows || []);
    } catch (e: any) {
      console.log("Kunne ikke hente tracked ture", e?.message);
      setTrackedTrips([]);
    }
  }, []);

  const loadSpots = useCallback(async () => {
    try {
      setSpotsLoading(true);
      const s = await listSpots();
      setSpots(s || []);
    } catch (e) {
      console.log("Kunne ikke hente spots", e);
      setSpots([]);
    } finally {
      setSpotsLoading(false);
    }
  }, []);

  const filteredSpots = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((sp) => (sp.name || "").toLowerCase().includes(q));
  }, [spots, spotSearch]);

  // nulstil formular ved fokus
  const resetForm = useCallback(() => {
    setPhoto(undefined);
    setDate(new Date());
    setLen("");
    setKg("");
    setBait("");
    setLocationDesc("");
    setPos(null);
    setTimeOfDay(undefined);
    setShowPicker(false);
    setSearchText("");
    setSearchLoading(false);
    setSelectedTripId(null);
    setSelectedTripLabel(null);
    setSpotSearch("");
    setSelectedSpotId(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetForm();
      loadTrackedTrips();
      loadSpots();
      return () => {};
    }, [resetForm, loadTrackedTrips, loadSpots])
  );

  useEffect(() => {
    // sikkerhedsnet hvis skærmen åbnes uden fokus-callback
    loadSpots();
  }, [loadSpots]);

  async function pick() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("accessDenied"), t("appNeedsPhotoAccess"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.length) {
      setPhoto(res.assets[0].uri);
    }
  }

  async function useCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("accessDenied"), t("appNeedsLocationAccess"));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  }

  function onMapPress(e: MapPressEvent) {
    setPos(e.nativeEvent.coordinate);
  }

  async function searchOnMap() {
    const q = searchText.trim();
    if (!q) return;

    try {
      setSearchLoading(true);
      const results = await Location.geocodeAsync(q);
      if (!results || results.length === 0) {
        Alert.alert(
          t("nothingFound"),
          t("couldNotFindLocation")
        );
        return;
      }
      const r = results[0];
      const newPos = { latitude: r.latitude, longitude: r.longitude };
      setPos(newPos);
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("couldNotLookupLocation"));
    } finally {
      setSearchLoading(false);
    }
  }

  async function save() {
    try {
      if (!photo) {
        Alert.alert(t("photoMissing"), t("selectPhotoBeforeSave"));
        return;
      }

      const parsedLength =
        len.trim() !== "" ? parseFloat(len.replace(",", ".")) : null;
      const parsedWeight =
        kg.trim() !== "" ? parseFloat(kg.replace(",", ".")) : null;

      await addCatch({
        date: `${isoDay(date)}T00:00:00.000Z`,
        length_cm: Number.isFinite(parsedLength as number)
          ? (parsedLength as number)
          : null,
        weight_kg: Number.isFinite(parsedWeight as number)
          ? (parsedWeight as number)
          : null,
        bait: bait.trim() !== "" ? bait : null,
        notes: locationDesc.trim() !== "" ? locationDesc : null,
        photo_uri: photo,
        lat: pos?.latitude ?? null,
        lng: pos?.longitude ?? null,
        time_of_day: timeOfDay ?? null,
        trip_id: selectedTripId ?? null,
      });

      router.push("/catches");
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("couldNotSaveCatch"));
    }
  }

  function cancel() {
    router.back();
  }

  function handleSelectSpot(spot: Spot) {
    setSelectedSpotId(spot.id);
    setLocationDesc(spot.name || "");
    if (
      typeof (spot as any).lat === "number" &&
      typeof (spot as any).lng === "number"
    ) {
      setPos({ latitude: (spot as any).lat, longitude: (spot as any).lng });
    }
    setSpotModalVisible(false);
  }

  function clearSpotSelection() {
    setSelectedSpotId(null);
    setLocationDesc("");
    setSpotModalVisible(false);
  }

  const timeOptions = [
    { key: "morning", label: t("morning") },
    { key: "lateMorning", label: t("lateMorning") },
    { key: "afternoon", label: t("afternoon") },
    { key: "evening", label: t("evening") },
    { key: "night", label: t("night") },
  ];

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      {/* MODAL: vælg tracked tur til vejrdata */}
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
                  const label =
                    trip.title && trip.title.trim().length > 0
                      ? `${fmtDateTime(trip.started_at)} – ${trip.title}`
                      : fmtDateTime(trip.started_at);

                  const active = selectedTripId === trip.id;

                  return (
                    <Pressable
                      key={trip.id}
                      style={[
                        styles.tripItem,
                        active && styles.tripItemActive,
                      ]}
                      onPress={() => {
                        setSelectedTripId(trip.id);
                        setSelectedTripLabel(label);
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
                    setSelectedTripId(null);
                    setSelectedTripLabel(null);
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

      {/* MODAL: vælg spot / lokation – samme liste-UI som i trips/id */}
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

            {/* søg-felt (samme stil som trips/id) */}
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
                  const active = selectedSpotId === s.id;
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
              {selectedSpotId && (
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={clearSpotSelection}
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

      <ScrollView
        style={{ flex: 1, backgroundColor: THEME.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      >
        {/* HERO – foto */}
        <View style={styles.hero}>
          {photo ? (
            <>
              <Image source={{ uri: photo }} style={styles.heroImg} />
              <Pressable style={styles.changePhotoBtn} onPress={pick}>
                <Ionicons name="image" size={16} color="#000" />
                <Text style={styles.changePhotoBtnText}>{t("changePhoto")}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.heroEmpty} onPress={pick}>
              <View style={styles.heroIconCircle}>
                <Ionicons name="camera" size={32} color={THEME.calendarAccent} />
              </View>
              <Text style={styles.heroEmptyTitle}>{t("addPhoto")}</Text>
              <Text style={styles.heroEmptyText}>
                {t("selectPhotoDesc")}
              </Text>
            </Pressable>
          )}
        </View>

        {/* KORT 1: DATA */}
        <View style={styles.card}>
          <Text style={styles.title}>{t("newCatch")}</Text>

          {/* Dato */}
          <Text style={styles.sectionLabel}>{t("date")}</Text>
          <Pressable
            style={styles.dateInput}
            onPress={() => setShowPicker((prev) => !prev)}
          >
            <Ionicons name="calendar" size={18} color={THEME.textSec} />
            <Text style={styles.dateText}>{isoDay(date)}</Text>
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              themeVariant="dark"
              textColor="#FFF"
              accentColor={THEME.calendarAccent}
              onChange={(e, d) => {
                if (Platform.OS !== "ios") setShowPicker(false);
                if (d) setDate(d);
              }}
            />
          )}

          {/* TRACKET DATO / TUR TIL VEJRDATA */}
          <Text style={styles.sectionLabel}>
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
            style={{ fontSize: 12, color: THEME.textSec, marginBottom: 12 }}
          >
            {t("trackedTripHint")}
          </Text>

          <Text style={styles.sectionLabel}>{t("timeOfDay")}</Text>
          <View style={styles.chipRow}>
            {timeOptions.map((option) => {
              const active = timeOfDay === option.label;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setTimeOfDay(active ? undefined : option.label)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={active ? styles.chipActiveText : styles.chipText}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t("lengthCm")}
                value={len}
                onChangeText={setLen}
                keyboardType="decimal-pad"
                placeholder="fx 55,6"
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t("weightKg")}
                value={kg}
                onChangeText={setKg}
                keyboardType="decimal-pad"
                placeholder="fx 2,1"
              />
            </View>
          </View>

          <LabeledInput
            label={t("baitFly")}
            value={bait}
            onChangeText={setBait}
            placeholder="fx Sandeel, Silling …"
          />

          {/* LOKATION VIA SPOTS */}
          <Text style={styles.sectionLabel}>{t("location")}</Text>
          <Pressable
            style={styles.dateInput}
            onPress={() => setSpotModalVisible(true)}
          >
            <Ionicons name="location" size={18} color={THEME.textSec} />
            <Text style={styles.dateText}>
              {locationDesc ? locationDesc : t("addLocation")}
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

        {/* KORT 2: FANGSTSTED */}
        <View style={styles.card}>
          <Text style={styles.title}>{t("catchLocation")}</Text>

          <View style={styles.locationBtnRow}>
            <Pressable onPress={useCurrentLocation} style={styles.locationBtn}>
              <Ionicons name="locate" size={16} color={THEME.text} />
              <Text style={styles.locationBtnText}>{t("myPosition")}</Text>
            </Pressable>
            {pos && (
              <Pressable onPress={() => setPos(null)} style={styles.locationBtn}>
                <Ionicons name="close" size={16} color={THEME.textSec} />
                <Text style={styles.locationBtnText}>{t("clear")}</Text>
              </Pressable>
            )}
          </View>

          {/* SØG PÅ KORTET */}
          <View style={styles.mapSearchRow}>
            <Ionicons name="search" size={18} color={THEME.textSec} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t("searchPlaceOrAddress")}
              placeholderTextColor={THEME.textSec}
              style={styles.mapSearchInput}
              returnKeyType="search"
              onSubmitEditing={searchOnMap}
            />
            <Pressable
              onPress={searchOnMap}
              disabled={searchLoading}
              style={styles.mapSearchBtn}
            >
              <Text style={styles.mapSearchBtnText}>
                {searchLoading ? "..." : t("search")}
              </Text>
            </Pressable>
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

        {/* KNAPPER */}
        <View style={styles.actionRow}>
          <Pressable style={styles.cancelBtn} onPress={cancel}>
            <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark" size={20} color="#000" />
            <Text style={styles.saveBtnText}>{t("saveCatch")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

function LabeledInput(props: any) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={THEME.textSec}
        style={[styles.textInput, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  heroEmpty: {
    width: "100%",
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.inputBg,
  },
  heroIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroEmptyTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  heroEmptyText: {
    color: THEME.textSec,
    fontSize: 14,
  },
  changePhotoBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
    backgroundColor: THEME.calendarAccent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changePhotoBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 14,
  },

  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },

  primary: { backgroundColor: THEME.primary },
  primaryText: { color: THEME.primaryText, fontSize: 16, fontWeight: "700" },

  primaryYellow: {
    backgroundColor: THEME.calendarAccent,
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  cancelBtn: {
    flex: 0.4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  cancelBtnText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: THEME.saveGreen,
  },
  saveBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },

  ghost: { backgroundColor: THEME.ghost },
  ghostText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },

  locationBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  locationBtnText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "500",
  },

  mapSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 12,
  },
  mapSearchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
  },
  mapSearchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: THEME.calendarAccent,
    borderRadius: 8,
  },
  mapSearchBtnText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 13,
  },
  mapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#18181B",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  chipActive: {
    backgroundColor: THEME.calendarAccent,
    borderColor: THEME.calendarAccent,
  },
  chipText: { color: THEME.text, fontWeight: "600", fontSize: 14 },
  chipActiveText: { color: "#000", fontWeight: "700", fontSize: 14 },

  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.inputBg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  dateText: { color: THEME.text, fontSize: 15, flex: 1 },

  textInput: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.inputBg,
  },

  // modal-styles
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
    fontSize: 16,
    color: "#CCC",
    marginBottom: 20,
    lineHeight: 24,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },

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

  // spot-liste (matcher trips/id)
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    borderColor: THEME.cardBorder,
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
