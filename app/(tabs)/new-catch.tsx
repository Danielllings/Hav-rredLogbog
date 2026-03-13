import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
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
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";

// Komponenter
import { GlassCard } from "../../components/statistics/GlassCard";
import { CatchHeroPhoto, CatchStatsRow, CatchInputCard } from "../../components/catch";
import { APPLE } from "../../constants/appleTheme";

// HENT TRACKED TURE (til vejrdata-link)
import { getTrackedTrips, TrackedTrip } from "../../lib/trips";

// Spots fra spot-weather
import { listSpots, type Spot } from "../../lib/spots";

type LatLng = { latitude: number; longitude: number };

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
      setTrackedTrips([]);
    }
  }, []);

  const loadSpots = useCallback(async () => {
    try {
      setSpotsLoading(true);
      const s = await listSpots();
      setSpots(s || []);
    } catch (e) {
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
        time_of_day: null,
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
      <StatusBar barStyle="light-content" backgroundColor={APPLE.bg} />

      {/* MODAL: vaelg tracked tur til vejrdata */}
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
                  const label =
                    trip.title && trip.title.trim().length > 0
                      ? `${fmtDateTime(trip.started_at)} - ${trip.title}`
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

            {/* soeg-felt */}
            <View style={styles.spotSearchRow}>
              <Ionicons
                name="search"
                size={18}
                color={APPLE.textSecondary}
                style={{ marginRight: 6 }}
              />
              <TextInput
                value={spotSearch}
                onChangeText={setSpotSearch}
                placeholder={t("searchSpotName")}
                placeholderTextColor={APPLE.textSecondary}
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
                  <ActivityIndicator color={APPLE.accent} />
                </View>
              ) : filteredSpots.length === 0 ? (
                <Text style={{ color: APPLE.textSecondary, fontSize: 14 }}>
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
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO FOTO */}
        <CatchHeroPhoto
          photoUri={photo}
          onPickPhoto={pick}
          showEditButton={!!photo}
        />

        {/* STATS ROW: Laengde | Vaegt */}
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
              <Text style={styles.dateText}>{isoDay(date)}</Text>
              <Ionicons name="chevron-down" size={18} color={APPLE.textSecondary} />
            </Pressable>

            {showPicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                themeVariant="dark"
                textColor="#FFF"
                accentColor={APPLE.accent}
                onChange={(e, d) => {
                  if (Platform.OS !== "ios") setShowPicker(false);
                  if (d) setDate(d);
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
          placeholder="fx Sandeel, Silling ..."
          icon="fish"
          delay={300}
        />

        {/* SPOT SELECTOR */}
        <Animated.View entering={FadeInUp.delay(400).duration(400).springify()}>
          <GlassCard style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <View style={styles.locationIconCircle}>
                <Ionicons name="location" size={22} color={APPLE.accent} />
              </View>
              <View style={styles.locationTitleContainer}>
                <Text style={styles.locationTitle}>{t("location")}</Text>
                <Text style={styles.locationSubtitle}>
                  {t("selectFromYourSpots")}
                </Text>
              </View>
            </View>

            {/* Valgt spot eller vaelg-knap */}
            {selectedSpotId && locationDesc ? (
              <View style={styles.selectedSpotCard}>
                <View style={styles.selectedSpotInfo}>
                  <Ionicons name="location" size={20} color={APPLE.accent} />
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
                <Ionicons name="add-circle" size={22} color={APPLE.accent} />
                <Text style={styles.selectSpotBtnText}>{t("selectSpot")}</Text>
                <Ionicons name="chevron-forward" size={18} color={APPLE.textSecondary} />
              </Pressable>
            )}

            {spots.length === 0 && !spotsLoading && (
              <View style={styles.noSpotsHint}>
                <Ionicons name="information-circle" size={18} color={APPLE.textSecondary} />
                <Text style={styles.noSpotsHintText}>
                  {t("noSpotsYet")}
                </Text>
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* TRIP LINK (valgfri) */}
        <Animated.View entering={FadeInUp.delay(500).duration(400).springify()}>
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

        {/* GEM/ANNULLER KNAPPER */}
        <Animated.View
          entering={FadeInDown.delay(600).duration(400).springify()}
          style={styles.actionRow}
        >
          <Pressable style={styles.cancelBtn} onPress={cancel}>
            <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark" size={20} color={APPLE.bg} />
            <Text style={styles.saveBtnText}>{t("saveCatch")}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </>
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

  // Dato card
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

  // Location card
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
    color: APPLE.text,
    fontSize: 15,
    fontWeight: "600",
  },
  changeSpotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: APPLE.accent,
    borderRadius: 10,
  },
  changeSpotBtnText: {
    color: APPLE.bg,
    fontSize: 13,
    fontWeight: "600",
  },
  selectSpotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: APPLE.glass,
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    borderStyle: "dashed",
  },
  selectSpotBtnText: {
    color: APPLE.accent,
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
    color: APPLE.textTertiary,
    fontSize: 13,
    flex: 1,
  },

  // Trip card
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

  // Action buttons
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
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  cancelBtnText: {
    color: APPLE.textSecondary,
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
    backgroundColor: APPLE.accent,
  },
  saveBtnText: {
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

  // Trip list
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

  // Spot search
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: APPLE.glass,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  spotSearchInput: {
    flex: 1,
    color: APPLE.text,
    fontSize: 15,
  },
  spotItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: APPLE.glass,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotItemActive: {
    backgroundColor: APPLE.accent,
  },
  spotItemText: {
    color: APPLE.text,
    fontSize: 14,
    fontWeight: "500",
  },
  spotItemTextActive: {
    color: APPLE.bg,
    fontSize: 14,
    fontWeight: "600",
  },
});
