import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title?: string;
  hideBackOnRoot?: boolean; // sæt true på forsiden
};

export default function BackBar({ title, hideBackOnRoot }: Props) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {!hideBackOnRoot && (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#1f1b51" />
            <Text style={styles.backText}>Tilbage</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>{title ?? ""}</Text>
        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: {
    color: "#1f1b51",
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
  },
});
