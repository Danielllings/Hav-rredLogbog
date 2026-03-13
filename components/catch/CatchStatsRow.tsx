/**
 * CatchStatsRow - To-kolonne input række (Bento-grid layout)
 * Bruges til længde og vægt side om side
 */

import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { GlassCard } from "../statistics/GlassCard";
import { APPLE } from "../../constants/appleTheme";
import { useLanguage } from "../../lib/i18n";

interface CatchStatsRowProps {
  length: string;
  weight: string;
  onLengthChange: (text: string) => void;
  onWeightChange: (text: string) => void;
  delay?: number;
}

export function CatchStatsRow({
  length,
  weight,
  onLengthChange,
  onWeightChange,
  delay = 0,
}: CatchStatsRowProps) {
  const { t } = useLanguage();

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(400).springify()}
      style={styles.container}
    >
      {/* Laengde */}
      <GlassCard style={styles.statCard}>
        <View style={styles.statHeader}>
          <View style={styles.iconCircle}>
            <Ionicons name="resize" size={18} color={APPLE.accent} />
          </View>
          <Text style={styles.statLabel}>{t("lengthCm")}</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.statInput}
            value={length}
            onChangeText={onLengthChange}
            placeholder="0"
            placeholderTextColor={APPLE.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={styles.statUnit}>cm</Text>
        </View>
      </GlassCard>

      {/* Vaegt */}
      <GlassCard style={styles.statCard}>
        <View style={styles.statHeader}>
          <View style={styles.iconCircle}>
            <Ionicons name="scale" size={18} color={APPLE.accent} />
          </View>
          <Text style={styles.statLabel}>{t("weightKg")}</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.statInput}
            value={weight}
            onChangeText={onWeightChange}
            placeholder="0"
            placeholderTextColor={APPLE.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={styles.statUnit}>kg</Text>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// Visnings-variant (ikke redigerbar)
interface CatchStatsDisplayProps {
  length?: number | null;
  weight?: number | null;
  delay?: number;
}

export function CatchStatsDisplay({
  length,
  weight,
  delay = 0,
}: CatchStatsDisplayProps) {
  const { t } = useLanguage();

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(400).springify()}
      style={styles.container}
    >
      {/* Laengde */}
      <GlassCard style={styles.statCard}>
        <View style={styles.displayHeader}>
          <View style={styles.iconCircleSmall}>
            <Ionicons name="resize" size={16} color={APPLE.accent} />
          </View>
        </View>
        <Text style={styles.displayValue}>
          {length ? `${length}` : "—"}
        </Text>
        <Text style={styles.displayLabel}>{t("measure")}</Text>
        {length && <Text style={styles.displayUnit}>cm</Text>}
      </GlassCard>

      {/* Vaegt */}
      <GlassCard style={styles.statCard}>
        <View style={styles.displayHeader}>
          <View style={styles.iconCircleSmall}>
            <Ionicons name="scale" size={16} color={APPLE.accent} />
          </View>
        </View>
        <Text style={styles.displayValue}>
          {weight ? `${weight}` : "—"}
        </Text>
        <Text style={styles.displayLabel}>{t("weight")}</Text>
        {weight && <Text style={styles.displayUnit}>kg</Text>}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: APPLE.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: APPLE.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  statInput: {
    fontSize: 36,
    fontWeight: "200",
    color: APPLE.text,
    textAlign: "center",
    minWidth: 60,
    padding: 0,
  },
  statUnit: {
    fontSize: 16,
    fontWeight: "600",
    color: APPLE.textSecondary,
    marginLeft: 4,
  },
  // Display styles
  displayHeader: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  displayValue: {
    fontSize: 42,
    fontWeight: "200",
    color: APPLE.accent,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  displayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  displayUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: APPLE.textTertiary,
    position: "absolute",
    right: 16,
    bottom: 16,
  },
});
