// components/PersonalRecordsSection.tsx

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useLanguage } from "../lib/i18n";
import type { PersonalRecords } from "../types/records";

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

type Props = {
  records: PersonalRecords;
};

export default function PersonalRecordsSection({ records }: Props) {
  const { t } = useLanguage();
  const router = useRouter();

  const hasAnyRecord =
    records.longestFish || records.heaviestFish || records.mostFishTrip;

  if (!hasAnyRecord) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="trophy" size={18} color={NERO.accent} />
        <Text style={styles.headerTitle}>{t("personalRecords")}</Text>
      </View>

      {/* Record Cards */}
      <View style={styles.recordsRow}>
        {/* Longest Fish */}
        {records.longestFish && (
          <Pressable
            style={styles.recordCard}
            onPress={() => router.push(`/catch/${records.longestFish!.catch.id}`)}
          >
            <View style={styles.recordIconCircle}>
              <Ionicons name="resize-outline" size={18} color={NERO.accent} />
            </View>
            <Text style={styles.recordValue}>
              {records.longestFish.value}
              <Text style={styles.recordUnit}> cm</Text>
            </Text>
            <Text style={styles.recordLabel}>{t("longestFish")}</Text>
            <View style={styles.recordChevron}>
              <Ionicons name="chevron-forward" size={14} color={NERO.textSec} />
            </View>
          </Pressable>
        )}

        {/* Heaviest Fish */}
        {records.heaviestFish && (
          <Pressable
            style={styles.recordCard}
            onPress={() => router.push(`/catch/${records.heaviestFish!.catch.id}`)}
          >
            <View style={styles.recordIconCircle}>
              <Ionicons name="barbell-outline" size={18} color={NERO.accent} />
            </View>
            <Text style={styles.recordValue}>
              {records.heaviestFish.value}
              <Text style={styles.recordUnit}> kg</Text>
            </Text>
            <Text style={styles.recordLabel}>{t("heaviestFish")}</Text>
            <View style={styles.recordChevron}>
              <Ionicons name="chevron-forward" size={14} color={NERO.textSec} />
            </View>
          </Pressable>
        )}

        {/* Most Fish on a Trip */}
        {records.mostFishTrip && (
          <Pressable
            style={styles.recordCard}
            onPress={() => router.push(`/trips/${records.mostFishTrip!.trip.id}`)}
          >
            <View style={styles.recordIconCircle}>
              <Ionicons name="fish-outline" size={18} color={NERO.accent} />
            </View>
            <Text style={styles.recordValue}>
              {records.mostFishTrip.value}
              <Text style={styles.recordUnit}> {t("fish").toLowerCase()}</Text>
            </Text>
            <Text style={styles.recordLabel}>{t("mostFishTrip")}</Text>
            <View style={styles.recordChevron}>
              <Ionicons name="chevron-forward" size={14} color={NERO.textSec} />
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: NERO.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: NERO.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  headerTitle: {
    color: NERO.text,
    fontSize: 15,
    fontWeight: "600",
  },
  recordsRow: {
    flexDirection: "row",
    gap: 10,
  },
  recordCard: {
    flex: 1,
    backgroundColor: NERO.elevated,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    position: "relative",
  },
  recordIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NERO.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  recordValue: {
    fontSize: 22,
    fontWeight: "300",
    color: NERO.text,
    fontVariant: ["tabular-nums"],
  },
  recordUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: NERO.textSec,
  },
  recordLabel: {
    fontSize: 11,
    color: NERO.textSec,
    marginTop: 4,
    textAlign: "center",
  },
  recordChevron: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});
