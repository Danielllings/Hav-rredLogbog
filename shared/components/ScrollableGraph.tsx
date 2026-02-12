import React, { useRef, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Animated } from "react-native";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
  G,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { type Serie } from "../../lib/dmi";

const THEME = {
  bg: "#121212",
  card: "#1E1E1E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  border: "#333333",
  graphYellow: "#F59E0B",
};

interface ScrollableGraphProps {
  series: Serie[];
  dirSeries?: Serie[];
  label: string;
  unit: string;
  color: string;
  zeroLineAt?: number;
  pixelsPerPoint?: number;
  minWidth?: number;
  showTimeRange?: boolean;
  dateTickEvery?: number;
}

export function ScrollableGraph({
  series,
  dirSeries,
  label,
  unit,
  color,
  zeroLineAt,
  pixelsPerPoint = 40,
  minWidth = 350,
  showTimeRange = false,
  dateTickEvery = 6,
}: ScrollableGraphProps) {
  const arrowAnim = useRef(new Animated.Value(0)).current;

  const parseTs = (val: any): number | null => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      if (num > 1e12) return num;
      if (num > 1e9) return num * 1000;
    }
    const parsed = Date.parse(String(val));
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  };

  const validSeries: Serie[] = Array.isArray(series)
    ? series
        .filter((d) => typeof d.v === "number" && !isNaN(d.v))
        .map((d) => {
          const ts = parseTs(d.ts);
          return ts != null ? { ...d, ts } : null;
        })
        .filter((d): d is Serie => d !== null)
        .sort((a, b) => a.ts - b.ts)
    : [];

  const hasData = validSeries.length > 0;
  const displaySeries = hasData ? validSeries : [];

  const values = displaySeries.map((d) => d.v);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;

  const graphMin =
    typeof zeroLineAt === "number" ? Math.min(rawMin, zeroLineAt) : rawMin;
  const graphMax =
    typeof zeroLineAt === "number" ? Math.max(rawMax, zeroLineAt) : rawMax;

  const graphSpan = graphMax - graphMin || 1;

  const GRAPH_HEIGHT = 100;
  const TOP_PAD = 20;
  const graphWidth = Math.max(displaySeries.length * pixelsPerPoint, minWidth);
  const startTime = hasData ? Math.min(...displaySeries.map((d) => d.ts)) : 0;
  const endTime = hasData ? Math.max(...displaySeries.map((d) => d.ts)) : 0;
  const timeSpan = Math.max(endTime - startTime, 1);

  const xForTs = (ts: number) => {
    const rel = (ts - startTime) / timeSpan;
    const clamped = Math.min(1, Math.max(0, rel));
    return clamped * graphWidth;
  };

  const nowTs = Date.now();
  const nowX =
    hasData && nowTs >= startTime && nowTs <= endTime ? xForTs(nowTs) : null;

  const makePath = () => {
    const points = displaySeries.map((d) => {
      const x = xForTs(d.ts);
      const y =
        TOP_PAD + GRAPH_HEIGHT - ((d.v - graphMin) / graphSpan) * GRAPH_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return "M" + points.join(" L");
  };

  const path = makePath();
  const area = `${path} L ${graphWidth},${TOP_PAD + GRAPH_HEIGHT} L 0,${TOP_PAD + GRAPH_HEIGHT} Z`;

  const ticks: {
    x: number;
    label: string;
    label2?: string;
    showArrow: boolean;
    rotation: number;
  }[] = [];

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  displaySeries.forEach((pt, idx) => {
    const x = xForTs(pt.ts);
    const date = new Date(pt.ts);
    const hhmm = `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const label2 =
      idx % dateTickEvery === 0
        ? `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`
        : undefined;

    let rotation = 0;
    let showArrow = false;
    if (dirSeries && dirSeries.length > 0) {
      const match = dirSeries.find((d) => Math.abs(d.ts - pt.ts) < 1800000);
      if (match) {
        rotation = match.v;
        showArrow = true;
      }
    }
    ticks.push({ x, label: hhmm, label2, showArrow, rotation });
  });

  const gradId = `grad-${label.replace(/[^a-zA-Z0-9]/g, "")}`;
  const arrowPath = "M -4 -4 L 0 4 L 4 -4 L 0 -2 Z";

  const valueAtNow = (() => {
    if (!hasData || nowX == null) return null;
    let best = displaySeries[0];
    let bestDiff = Math.abs(best.ts - nowTs);
    for (let i = 1; i < displaySeries.length; i++) {
      const candidate = displaySeries[i];
      const diff = Math.abs(candidate.ts - nowTs);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best.v;
  })();

  const fallbackValue = hasData ? displaySeries[displaySeries.length - 1].v : 0;
  const headerValueStr = (valueAtNow ?? fallbackValue).toFixed(1);

  const firstVal = hasData ? displaySeries[0].v : 0;
  const lastVal = hasData ? displaySeries[displaySeries.length - 1].v : 0;
  const diff = lastVal - firstVal;

  let trend: "up" | "down" | "flat" = "flat";
  if (diff > 0.5) trend = "up";
  else if (diff < -0.5) trend = "down";

  const showTrendArrow = hasData && unit === "cm" && trend !== "flat";

  useEffect(() => {
    if (!showTrendArrow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [showTrendArrow, arrowAnim]);

  const translateY = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  const zeroLineY =
    typeof zeroLineAt === "number" &&
    zeroLineAt >= graphMin &&
    zeroLineAt <= graphMax
      ? 20 + GRAPH_HEIGHT - ((zeroLineAt - graphMin) / graphSpan) * GRAPH_HEIGHT
      : null;

  if (!hasData) {
    return null;
  }

  return (
    <View style={styles.graphContainer}>
      <View style={styles.graphHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {showTrendArrow && (
            <Animated.View style={{ transform: [{ translateY }] }}>
              <Ionicons
                name={trend === "up" ? "arrow-up" : "arrow-down"}
                size={14}
                color={color}
              />
            </Animated.View>
          )}
          <Text style={[styles.graphVal, { color }]}>
            {headerValueStr} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.scrollWrapper}>
        <View style={styles.yAxisOverlay}>
          <Text style={[styles.axisLabel, { top: 20 }]}>
            {graphMax.toFixed(1)}
          </Text>
          <Text style={[styles.axisLabel, { top: 20 + 100 - 10 }]}>
            {graphMin.toFixed(1)}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={{ width: graphWidth }}
        >
          <Svg width={graphWidth} height={140}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.3} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {nowX != null && (
              <>
                <Line
                  x1={nowX}
                  y1={10}
                  x2={nowX}
                  y2={20 + GRAPH_HEIGHT + 6}
                  stroke={THEME.graphYellow}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <SvgText
                  x={Math.min(nowX + 6, graphWidth - 12)}
                  y={14}
                  fill={THEME.graphYellow}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="start"
                >
                  Nu
                </SvgText>
              </>
            )}

            {ticks.map((t, i) => (
              <React.Fragment key={i}>
                <Line
                  x1={t.x}
                  y1={20}
                  x2={t.x}
                  y2={20 + 100}
                  stroke={THEME.border}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                {t.showArrow && (
                  <G x={t.x} y={20 + 10} rotation={t.rotation} origin="0, 0">
                    <Path d={arrowPath} fill={THEME.text} />
                  </G>
                )}
                <SvgText
                  x={t.x}
                  y={140 - 5}
                  fill={THEME.textSec}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {t.label}
                </SvgText>
                {t.label2 && (
                  <SvgText
                    x={t.x}
                    y={140 - 18}
                    fill={THEME.textSec}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {t.label2}
                  </SvgText>
                )}
              </React.Fragment>
            ))}

            {zeroLineY !== null && (
              <>
                <Line
                  x1={0}
                  y1={zeroLineY}
                  x2={graphWidth}
                  y2={zeroLineY}
                  stroke="lightgray"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
                <SvgText x={5} y={zeroLineY - 4} fill="lightgray" fontSize={10}>
                  0 {unit}
                </SvgText>
              </>
            )}

            <Path d={area} fill={`url(#${gradId})`} />
            <Path d={path} fill="none" stroke={color} strokeWidth={2} />
            <Circle
              cx={0}
              cy={
                20 + 100 - ((displaySeries[0].v - graphMin) / graphSpan) * 100
              }
              r={4}
              fill={color}
            />
          </Svg>
        </ScrollView>
      </View>
      {showTimeRange && (
        <View style={styles.timeRangeRow}>
          <Text style={styles.timeRangeText}>{formatTs(startTime)}</Text>
          <Text style={styles.timeRangeText}>{formatTs(endTime)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  graphContainer: {
    marginBottom: 16,
  },
  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionLabel: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  graphVal: {
    fontSize: 14,
    fontWeight: "700",
  },
  scrollWrapper: {
    position: "relative",
  },
  yAxisOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 10,
    backgroundColor: "rgba(18, 18, 18, 0.8)",
    paddingRight: 4,
  },
  axisLabel: {
    position: "absolute",
    left: 0,
    color: THEME.textSec,
    fontSize: 10,
  },
  timeRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeRangeText: {
    color: THEME.textSec,
    fontSize: 10,
  },
});
