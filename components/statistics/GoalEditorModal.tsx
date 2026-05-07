import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { APPLE } from "../../constants/appleTheme";
import type { GoalType } from "../../types/goals";
import { getGoalIcon } from "../../lib/goals";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (type: GoalType, targetValue: number) => void;
  existingTypes: GoalType[];
  year: number;
  t: (k: any) => string;
};

const GOAL_TYPE_OPTIONS: { type: GoalType; labelKey: string; unit: string; placeholder: string; step: number }[] = [
  { type: "fish_count", labelKey: "goalTypeFishCount", unit: "", placeholder: "50", step: 1 },
  { type: "fish_size", labelKey: "goalTypeFishSize", unit: "cm", placeholder: "60", step: 1 },
  { type: "fish_weight", labelKey: "goalTypeFishWeight", unit: "kg", placeholder: "3", step: 0.5 },
  { type: "trip_count", labelKey: "goalTypeTripCount", unit: "", placeholder: "30", step: 1 },
  { type: "hours_fished", labelKey: "goalTypeHoursFished", unit: "t", placeholder: "100", step: 1 },
  { type: "spot_diversity", labelKey: "goalTypeSpotDiversity", unit: "", placeholder: "10", step: 1 },
  { type: "catch_rate", labelKey: "goalTypeCatchRate", unit: "%", placeholder: "50", step: 5 },
];

export function GoalEditorModal({
  visible,
  onClose,
  onSave,
  existingTypes,
  year,
  t,
}: Props) {
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [targetValue, setTargetValue] = useState("");

  const availableTypes = GOAL_TYPE_OPTIONS.filter(
    (opt) => !existingTypes.includes(opt.type)
  );

  const selectedOption = GOAL_TYPE_OPTIONS.find((o) => o.type === selectedType);

  const handleSave = () => {
    if (!selectedType || !targetValue) return;
    const val = parseFloat(targetValue);
    if (isNaN(val) || val <= 0) return;
    onSave(selectedType, val);
    setSelectedType(null);
    setTargetValue("");
  };

  const handleClose = () => {
    setSelectedType(null);
    setTargetValue("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <Pressable style={styles.overlayBg} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>{t("addGoal")}</Text>
          <Text style={styles.subtitle}>{year}</Text>

          {/* Type picker */}
          <Text style={styles.label}>{t("goalTarget")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            contentContainerStyle={styles.chipRowContent}
          >
            {availableTypes.map((opt) => {
              const isSelected = selectedType === opt.type;
              return (
                <Pressable
                  key={opt.type}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => {
                    setSelectedType(opt.type);
                    setTargetValue("");
                  }}
                >
                  <Ionicons
                    name={getGoalIcon(opt.type) as any}
                    size={14}
                    color={isSelected ? "#000" : APPLE.textSecondary}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {availableTypes.length === 0 && (
            <Text style={styles.allUsed}>
              {t("noGoalsSet")}
            </Text>
          )}

          {/* Target value input */}
          {selectedType && selectedOption && (
            <View style={styles.inputSection}>
              <Text style={styles.label}>{t("goalTargetValue")}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={targetValue}
                  onChangeText={setTargetValue}
                  placeholder={selectedOption.placeholder}
                  placeholderTextColor={APPLE.textTertiary}
                  keyboardType="numeric"
                  autoFocus
                />
                {selectedOption.unit ? (
                  <Text style={styles.inputUnit}>{selectedOption.unit}</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>{t("goalCancel")}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.saveBtn,
                (!selectedType || !targetValue) && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={!selectedType || !targetValue}
            >
              <Text style={styles.saveText}>{t("goalSave")}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: APPLE.gray3,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: APPLE.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: APPLE.textSecondary,
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipRow: {
    marginBottom: 24,
    marginHorizontal: -24,
  },
  chipRowContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: APPLE.gray1,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  chipActive: {
    backgroundColor: APPLE.accent,
    borderColor: APPLE.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
  chipTextActive: {
    color: "#000",
    fontWeight: "600",
  },
  allUsed: {
    fontSize: 14,
    color: APPLE.textTertiary,
    textAlign: "center",
    marginBottom: 24,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: APPLE.gray1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    color: APPLE.text,
    paddingVertical: 14,
    fontVariant: ["tabular-nums"],
  },
  inputUnit: {
    fontSize: 18,
    fontWeight: "600",
    color: APPLE.textSecondary,
    marginLeft: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: APPLE.gray1,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: APPLE.textSecondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: APPLE.accent,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});
