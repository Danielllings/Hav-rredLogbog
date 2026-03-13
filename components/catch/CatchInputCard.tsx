/**
 * CatchInputCard - Input card komponent med GlassCard styling
 * Bruges til enkelt-input felter med label, ikon og suffix
 */

import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardTypeOptions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { GlassCard } from "../statistics/GlassCard";
import { APPLE } from "../../constants/appleTheme";

interface CatchInputCardProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  icon?: keyof typeof Ionicons.glyphMap;
  suffix?: string;
  delay?: number;
}

export function CatchInputCard({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  icon,
  suffix,
  delay = 0,
}: CatchInputCardProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(400).springify()}
    >
      <GlassCard style={styles.card}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputRow}>
          {icon && (
            <Ionicons
              name={icon}
              size={20}
              color={APPLE.accent}
              style={styles.icon}
            />
          )}
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={APPLE.textTertiary}
            keyboardType={keyboardType}
          />
          {suffix && <Text style={styles.suffix}>{suffix}</Text>}
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: APPLE.text,
    padding: 0,
  },
  suffix: {
    fontSize: 16,
    fontWeight: "600",
    color: APPLE.textSecondary,
    marginLeft: 8,
  },
});
