// app/(tabs)/catches.tsx

import { useEffect, useState, useCallback, useRef } from "react";
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
  Animated,
  Easing,
} from "react-native";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { listCatches } from "../../lib/catches";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

// --- NERO TEMA ---
const NERO = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  border: "#2A2A2E",

  primary: "#FFFFFF",
  primaryText: "#0D0D0F",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",

  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  accentBorder: "#F59E0B40",

  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
};

// Animated Card wrapper med fade-in
function AnimatedCatchCard({
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
      Animated.delay(index * 40),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
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

// Size filters - labels will be translated in component
const sizeFilters = [
  { labelKey: "all", cm: 0 },
  { labelKey: "40cm", cm: 40 },
  { labelKey: "50cm", cm: 50 },
  { labelKey: "60cm", cm: 60 },
  { labelKey: "70cm", cm: 70 },
];

export default function Catches() {
  const { t } = useLanguage();
  const { theme } = useTheme();
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
      <StatusBar barStyle="light-content" backgroundColor={NERO.bg} />
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
                color={NERO.primaryText}
              />
              <Text style={styles.filterToggleText}>{t("filters")}</Text>
              <Ionicons
                name={showFilters ? "chevron-up" : "chevron-down"}
                size={16}
                color={NERO.primaryText}
              />
            </Pressable>
            <Text style={styles.headerSub}>
              {t("viewCatchesDesc")}
            </Text>
          </View>

          <Link href="/new-catch" asChild>
            <Pressable style={styles.addButton}>
              <Ionicons name="add" size={20} color="#000" />
              <Text style={styles.addButtonText}>{t("newCatch")}</Text>
            </Pressable>
          </Link>
        </View>

        {/* POP-DOWN FILTERKORT */}
        {showFilters && (
          <View style={styles.filterCard}>
            {/* Dato + længde i samme kort */}
            <Text style={styles.filterTitle}>{t("filters")}</Text>

            {/* Dato-filter */}
            <View style={styles.filterRow}>
              <Pressable
                style={styles.filterInput}
                onPress={() => setShowPicker((prev) => !prev)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={NERO.textSec}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.filterLabel}>{t("date")}</Text>
                  <Text style={styles.filterValue}>
                    {selectedDate
                      ? fmtDate(isoDay(selectedDate))
                      : t("allDates")}
                  </Text>
                </View>
                <Ionicons
                  name={showPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={NERO.textSec}
                />
              </Pressable>

              {selectedDate && (
                <Pressable style={styles.clearBtn} onPress={clearDate}>
                  <Ionicons name="close" size={18} color={NERO.text} />
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
                  accentColor={theme.primary}
                  onChange={(e, d) => {
                    if (Platform.OS !== "ios") setShowPicker(false);
                    if (d) setSelectedDate(d);
                  }}
                />
              </View>
            )}

            {/* Størrelsesfilter (chips) */}
            <View style={styles.sizeFilterHeader}>
              <Text style={styles.filterTitleSmall}>{t("minLength")}</Text>
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
                    {filter.labelKey === "all" ? t("all") : `${filter.cm} cm+`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* LILLE OPSUMMERING */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t("catches")}</Text>
                <Text style={styles.summaryValue}>{rows.length}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t("filter")}</Text>
                <Text style={styles.summaryValue}>
                  {minLen > 0 ? `${minLen} cm+` : t("allSizes")}
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
                <Ionicons name="fish-outline" size={36} color={theme.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t("noCatches")}</Text>
              <Text style={styles.emptyText}>
                {t("noCatchesDesc")}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <AnimatedCatchCard index={index}>
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
                        color={NERO.textSec}
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
                      color={NERO.textSec}
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
                          color={theme.primary}
                        />
                        <Text numberOfLines={1} style={styles.cardDetailText}>
                          {item.notes}
                        </Text>
                      </View>
                    )}
                    {item.bait && (
                      <View style={styles.cardDetailRow}>
                        <View style={styles.agnBadge}>
                          <Text style={styles.agnBadgeText}>{t("bait").split("/")[0]}</Text>
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
            </AnimatedCatchCard>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NERO.bg,
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
    color: NERO.textSec,
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
    backgroundColor: NERO.primary,
  },
  filterToggleText: {
    color: NERO.primaryText,
    fontSize: 13,
    fontWeight: "700",
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    backgroundColor: NERO.accent,
  },
  addButtonText: {
    color: NERO.primaryText,
    fontWeight: "700",
    fontSize: 14,
  },

  // FILTERKORT - Nero style
  filterCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: NERO.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: NERO.border,
  },
  filterTitle: {
    color: NERO.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  filterTitleSmall: {
    color: NERO.textSec,
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
    borderColor: NERO.border,
    backgroundColor: NERO.elevated,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  filterLabel: {
    fontSize: 11,
    color: NERO.textSec,
    textTransform: "uppercase",
  },
  filterValue: {
    color: NERO.text,
    fontSize: 14,
    marginTop: 2,
  },
  clearBtn: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: NERO.elevated,
    borderWidth: 1,
    borderColor: NERO.border,
    alignItems: "center",
    justifyContent: "center",
  },
  datePickerWrapper: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: NERO.elevated,
  },
  sizeFilterHeader: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterActiveInfo: {
    color: NERO.text,
    fontSize: 12,
    fontWeight: "600",
  },

  // Chips med gold accent
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
    backgroundColor: NERO.elevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: NERO.accentMuted,
    borderColor: NERO.accentBorder,
  },
  chipText: {
    color: NERO.textSec,
    fontWeight: "600",
    fontSize: 13,
  },
  chipActiveText: {
    color: NERO.accent,
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
    color: NERO.textSec,
    fontSize: 11,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: NERO.text,
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

  // Card - Nero style
  card: {
    flexDirection: "row",
    backgroundColor: NERO.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  cardImageWrapper: {
    marginRight: 14,
  },
  cardImage: {
    width: 100,
    height: 120,
    borderRadius: 16,
    backgroundColor: NERO.elevated,
  },
  placeholderImage: {
    backgroundColor: NERO.elevated,
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
    fontSize: 32,
    fontWeight: "200",
    color: NERO.text,
    fontVariant: ["tabular-nums"],
  },
  cardSizeUnit: {
    fontSize: 14,
    fontWeight: "600",
    color: NERO.text,
    marginLeft: 2,
  },
  cardWeight: {
    fontSize: 14,
    fontWeight: "500",
    color: NERO.textSec,
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
    color: NERO.text,
  },
  cardTimeBadge: {
    backgroundColor: NERO.elevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: NERO.textSec,
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
    color: NERO.textSec,
    fontSize: 13,
    flexShrink: 1,
  },
  agnBadge: {
    backgroundColor: NERO.elevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agnBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: NERO.textSec,
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
    backgroundColor: NERO.card,
    borderWidth: 1,
    borderColor: NERO.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: NERO.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: NERO.textSec,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
