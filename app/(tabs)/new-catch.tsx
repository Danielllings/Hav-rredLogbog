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
import * as ImagePicker from "expo-image-picker";
import { addCatch } from "../../lib/catches";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

// HENT TRACKED TURE (til vejrdata-link)
import { getTrackedTrips, TrackedTrip } from "../../lib/trips";

// Spots fra spot-weather
import { listSpots, type Spot } from "../../lib/spots";

type LatLng = { latitude: number; longitude: number };

// --- NERO TEMA ---
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",

  primary: "#FFFFFF",
  primaryText: "#0D0D0F",

  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  accentBorder: "#F59E0B40",

  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",

  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",

  inputBg: "#1E1E21",
  border: "#2A2A2E",
  ghost: "#1E1E21",
};

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
  const { theme } = useTheme();

  // form state
  const [photo, setPhoto] = useState<string | undefined>();
  const [date, setDate] = useState<Date>(new Date());
  const [len, setLen] = useState("");
  const [kg, setKg] = useState("");
  const [bait, setBait] = useState("");
  const [locationDesc, setLocationDesc] = useState("");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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
      // console.log("Kunne ikke hente tracked ture", e?.message);
      setTrackedTrips([]);
    }
  }, []);

  const loadSpots = useCallback(async () => {
    try {
      setSpotsLoading(true);
      const s = await listSpots();
      setSpots(s || []);
    } catch (e) {
      // console.log("Kunne ikke hente spots", e);
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
    setShowPicker(false);
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
        time_of_day: null, // Fjernet fra UI
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
                style={[styles.btn, styles.primaryAccent]}
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
                style={[styles.btn, styles.primaryAccent]}
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
                <Ionicons name="camera" size={32} color={theme.primary} />
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
              accentColor={THEME.accent}
              onChange={(e, d) => {
                if (Platform.OS !== "ios") setShowPicker(false);
                if (d) setDate(d);
              }}
            />
          )}

          {/* TRACKET TUR TIL VEJRDATA - Highlighted */}
          <View style={styles.trackedTripCard}>
            <View style={styles.trackedTripHeader}>
              <Ionicons name="analytics" size={20} color={THEME.accent} />
              <Text style={styles.trackedTripTitle}>
                {t("trackedTripOptional")}
              </Text>
            </View>
            <Text style={styles.trackedTripHint}>
              {t("trackedTripHint")}
            </Text>
            <Pressable
              style={styles.trackedTripButton}
              onPress={() => setTrackedModalVisible(true)}
            >
              <Ionicons name="navigate-circle" size={20} color={THEME.accent} />
              <Text style={styles.trackedTripButtonText}>
                {selectedTripLabel ?? t("selectTrackedTripOptional")}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
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

        </View>

        {/* LOKATION */}
        <View style={styles.card}>
          <View style={styles.locationHeader}>
            <View style={styles.locationIconCircle}>
              <Ionicons name="location" size={22} color={THEME.accent} />
            </View>
            <View>
              <Text style={styles.title}>{t("location")}</Text>
              <Text style={styles.locationSubtitle}>
                {t("selectFromYourSpots")}
              </Text>
            </View>
          </View>

          {/* Valgt spot eller vælg-knap */}
          {selectedSpotId && locationDesc ? (
            <View style={styles.selectedSpotCard}>
              <View style={styles.selectedSpotInfo}>
                <Ionicons name="location" size={20} color={THEME.accent} />
                <Text style={styles.selectedSpotName}>{locationDesc}</Text>
              </View>
              <Pressable
                style={styles.changeSpotBtn}
                onPress={() => setSpotModalVisible(true)}
              >
                <Text style={styles.changeSpotBtnText}>{t("change")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.selectSpotBtn}
              onPress={() => setSpotModalVisible(true)}
            >
              <Ionicons name="add-circle" size={22} color={THEME.accent} />
              <Text style={styles.selectSpotBtnText}>{t("selectSpot")}</Text>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
          )}

          {spots.length === 0 && !spotsLoading && (
            <View style={styles.noSpotsHint}>
              <Ionicons name="information-circle" size={18} color={THEME.textSec} />
              <Text style={styles.noSpotsHintText}>
                {t("noSpotsYet")}
              </Text>
            </View>
          )}
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
    marginBottom: 12,
    position: "relative",
  },
  heroImg: { width: "100%", height: 280 },
  heroEmpty: {
    width: "100%",
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.elevated,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroEmptyTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "600",
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
    backgroundColor: THEME.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changePhotoBtnText: {
    color: THEME.primaryText,
    fontWeight: "600",
    fontSize: 14,
  },

  card: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
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
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  primary: { backgroundColor: THEME.primary },
  primaryText: { color: THEME.primaryText, fontSize: 15, fontWeight: "600" },

  primaryAccent: {
    backgroundColor: THEME.accent,
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
    height: 56,
    borderRadius: 16,
    backgroundColor: THEME.elevated,
  },
  cancelBtnText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: THEME.accent,
  },
  saveBtnText: {
    color: THEME.primaryText,
    fontSize: 17,
    fontWeight: "600",
  },

  ghost: { backgroundColor: THEME.elevated },
  ghostText: { color: THEME.text, fontSize: 15, fontWeight: "600" },

  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.elevated,
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
    backgroundColor: THEME.elevated,
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
    backgroundColor: THEME.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
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
    backgroundColor: THEME.accent,
    borderRadius: 8,
  },
  mapSearchBtnText: {
    color: THEME.primaryText,
    fontWeight: "600",
    fontSize: 13,
  },
  mapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: THEME.elevated,
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
    backgroundColor: THEME.elevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: THEME.accentMuted,
    borderColor: THEME.accentBorder,
  },
  chipText: { color: THEME.textSec, fontWeight: "600", fontSize: 14 },
  chipActiveText: { color: THEME.accent, fontWeight: "600", fontSize: 14 },

  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: THEME.elevated,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateText: { color: THEME.text, fontSize: 15, flex: 1 },

  // Tracked trip card - highlighted
  trackedTripCard: {
    backgroundColor: THEME.accentMuted,
    borderWidth: 1,
    borderColor: THEME.accentBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  trackedTripHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  trackedTripTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  trackedTripHint: {
    fontSize: 12,
    color: THEME.textSec,
    marginBottom: 12,
    lineHeight: 18,
  },
  trackedTripButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: THEME.elevated,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  trackedTripButtonText: {
    color: THEME.text,
    fontSize: 15,
    flex: 1,
  },

  textInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.elevated,
  },

  // modal-styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
  },
  modalBoxTall: {
    width: "100%",
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    color: THEME.text,
  },
  modalText: {
    fontSize: 15,
    color: THEME.textSec,
    marginBottom: 16,
    lineHeight: 22,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },

  tripItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: THEME.elevated,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripItemActive: {
    backgroundColor: THEME.accent,
  },
  tripItemText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "500",
  },
  tripItemTextActive: {
    color: THEME.primaryText,
    fontSize: 14,
    fontWeight: "600",
  },

  // spot-liste
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  spotSearchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
  },
  spotItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: THEME.elevated,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotItemActive: {
    backgroundColor: THEME.accent,
  },
  spotItemText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "500",
  },
  spotItemTextActive: {
    color: THEME.primaryText,
    fontSize: 14,
    fontWeight: "600",
  },

  // Enhanced location section
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
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  locationSubtitle: {
    color: THEME.textSec,
    fontSize: 13,
    marginTop: 2,
  },
  selectedSpotCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.accentMuted,
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
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  changeSpotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: THEME.accent,
    borderRadius: 10,
  },
  changeSpotBtnText: {
    color: THEME.primaryText,
    fontSize: 13,
    fontWeight: "600",
  },
  selectSpotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
  },
  selectSpotBtnText: {
    color: THEME.accent,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  noSpotsHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  noSpotsHintText: {
    color: THEME.textTertiary,
    fontSize: 13,
    flex: 1,
  },
});
