import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  StatusBar,
  Modal,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { saveTrip } from "../../lib/trips";
import { listSpots, type SpotRow } from "../../lib/spots";

type TripPayload = Parameters<typeof saveTrip>[0];

const THEME = {
  bg: "#121212",
  card: "#1E1E1E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  border: "#2C2C2E",
  primary: "#F59E0B",
  danger: "#FF453A",
  inputBg: "#2C2C2E",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];

type MonthRow = {
  month: number;
  enabled: boolean;
  fish: string;
  trips: string; // ture med fisk
  nullTrips: string; // nulture
};

type TripDraft = {
  id: string;
  date: string;
  fish: string;
  hours: string;
  distance: string;
  spotId: string | null;
  spotName: string | null;
};

const defaultYear = new Date().getFullYear() - 1;

function makeTripDraft(year: number): TripDraft {
  return {
    id: `trip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    date: `${year}-01-15`,
    fish: "",
    hours: "2",
    distance: "0",
    spotId: null,
    spotName: null,
  };
}

function parsePositiveInt(val: string): number | null {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegativeInt(val: string): number | null {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseNumber(val: string, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clampDay(d: number) {
  return Math.min(28, Math.max(1, d));
}

export default function ManualImportScreen() {
  const router = useRouter();

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const [monthlyEnabled, setMonthlyEnabled] = useState(true);
  const [monthlyOpen, setMonthlyOpen] = useState(true);
  const [monthlyYear, setMonthlyYear] = useState(String(defaultYear));
  const [monthlyRows, setMonthlyRows] = useState<MonthRow[]>(() =>
    Array.from({ length: 12 }, (_, i) => ({
      month: i,
      enabled: true,
      fish: "",
      trips: "1",
      nullTrips: "",
    }))
  );
  const [monthHours, setMonthHours] = useState("2");
  const [monthDistance, setMonthDistance] = useState("0");

  const [tripDrafts, setTripDrafts] = useState<TripDraft[]>([
    makeTripDraft(defaultYear),
  ]);
  const [detailedOpen, setDetailedOpen] = useState(true);

  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotSearch, setSpotSearch] = useState("");
  const [spotModalTripId, setSpotModalTripId] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<{
    trips: number;
    fish: number;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setSpotsLoading(true);
      try {
        const res = await listSpots();
        setSpots(res);
      } catch (e) {
        console.log("Kunne ikke hente spots til import:", e);
      } finally {
        setSpotsLoading(false);
      }
    };
    load();
  }, []);

  const filteredSpots = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((s) => (s.name || "").toLowerCase().includes(q));
  }, [spotSearch, spots]);

  const totals = useMemo(() => {
    const monthFish = monthlyEnabled
      ? monthlyRows.reduce((sum, r) => {
          if (!r.enabled) return sum;
          const n = parseNonNegativeInt(r.fish);
          return sum + (n ?? 0);
        }, 0)
      : 0;

    const detailedFish = tripDrafts.reduce((sum, t) => {
      const n = parseNonNegativeInt(t.fish);
      return sum + (n ?? 0);
    }, 0);

    const monthTrips = monthlyEnabled
      ? monthlyRows.reduce((sum, r) => {
          if (!r.enabled) return sum;
          const c = parsePositiveInt(r.trips);
          const nulls = parsePositiveInt(r.nullTrips);
          const fish = parseNonNegativeInt(r.fish);
          const catchTrips = fish != null && fish > 0 ? c ?? 1 : 0;
          return sum + catchTrips + (nulls ?? 0);
        }, 0)
      : 0;

    const detailedTrips = tripDrafts.filter((t) =>
      parseNonNegativeInt(t.fish) != null
    ).length;

    return {
      fish: monthFish + detailedFish,
      trips: monthTrips + detailedTrips,
    };
  }, [monthlyRows, tripDrafts]);

  const handleUpdateMonth = (
    month: number,
    key: "fish" | "trips" | "nullTrips",
    value: string
  ) => {
    setMonthlyRows((prev) =>
      prev.map((m) => (m.month === month ? { ...m, [key]: value } : m))
    );
  };

  const handleUpdateTrip = (
    id: string,
    key: keyof TripDraft,
    value: string
  ) => {
    setTripDrafts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [key]: value } : t))
    );
  };

  const handleSelectSpot = (tripId: string, spot: SpotRow | null) => {
    setTripDrafts((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? {
              ...t,
              spotId: spot?.id ?? null,
              spotName: spot?.name ?? null,
            }
          : t
      )
    );
    setSpotModalTripId(null);
    setSpotSearch("");
  };

  const toggleMonthEnabled = (month: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMonthlyRows((prev) =>
      prev.map((m) =>
        m.month === month ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const buildMonthlyTrips = (): TripPayload[] => {
    if (!monthlyEnabled) return [];

    const trips: TripPayload[] = [];
    const yearInt = parseInt(monthlyYear, 10);
    const year = Number.isFinite(yearInt) ? yearInt : new Date().getFullYear();
    const durationSec = Math.max(900, Math.round(parseNumber(monthHours, 2) * 3600));
    const distanceM = Math.max(
      0,
      Math.round(parseNumber(monthDistance, 0) * 1000)
    );

    monthlyRows.forEach((row) => {
      if (!row.enabled) return;

      const fishTotal = parseNonNegativeInt(row.fish);
      const nullTotal = parsePositiveInt(row.nullTrips) ?? 0;
      if (fishTotal == null && nullTotal === 0) return;
      const tripCount = parsePositiveInt(row.trips) ?? 1;

      if (fishTotal > 0) {
        const basePerTrip = Math.floor(fishTotal / tripCount);
        let remainder = fishTotal - basePerTrip * tripCount;

        for (let i = 0; i < tripCount; i++) {
          const fishCount = basePerTrip + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;

          const day = clampDay(2 + i * 2);
          const start = new Date(Date.UTC(year, row.month, day, 8, 0, 0));
          const end = new Date(start.getTime() + durationSec * 1000);

          trips.push({
            start_ts: start.toISOString(),
            end_ts: end.toISOString(),
            duration_sec: durationSec,
            distance_m: distanceM,
            fish_count: fishCount,
            meta_json: JSON.stringify({
              source: "manual_import",
              mode: "monthly",
              year,
              month: row.month + 1,
            }),
          });
        }
      }

      // Nulture
      for (let i = 0; i < nullTotal; i++) {
        const day = clampDay(1 + i * 2);
        const start = new Date(Date.UTC(year, row.month, day, 6, 0, 0));
        const end = new Date(start.getTime() + durationSec * 1000);
        trips.push({
          start_ts: start.toISOString(),
          end_ts: end.toISOString(),
          duration_sec: durationSec,
          distance_m: distanceM,
          fish_count: 0,
          meta_json: JSON.stringify({
            source: "manual_import",
            mode: "monthly_null",
            year,
            month: row.month + 1,
          }),
        });
      }
    });

    return trips;
  };

  const buildDetailedTrips = (): { trips: TripPayload[]; errors: string[] } => {
    const trips: TripPayload[] = [];
    const errors: string[] = [];

    tripDrafts.forEach((draft, idx) => {
      const fish = parseNonNegativeInt(draft.fish);
      if (fish == null) return;

      const parts = draft.date.split("-").map((p) => parseInt(p, 10));
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
        errors.push(`Tur ${idx + 1}: Ugyldig dato (${draft.date}).`);
        return;
      }

      const [y, m, d] = parts;
      if (m < 1 || m > 12 || d < 1 || d > 31) {
        errors.push(`Tur ${idx + 1}: Ugyldig dato (${draft.date}).`);
        return;
      }
      const start = new Date(Date.UTC(y, m - 1, d, 8, 0, 0));
      if (isNaN(start.getTime())) {
        errors.push(`Tur ${idx + 1}: Ugyldig dato (${draft.date}).`);
        return;
      }

      const durationSec = Math.max(
        900,
        Math.round(parseNumber(draft.hours, 2) * 3600)
      );
      const distanceM = Math.max(
        0,
        Math.round(parseNumber(draft.distance, 0) * 1000)
      );

      const end = new Date(start.getTime() + durationSec * 1000);
      const spot = draft.spotId
        ? spots.find((s) => s.id === draft.spotId) || null
        : null;

      trips.push({
        start_ts: start.toISOString(),
        end_ts: end.toISOString(),
        duration_sec: durationSec,
        distance_m: distanceM,
        fish_count: fish,
        spot_id: spot?.id ?? null,
        spot_name: spot?.name ?? null,
        spot_lat: spot?.lat ?? null,
        spot_lng: spot?.lng ?? null,
        meta_json: JSON.stringify({
          source: "manual_import",
          mode: "detailed",
        }),
      });
    });

    return { trips, errors };
  };

  const handleImport = async () => {
    if (importing) return;

    const monthlyTrips = buildMonthlyTrips();
    const detailed = buildDetailedTrips();

    if (detailed.errors.length) {
      Alert.alert("Tjek dine ture", detailed.errors.join("\n"));
      return;
    }

    const payloads = [...monthlyTrips, ...detailed.trips];
    if (!payloads.length) {
      Alert.alert(
        "Ingen data",
        "Udfyld mindst én måned eller tilføj en detaljeret tur, før du importerer."
      );
      return;
    }

    setImporting(true);
    let created = 0;
    let fishTotal = 0;

    try {
      for (const p of payloads) {
        await saveTrip(p);
        created += 1;
        fishTotal += p.fish_count ?? 0;
      }

      setImportSuccess({ trips: created, fish: fishTotal });
    } catch (e: any) {
      console.log("Fejl under manuel import:", e);
      Alert.alert(
        "Fejl under import",
        e?.message ?? "Kunne ikke gemme alle ture. Prøv igen."
      );
    } finally {
      setImporting(false);
    }
  };

  const activeSpotTripId = spotModalTripId;
  const activeTrip = tripDrafts.find((t) => t.id === activeSpotTripId);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={THEME.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Manuel import</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KRAV & NOTE</Text>
          <View style={styles.card}>
            <Text style={styles.lead}>
              Brug siden til at taste gamle logbøger ind, så de tæller i din
              statistik. Vejr/fiskemønster kan ikke genskabes uden data.
            </Text>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={THEME.primary} />
              <Text style={styles.bulletText}>
                Opret spots i Vejr-kortet først, så du kan koble ture til
                rigtige lokationer.
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={THEME.primary} />
              <Text style={styles.bulletText}>
                Du kan importere både månedstal (fx fisk pr. måned) og detaljerede
                ture med spotvalg.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Pressable
              style={styles.sectionHeaderLeft}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMonthlyOpen((v) => !v);
              }}
            >
              <Text style={[styles.sectionTitle, styles.sectionTitleStrong]}>
                MANUEL HURTIG IMPORT PR. MÅNED
              </Text>
              <Ionicons
                name={monthlyOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={THEME.textSec}
              />
            </Pressable>
            <Pressable
              onPress={() => setMonthlyEnabled((v) => !v)}
              style={[
                styles.toggleChip,
                monthlyEnabled ? styles.toggleChipOn : styles.toggleChipOff,
              ]}
            >
              <Text
                style={[
                  styles.toggleChipText,
                  monthlyEnabled ? { color: "#000" } : null,
                ]}
              >
                {monthlyEnabled ? "Slå fra" : "Slå til"}
              </Text>
            </Pressable>
          </View>
          {monthlyOpen && (
            <View style={styles.card}>
              <Text style={styles.value}>
                Fravælg hvis du kun bruger detaljerede ture. Månedstal fordeles
                automatisk på simple ture. Brug “On/Off” pr. måned og felterne
                Fisk / Ture med fisk / Nulture.
              </Text>
              <Text style={styles.label}>År</Text>
              <TextInput
                value={monthlyYear}
                onChangeText={setMonthlyYear}
                keyboardType="numeric"
                style={styles.input}
                placeholder="2020"
                placeholderTextColor={THEME.textSec}
              />

              <View style={styles.rowWrap}>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Timer pr. tur (fælles)</Text>
                  <TextInput
                    value={monthHours}
                    onChangeText={setMonthHours}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="2"
                    placeholderTextColor={THEME.textSec}
                  />
                </View>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Km pr. tur (fælles)</Text>
                  <TextInput
                    value={monthDistance}
                    onChangeText={setMonthDistance}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={THEME.textSec}
                  />
                </View>
              </View>

              <View style={styles.monthGrid}>
                {monthlyRows.map((row) => (
                  <View key={row.month} style={styles.monthCard}>
                    <View style={styles.monthHeader}>
                      <Text style={styles.monthLabel}>{MONTHS[row.month]}</Text>
                      <Pressable
                        onPress={() => toggleMonthEnabled(row.month)}
                      >
                        <View
                          style={[
                            styles.switchTrack,
                            row.enabled
                              ? styles.switchTrackOn
                              : styles.switchTrackOff,
                          ]}
                        >
                          <View
                            style={[
                              styles.switchKnob,
                              row.enabled
                                ? styles.switchKnobOn
                                : styles.switchKnobOff,
                            ]}
                          />
                        </View>
                      </Pressable>
                    </View>

                    <TextInput
                      editable={row.enabled}
                      value={row.fish}
                      onChangeText={(v) =>
                        handleUpdateMonth(row.month, "fish", v)
                      }
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        !row.enabled ? styles.inputDisabled : null,
                      ]}
                      placeholder="Fisk"
                      placeholderTextColor={THEME.textSec}
                    />
                    <TextInput
                      editable={row.enabled}
                      value={row.trips}
                      onChangeText={(v) =>
                        handleUpdateMonth(row.month, "trips", v)
                      }
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        !row.enabled ? styles.inputDisabled : null,
                      ]}
                      placeholder="Ture med fisk"
                      placeholderTextColor={THEME.textSec}
                    />
                    <TextInput
                      editable={row.enabled}
                      value={row.nullTrips}
                      onChangeText={(v) =>
                        handleUpdateMonth(row.month, "nullTrips", v)
                      }
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        !row.enabled ? styles.inputDisabled : null,
                        { marginBottom: 0 },
                      ]}
                      placeholder="Nulture"
                      placeholderTextColor={THEME.textSec}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setDetailedOpen((v) => !v);
            }}
          >
            <View style={styles.sectionHeaderLeft}>
              <Text style={[styles.sectionTitle, styles.sectionTitleStrong]}>
                DETALJERET IMPORT (TURE + SPOTS)
              </Text>
              <Ionicons
                name={detailedOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={THEME.textSec}
              />
            </View>
          </Pressable>

          {detailedOpen && (
            <View style={styles.card}>
              <Text style={styles.value}>
                Tilføj gamle ture én for én med fisk, varighed, distance og
                valgfrit spot. Sæt fisk = 0 for nulture. Giver mest præcis
                statistik.
              </Text>

              {tripDrafts.map((t, idx) => (
                <View key={t.id} style={styles.tripCard}>
                  <View style={styles.tripHeader}>
                    <Text style={styles.tripTitle}>Tur #{idx + 1}</Text>
                    {tripDrafts.length > 1 && (
                      <Pressable
                        onPress={() =>
                          setTripDrafts((prev) => prev.filter((p) => p.id !== t.id))
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={THEME.textSec}
                        />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.rowWrap}>
                    <View style={styles.inputCol}>
                      <Text style={styles.label}>Dato (YYYY-MM-DD)</Text>
                      <TextInput
                        value={t.date}
                        onChangeText={(v) => handleUpdateTrip(t.id, "date", v)}
                        style={styles.input}
                        placeholder="2020-05-12"
                        placeholderTextColor={THEME.textSec}
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <Text style={styles.label}>Fisk</Text>
                      <TextInput
                        value={t.fish}
                        onChangeText={(v) => handleUpdateTrip(t.id, "fish", v)}
                        keyboardType="numeric"
                        style={styles.input}
                        placeholder="3"
                        placeholderTextColor={THEME.textSec}
                      />
                    </View>
                  </View>

                  <View style={styles.rowWrap}>
                    <View style={styles.inputCol}>
                      <Text style={styles.label}>Timer</Text>
                      <TextInput
                        value={t.hours}
                        onChangeText={(v) => handleUpdateTrip(t.id, "hours", v)}
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="2"
                        placeholderTextColor={THEME.textSec}
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <Text style={styles.label}>Kilometer</Text>
                      <TextInput
                        value={t.distance}
                        onChangeText={(v) =>
                          handleUpdateTrip(t.id, "distance", v)
                        }
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0"
                        placeholderTextColor={THEME.textSec}
                      />
                    </View>
                  </View>

                  <View style={styles.rowWrap}>
                    <Pressable
                      style={[
                        styles.spotBtn,
                        t.spotId ? styles.spotBtnActive : null,
                      ]}
                      onPress={() => setSpotModalTripId(t.id)}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={t.spotId ? "#000" : THEME.text}
                      />
                      <Text
                        style={[
                          styles.spotBtnText,
                          t.spotId ? { color: "#000" } : null,
                        ]}
                      >
                        {t.spotName ? t.spotName : "Vælg spot"}
                      </Text>
                    </Pressable>
                  </View>

                </View>
              ))}

              <Pressable
                style={({ pressed }) => [
                  styles.addBtn,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => {
                  const y = parseInt(monthlyYear, 10);
                  const targetYear = Number.isFinite(y) ? y : defaultYear;
                  setTripDrafts((prev) => [...prev, makeTripDraft(targetYear)]);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#000" />
                <Text style={styles.addBtnText}>Tilføj tur</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPSUMMERING</Text>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ture klar til import</Text>
              <Text style={styles.summaryValue}>{totals.trips}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Fisk i alt</Text>
              <Text style={styles.summaryValue}>{totals.fish}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed || importing ? { opacity: 0.85 } : null,
              ]}
              onPress={handleImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View style={styles.primaryBtnContent}>
                  <Ionicons name="cloud-upload" size={18} color="#000" />
                  <Text style={styles.primaryBtnText}>Importér data</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={!!activeSpotTripId}
        animationType="fade"
        onRequestClose={() => setSpotModalTripId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBoxTall}>
            <Text style={styles.modalTitle}>Vælg spot</Text>
            <Text style={styles.modalText}>
              Brug dine gemte spots fra Vejr-kortet, så importen lander på de
              rigtige lokationer.
            </Text>

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
                placeholder="Søg spot-navn"
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
                  Ingen spots fundet.
                </Text>
              ) : (
                filteredSpots.map((s) => {
                  const active = activeTrip?.spotId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[
                        styles.spotItem,
                        active ? styles.spotItemActive : null,
                      ]}
                      onPress={() => {
                        if (activeTrip) handleSelectSpot(activeTrip.id, s);
                      }}
                    >
                      <Text
                        style={
                          active ? styles.spotItemTextActive : styles.spotItemText
                        }
                      >
                        {s.name || "Uden navn"}
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
              {activeTrip?.spotId && (
                <Pressable
                  style={[styles.btn, styles.ghost]}
                  onPress={() => {
                    if (activeTrip) handleSelectSpot(activeTrip.id, null);
                  }}
                >
                  <Text style={styles.ghostText}>Fjern spot</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btn, styles.primaryBtn]}
                onPress={() => setSpotModalTripId(null)}
              >
                <Text style={styles.primaryText}>Luk</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={!!importSuccess}
        animationType="fade"
        onRequestClose={() => setImportSuccess(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBoxTall}>
            <Text style={styles.modalTitle}>Import gennemført</Text>
            <Text style={styles.modalText}>
              {`Tilføjede ${importSuccess?.trips ?? 0} ture med ${importSuccess?.fish ?? 0} fisk.\nStatistikken opdateres automatisk.`}
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setImportSuccess(null)}
                style={[styles.btn, styles.ghost]}
              >
                <Text style={styles.ghostText}>Bliv her</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setImportSuccess(null);
                  router.back();
                }}
                style={[styles.btn, { backgroundColor: THEME.primary }]}
              >
                <Text style={styles.primaryText}>Tilbage</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: THEME.card,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSec,
    marginBottom: 0,
  },
  sectionTitleStrong: {
    fontWeight: "800",
  },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  toggleChipOn: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  toggleChipOff: {
    backgroundColor: THEME.card,
    borderColor: THEME.border,
  },
  toggleChipText: {
    color: THEME.text,
    fontWeight: "700",
    fontSize: 12,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  lead: {
    color: THEME.text,
    fontSize: 15,
    marginBottom: 10,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  bulletText: {
    color: THEME.textSec,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  label: {
    color: THEME.text,
    fontWeight: "600",
    marginBottom: 4,
  },
  value: {
    color: THEME.textSec,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  input: {
    backgroundColor: THEME.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    borderWidth: 1,
    borderColor: THEME.border,
    fontSize: 15,
    marginBottom: 10,
  },
  rowWrap: {
    flexDirection: "row",
    gap: 10,
  },
  inputCol: {
    flex: 1,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  monthCard: {
    width: "48%",
    backgroundColor: "#181818",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  monthLabel: {
    color: THEME.text,
    fontWeight: "600",
    marginBottom: 2,
  },
  switchTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  switchTrackOn: {
    backgroundColor: THEME.primary,
    justifyContent: "flex-end",
  },
  switchTrackOff: {
    backgroundColor: THEME.border,
    justifyContent: "flex-start",
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.4)",
  },
  switchKnobOff: {
    backgroundColor: THEME.card,
    borderColor: THEME.border,
  },
  inputDisabled: {
    opacity: 0.45,
  },
  tripCard: {
    backgroundColor: "#181818",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    marginTop: 12,
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tripTitle: {
    color: THEME.text,
    fontWeight: "700",
  },
  spotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.card,
  },
  spotBtnActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  spotBtnText: {
    color: THEME.text,
    fontWeight: "600",
  },
  addBtn: {
    marginTop: 12,
    backgroundColor: THEME.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addBtnText: {
    color: "#000",
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    color: THEME.textSec,
  },
  summaryValue: {
    color: THEME.text,
    fontWeight: "700",
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: THEME.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalBoxTall: {
    backgroundColor: THEME.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  modalText: {
    color: THEME.textSec,
    fontSize: 14,
    marginBottom: 10,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  ghostText: {
    color: THEME.text,
    fontWeight: "600",
  },
  primaryText: {
    color: "#000",
    fontWeight: "700",
  },
  spotSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  spotSearchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 15,
  },
  spotItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.card,
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
    fontSize: 15,
  },
  spotItemTextActive: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
});
