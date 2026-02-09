// app/(tabs)/catches.tsx

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  StatusBar,
} from "react-native";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { listCatches } from "../../lib/catches";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

// --- TEMAFARVER ---
const THEME = {
  bg: "#121212", // Helt mørk baggrund
  card: "#1E1E1E", // Lidt lysere mørk til kort
  primary: "#FFFFFF", // HVID til aktive chips / primærknap
  primaryText: "#000000", // SORT tekst på hvide chips

  calendarAccent: "#F59E0B", // GUL til kalenderen / tema-gul

  text: "#FFFFFF", // Hvid tekst generelt
  textSec: "#A1A1AA", // Grå sekundær tekst
  inputBg: "#2C2C2E", // Mørk input baggrund
  border: "#333333", // Mørk kant
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

function isoDay(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

// Mulige størrelsesfiltre
const sizeFilters = [
  { label: "Alle", cm: 0 },
  { label: "40 cm+", cm: 40 },
  { label: "50 cm+", cm: 50 },
  { label: "60 cm+", cm: 60 },
  { label: "70 cm+", cm: 70 },
];

export default function Catches() {
  const [rows, setRows] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [minLen, setMinLen] = useState<number>(0); // Minimumslængde (cm)
  const [showPicker, setShowPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // pop-down filtre

  async function load(dateStr?: string, minLength?: number) {
    setRows(await listCatches(dateStr, minLength));
  }

  // Første load uden filter
  useEffect(() => {
    load();
  }, []);

  // Genindlæs når skærmen får fokus, eller når filtre ændres
  useFocusEffect(
    useCallback(() => {
      load(selectedDate ? isoDay(selectedDate) : undefined, minLen);
    }, [selectedDate, minLen])
  );

  const clearDate = () => {
    setSelectedDate(null);
  };

  const handleMinLenChange = (newMinLen: number) => {
    setMinLen(newMinLen);
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.root}>
        {/* HEADER + ACTIONS */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Pressable
              style={styles.filterToggle}
              onPress={() => setShowFilters((prev) => !prev)}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={THEME.primaryText}
              />
              <Text style={styles.filterToggleText}>Filtre</Text>
              <Ionicons
                name={showFilters ? "chevron-up" : "chevron-down"}
                size={16}
                color={THEME.primaryText}
              />
            </Pressable>
            <Text style={styles.headerSub}>
              Se dine fangster, filtrér på dato og længde.
            </Text>
          </View>

          <Link href="/new-catch" asChild>
            <Pressable style={styles.addButton}>
              <Ionicons name="add" size={18} color={THEME.primaryText} />
              <Text style={styles.addButtonText}>Ny fangst</Text>
            </Pressable>
          </Link>
        </View>

        {/* POP-DOWN FILTERKORT */}
        {showFilters && (
          <View style={styles.filterCard}>
            {/* Dato + længde i samme kort */}
            <Text style={styles.filterTitle}>Filtre</Text>

            {/* Dato-filter */}
            <View style={styles.filterRow}>
              <Pressable
                style={styles.filterInput}
                onPress={() => setShowPicker((prev) => !prev)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={THEME.textSec}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.filterLabel}>Dato</Text>
                  <Text style={styles.filterValue}>
                    {selectedDate
                      ? fmtDate(isoDay(selectedDate))
                      : "Alle datoer"}
                  </Text>
                </View>
                <Ionicons
                  name={showPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={THEME.textSec}
                />
              </Pressable>

              {selectedDate && (
                <Pressable style={styles.clearBtn} onPress={clearDate}>
                  <Ionicons name="close" size={18} color={THEME.text} />
                </Pressable>
              )}
            </View>

            {showPicker && (
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={selectedDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  themeVariant="dark"
                  textColor="#FFF"
                  accentColor={THEME.calendarAccent}
                  onChange={(e, d) => {
                    if (Platform.OS !== "ios") setShowPicker(false);
                    if (d) setSelectedDate(d);
                  }}
                />
              </View>
            )}

            {/* Størrelsesfilter (chips) */}
            <View style={styles.sizeFilterHeader}>
              <Text style={styles.filterTitleSmall}>Minimumslængde</Text>
              {minLen > 0 && (
                <Text style={styles.filterActiveInfo}>{minLen} cm+</Text>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {sizeFilters.map((filter) => (
                <Pressable
                  key={filter.cm}
                  onPress={() => handleMinLenChange(filter.cm)}
                  style={[
                    styles.chip,
                    minLen === filter.cm && styles.chipActive,
                  ]}
                >
                  <Text
                    style={
                      minLen === filter.cm
                        ? styles.chipActiveText
                        : styles.chipText
                    }
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* LILLE OPSUMMERING */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Fangster</Text>
                <Text style={styles.summaryValue}>{rows.length}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Filter</Text>
                <Text style={styles.summaryValue}>
                  {minLen > 0 ? `${minLen} cm+` : "Alle størrelser"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* LISTE OVER FANGSTER */}
        <FlatList
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="fish-outline" size={36} color={THEME.calendarAccent} />
              </View>
              <Text style={styles.emptyTitle}>Ingen fangster endnu</Text>
              <Text style={styles.emptyText}>
                Tryk på "Ny fangst" for at registrere din første havørred.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={`/catch/${item.id}`} asChild>
              <Pressable style={styles.card}>
                {/* Billede */}
                <View style={styles.cardImageWrapper}>
                  {item.photo_uri ? (
                    <Image
                      source={{ uri: item.photo_uri }}
                      style={styles.cardImage}
                    />
                  ) : (
                    <View style={[styles.cardImage, styles.placeholderImage]}>
                      <Ionicons
                        name="fish-outline"
                        size={32}
                        color={THEME.textSec}
                      />
                    </View>
                  )}
                </View>

                {/* Indhold */}
                <View style={styles.cardBody}>
                  {/* Header: Størrelse + chevron */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardSizeRow}>
                      <Text style={styles.cardSize}>
                        {item.length_cm ? `${item.length_cm}` : "—"}
                      </Text>
                      <Text style={styles.cardSizeUnit}>cm</Text>
                      {item.weight_kg && (
                        <Text style={styles.cardWeight}>
                          · {item.weight_kg} kg
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={THEME.textSec}
                    />
                  </View>

                  {/* Dato og tid */}
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardDate}>{fmtDate(item.date)}</Text>
                    {item.time_of_day && (
                      <View style={styles.cardTimeBadge}>
                        <Text style={styles.cardTimeText}>{item.time_of_day}</Text>
                      </View>
                    )}
                  </View>

                  {/* Detaljer */}
                  <View style={styles.cardDetails}>
                    {item.notes && (
                      <View style={styles.cardDetailRow}>
                        <Ionicons
                          name="location"
                          size={14}
                          color={THEME.calendarAccent}
                        />
                        <Text numberOfLines={1} style={styles.cardDetailText}>
                          {item.notes}
                        </Text>
                      </View>
                    )}
                    {item.bait && (
                      <View style={styles.cardDetailRow}>
                        <View style={styles.agnBadge}>
                          <Text style={styles.agnBadgeText}>Agn</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.cardDetailText}>
                          {item.bait}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            </Link>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  // HEADER
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 52 : 24,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerSub: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 6,
  },

  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: THEME.primary,
  },
  filterToggleText: {
    color: THEME.primaryText,
    fontSize: 13,
    fontWeight: "700",
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.calendarAccent, // TEMA-GUL TIL "NY FANGST"
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 4,
  },
  addButtonText: {
    color: THEME.primaryText,
    fontWeight: "700",
    fontSize: 13,
  },

  // FILTERKORT (pop-down)
  filterCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: THEME.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  filterTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  filterTitleSmall: {
    color: THEME.textSec,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  filterInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.inputBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  filterLabel: {
    fontSize: 11,
    color: THEME.textSec,
    textTransform: "uppercase",
  },
  filterValue: {
    color: THEME.text,
    fontSize: 14,
    marginTop: 2,
  },
  clearBtn: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  datePickerWrapper: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: THEME.inputBg,
  },
  sizeFilterHeader: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterActiveInfo: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "600",
  },

  // Chips
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: THEME.inputBg,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chipActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  chipText: {
    color: THEME.text,
    fontWeight: "600",
    fontSize: 13,
  },
  chipActiveText: {
    color: THEME.primaryText,
    fontWeight: "700",
    fontSize: 13,
  },

  summaryRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    color: THEME.textSec,
    fontSize: 11,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },

  // LISTE
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },

  // Card
  card: {
    flexDirection: "row",
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardImageWrapper: {
    marginRight: 14,
  },
  cardImage: {
    width: 100,
    height: 120,
    borderRadius: 14,
    backgroundColor: "#000",
  },
  placeholderImage: {
    backgroundColor: THEME.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },

  cardBody: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardSizeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  cardSize: {
    fontSize: 28,
    fontWeight: "700",
    color: THEME.text,
    letterSpacing: -1,
  },
  cardSizeUnit: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.text,
    marginLeft: 2,
  },
  cardWeight: {
    fontSize: 14,
    fontWeight: "500",
    color: THEME.textSec,
    marginLeft: 6,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardDate: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.text,
  },
  cardTimeBadge: {
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textSec,
  },
  cardDetails: {
    gap: 4,
  },
  cardDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardDetailText: {
    color: THEME.textSec,
    fontSize: 13,
    flexShrink: 1,
  },
  agnBadge: {
    backgroundColor: THEME.inputBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agnBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: THEME.textSec,
    textTransform: "uppercase",
  },

  // Tom tilstand
  emptyState: {
    marginTop: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: THEME.textSec,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
