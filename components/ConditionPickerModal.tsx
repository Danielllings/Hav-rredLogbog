import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
} from "react-native";

import { APPLE } from "../constants/appleTheme";

type ConditionData = {
  color?: "blank" | "farvet";
  seaLice?: "ingen" | "faa" | "mange";
  released?: boolean;
};

type Props = {
  visible: boolean;
  onSave: (condition: ConditionData) => void;
  onSkip: () => void;
  t: (k: any) => string;
};

export function ConditionPickerModal({ visible, onSave, onSkip, t }: Props) {
  const [color, setColor] = useState<ConditionData["color"]>(undefined);
  const [seaLice, setSeaLice] = useState<ConditionData["seaLice"]>(undefined);
  const [released, setReleased] = useState<boolean | undefined>(undefined);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setColor(undefined);
      setSeaLice(undefined);
      setReleased(undefined);
    }
  }, [visible]);

  const handleSave = () => {
    const condition: ConditionData = {};
    if (color !== undefined) condition.color = color;
    if (seaLice !== undefined) condition.seaLice = seaLice;
    if (released !== undefined) condition.released = released;
    onSave(condition);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onSkip}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayBg} onPress={onSkip} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* FARVE */}
          <Text style={styles.label}>FARVE</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.toggleBtn, color === "blank" && styles.toggleBtnActive]}
              onPress={() => setColor(color === "blank" ? undefined : "blank")}
            >
              <Text style={[styles.toggleText, color === "blank" && styles.toggleTextActive]}>
                Blank
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, color === "farvet" && styles.toggleBtnActive]}
              onPress={() => setColor(color === "farvet" ? undefined : "farvet")}
            >
              <Text style={[styles.toggleText, color === "farvet" && styles.toggleTextActive]}>
                Farvet
              </Text>
            </Pressable>
          </View>

          {/* HAVLUS */}
          <Text style={styles.label}>HAVLUS</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.toggleBtn, seaLice === "ingen" && styles.toggleBtnActive]}
              onPress={() => setSeaLice(seaLice === "ingen" ? undefined : "ingen")}
            >
              <Text style={[styles.toggleText, seaLice === "ingen" && styles.toggleTextActive]}>
                Ingen
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, seaLice === "faa" && styles.toggleBtnActive]}
              onPress={() => setSeaLice(seaLice === "faa" ? undefined : "faa")}
            >
              <Text style={[styles.toggleText, seaLice === "faa" && styles.toggleTextActive]}>
                Få
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, seaLice === "mange" && styles.toggleBtnActive]}
              onPress={() => setSeaLice(seaLice === "mange" ? undefined : "mange")}
            >
              <Text style={[styles.toggleText, seaLice === "mange" && styles.toggleTextActive]}>
                Mange
              </Text>
            </Pressable>
          </View>

          {/* GENUDSÆTNING */}
          <Text style={styles.label}>GENUDSÆTNING</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.toggleBtn, released === true && styles.toggleBtnActive]}
              onPress={() => setReleased(released === true ? undefined : true)}
            >
              <Text style={[styles.toggleText, released === true && styles.toggleTextActive]}>
                Ja
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, released === false && styles.toggleBtnActive]}
              onPress={() => setReleased(released === false ? undefined : false)}
            >
              <Text style={[styles.toggleText, released === false && styles.toggleTextActive]}>
                Nej
              </Text>
            </Pressable>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Gem</Text>
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipText}>Spring over</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: APPLE.gray1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  toggleBtnActive: {
    backgroundColor: APPLE.accent,
    borderColor: APPLE.accent,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
  toggleTextActive: {
    color: "#000",
    fontWeight: "700",
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: APPLE.accent,
    alignItems: "center",
  },
  saveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  skipBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
});
