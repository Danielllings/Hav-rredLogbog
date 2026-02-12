import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../../constants/theme";

interface StatBoxProps {
  label: string;
  value: string;
  icon: any;
  color?: string;
  accent?: boolean;
}

export function StatBox({ label, value, icon, color, accent }: StatBoxProps) {
  return (
    <View style={[styles.statBox, accent && styles.statBoxAccent]}>
      <View style={styles.statIconWrap}>
        <Ionicons
          name={icon}
          size={16}
          color={accent ? THEME.graphYellow : THEME.textTertiary}
        />
      </View>
      <Text
        style={[
          styles.statValue,
          color ? { color } : {},
          accent && { color: THEME.graphYellow },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statBox: {
    width: "23%",
    backgroundColor: "transparent",
    alignItems: "center",
    paddingVertical: 12,
  },
  statBoxAccent: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 12,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 14,
  },
  statValue: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
