import { View, Text, StyleSheet } from "react-native";
import { THEME } from "../../constants/theme";

export type GraphPoint = { label: string; value: number };

interface TripGraphProps {
  data: GraphPoint[];
  label: string;
  unit?: string;
}

export function TripGraph({ data, label, unit }: TripGraphProps) {
  if (!data || data.length === 0) {
    return (
      <Text style={{ color: THEME.textSec, marginTop: 6 }}>Ingen data.</Text>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);

  if (max === 0 && min === 0) {
    return (
      <Text
        style={{
          color: THEME.textSec,
          marginTop: 6,
          fontStyle: "italic",
        }}
      >
        Ingen fangster i denne periode.
      </Text>
    );
  }

  const span = max - min || 1;
  const maxValStr = `${max}${unit ?? ""}`;
  const minValStr = `${min}${unit ?? ""}`;

  const ticks = [0.25, 0.5, 0.75, 1];
  const firstLabel = data[0]?.label ?? "";
  const lastLabel = data[data.length - 1]?.label ?? "";

  return (
    <View style={{ marginTop: 10, marginBottom: 8, paddingHorizontal: 4 }}>
      <View style={styles.graphContainer}>
        <Text style={[styles.graphLabel, { top: 0 }]}>{maxValStr}</Text>

        <View style={styles.graphGrid}>
          {ticks.map((t) => (
            <View
              key={t}
              style={[
                styles.graphGridLine,
                { bottom: `${t * 100}%`, opacity: t === 1 ? 0.2 : 0.08 },
              ]}
            />
          ))}
        </View>

        <View style={styles.sparkWrap}>
          {data.map((item, i) => {
            const rel = (item.value - min) / span;
            const barH = 10 + rel * 90;
            const isMax = item.value === max;
            const showValue = data.length <= 12 && rel > 0.45;

            return (
              <View key={`${item.label}-${i}`} style={styles.sparkBarWrapper}>
                {showValue && (
                  <Text style={styles.sparkValue}>{item.value}</Text>
                )}
                <View
                  style={[
                    styles.sparkBar,
                    {
                      height: barH,
                      backgroundColor: THEME.graphYellow,
                      opacity: isMax ? 1 : 0.75,
                    },
                  ]}
                />
                <Text style={styles.sparkLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.graphLabel, { bottom: 0 }]}>{minValStr}</Text>
      </View>

      <View style={styles.graphTimeRow}>
        <Text style={styles.graphTimeText}>{firstLabel}</Text>
        <Text style={styles.graphTimeText}>{lastLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  graphContainer: {
    position: "relative",
    height: 160,
    marginBottom: 16,
  },
  graphLabel: {
    position: "absolute",
    left: 0,
    fontSize: 12,
    color: THEME.textSec,
    fontWeight: "500",
    backgroundColor: "transparent",
    paddingRight: 4,
  },
  graphTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    marginTop: -4,
  },
  graphTimeText: {
    fontSize: 11,
    color: THEME.textSec,
  },
  graphGrid: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 20,
  },
  graphGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#ffffff30",
  },
  sparkWrap: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 20,
  },
  sparkBarWrapper: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "flex-end",
    height: "100%",
  },
  sparkBar: {
    width: 10,
    borderRadius: 6,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sparkLabel: {
    fontSize: 10,
    color: THEME.textSec,
    marginTop: 4,
    position: "absolute",
    bottom: -18,
  },
  sparkValue: {
    color: THEME.text,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#ffffff20",
    borderRadius: 8,
    marginBottom: 6,
  },
});
