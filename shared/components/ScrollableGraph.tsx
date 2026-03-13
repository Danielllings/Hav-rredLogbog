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
  Rect,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { type Serie } from "../../lib/dmi";

// NERO THEME
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  border: "#2A2A2E",
  accent: "#F59E0B",
  accentMuted: "#F59E0B30",
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
  /** Vis som søjler i stedet for linje (god til nedbør) */
  showAsBars?: boolean;
  /** Vis vejrikoner baseret på værdi (god til skydække) */
  showWeatherIcons?: boolean;
  /** Ikon-type: "cloud" for skydække, "rain" for nedbør */
  iconType?: "cloud" | "rain";
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
  showAsBars = false,
  showWeatherIcons = false,
  iconType = "cloud",
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
  const TOP_PAD = 24;
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
    value: number;
    barHeight: number;
  }[] = [];

  // Beregn bar-bredde for søjlevisning
  const barWidth = Math.max(pixelsPerPoint * 0.6, 8);

  // Hjælper til at få vejrikon baseret på værdi
  const getWeatherIcon = (value: number, type: "cloud" | "rain"): string => {
    if (type === "rain") {
      if (value <= 0.1) return ""; // ingen regn
      if (value <= 1) return "rainy-outline";
      if (value <= 5) return "rainy";
      return "thunderstorm";
    }
    // cloud
    if (value <= 10) return "sunny";
    if (value <= 30) return "partly-sunny";
    if (value <= 70) return "cloud";
    return "cloudy";
  };

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

    // Bar højde for søjlevisning (minimum 3px for synlighed)
    const rawBarHeight = ((pt.v - graphMin) / graphSpan) * GRAPH_HEIGHT;
    const barHeight = pt.v > 0.05 ? Math.max(rawBarHeight, 3) : 0;

    ticks.push({ x, label: hhmm, label2, showArrow, rotation, value: pt.v, barHeight });
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
      ? TOP_PAD + GRAPH_HEIGHT - ((zeroLineAt - graphMin) / graphSpan) * GRAPH_HEIGHT
      : null;

  if (!hasData) {
    return null;
  }

  return (
    <View style={styles.graphContainer}>
      {/* Header med Nero-stil */}
      <View style={styles.graphHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={styles.valueContainer}>
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
        {/* Y-axis overlay med bedre styling */}
        <View style={styles.yAxisOverlay}>
          <Text style={styles.axisLabelTop}>
            {graphMax.toFixed(1)}
          </Text>
          <Text style={styles.axisLabelBottom}>
            {graphMin.toFixed(1)}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: graphWidth }}
          style={styles.graphScroll}
        >
          <Svg width={graphWidth} height={150}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.25} />
                <Stop offset="0.5" stopColor={color} stopOpacity={0.1} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Baggrund for graf-området */}
            <Rect
              x={0}
              y={TOP_PAD}
              width={graphWidth}
              height={GRAPH_HEIGHT}
              fill={THEME.elevated}
              rx={8}
            />

            {/* "Nu" linje */}
            {nowX != null && (
              <>
                <Line
                  x1={nowX}
                  y1={TOP_PAD - 4}
                  x2={nowX}
                  y2={TOP_PAD + GRAPH_HEIGHT + 4}
                  stroke={THEME.accent}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <Rect
                  x={nowX - 12}
                  y={TOP_PAD - 16}
                  width={24}
                  height={14}
                  fill={THEME.accent}
                  rx={4}
                />
                <SvgText
                  x={nowX}
                  y={TOP_PAD - 6}
                  fill={THEME.bg}
                  fontSize={9}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  Nu
                </SvgText>
              </>
            )}

            {ticks.map((t, i) => (
              <React.Fragment key={i}>
                {/* Vertikal grid-linje (subtil) */}
                {!showAsBars && i % 3 === 0 && (
                  <Line
                    x1={t.x}
                    y1={TOP_PAD}
                    x2={t.x}
                    y2={TOP_PAD + GRAPH_HEIGHT}
                    stroke={THEME.border}
                    strokeWidth={1}
                    opacity={0.3}
                  />
                )}

                {/* Søjle for bar-visning */}
                {showAsBars && t.barHeight > 0 && (
                  <>
                    <Rect
                      x={t.x - barWidth / 2}
                      y={TOP_PAD + GRAPH_HEIGHT - t.barHeight}
                      width={barWidth}
                      height={t.barHeight}
                      fill={color}
                      rx={3}
                      opacity={0.9}
                    />
                    {/* Værdi over søjlen */}
                    {t.value > 0.1 && t.barHeight > 18 && (
                      <SvgText
                        x={t.x}
                        y={Math.max(TOP_PAD + GRAPH_HEIGHT - t.barHeight - 4, TOP_PAD + 8)}
                        fill={THEME.text}
                        fontSize={9}
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {t.value.toFixed(1)}
                      </SvgText>
                    )}
                  </>
                )}

                {/* Vindretnings-pile */}
                {t.showArrow && (
                  <G x={t.x} y={TOP_PAD + 12} rotation={t.rotation} origin="0, 0">
                    <Path d={arrowPath} fill={THEME.text} />
                  </G>
                )}

                {/* Tid-labels (hvid tekst!) */}
                <SvgText
                  x={t.x}
                  y={TOP_PAD + GRAPH_HEIGHT + 22}
                  fill={THEME.textSec}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {t.label}
                </SvgText>
                {t.label2 && (
                  <SvgText
                    x={t.x}
                    y={TOP_PAD + GRAPH_HEIGHT + 34}
                    fill={THEME.textTertiary}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {t.label2}
                  </SvgText>
                )}
              </React.Fragment>
            ))}

            {/* Zero-linje */}
            {zeroLineY !== null && (
              <>
                <Line
                  x1={0}
                  y1={zeroLineY}
                  x2={graphWidth}
                  y2={zeroLineY}
                  stroke={THEME.textSec}
                  strokeWidth={1}
                  strokeDasharray="6 3"
                  opacity={0.5}
                />
                <Rect
                  x={4}
                  y={zeroLineY - 10}
                  width={28}
                  height={14}
                  fill={THEME.card}
                  rx={3}
                />
                <SvgText
                  x={18}
                  y={zeroLineY + 1}
                  fill={THEME.textSec}
                  fontSize={9}
                  textAnchor="middle"
                >
                  0 {unit}
                </SvgText>
              </>
            )}

            {/* Linje/area graf */}
            {!showAsBars && (
              <>
                <Path d={area} fill={`url(#${gradId})`} />
                <Path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Start-punkt */}
                <Circle
                  cx={xForTs(displaySeries[0].ts)}
                  cy={TOP_PAD + GRAPH_HEIGHT - ((displaySeries[0].v - graphMin) / graphSpan) * GRAPH_HEIGHT}
                  r={5}
                  fill={THEME.card}
                  stroke={color}
                  strokeWidth={2}
                />
                {/* Slut-punkt */}
                <Circle
                  cx={xForTs(displaySeries[displaySeries.length - 1].ts)}
                  cy={TOP_PAD + GRAPH_HEIGHT - ((displaySeries[displaySeries.length - 1].v - graphMin) / graphSpan) * GRAPH_HEIGHT}
                  r={5}
                  fill={color}
                />
              </>
            )}
          </Svg>
        </ScrollView>
      </View>

      {showTimeRange && (
        <View style={styles.timeRangeRow}>
          <Text style={styles.timeRangeText}>{formatTs(startTime)}</Text>
          <Text style={styles.timeRangeText}>{formatTs(endTime)}</Text>
        </View>
      )}

      {/* Vejrikoner række */}
      {showWeatherIcons && (
        <View style={styles.weatherIconsContainer}>
          {ticks.filter((_, i) => i % 4 === 0).slice(0, 8).map((t, i) => {
            const iconName = getWeatherIcon(t.value, iconType);
            if (!iconName) return null;
            return (
              <View key={i} style={styles.weatherIconItem}>
                <Ionicons
                  name={iconName as any}
                  size={18}
                  color={iconType === "rain" ? "#60A5FA" : (t.value > 50 ? THEME.textSec : THEME.accent)}
                />
                <Text style={styles.weatherIconValue}>
                  {t.value.toFixed(0)}{unit === "%" ? "%" : ""}
                </Text>
                <Text style={styles.weatherIconTime}>
                  {t.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  graphContainer: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionLabel: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  graphVal: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  scrollWrapper: {
    position: "relative",
  },
  graphScroll: {
    borderRadius: 8,
  },
  yAxisOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    width: 36,
    backgroundColor: THEME.card,
    paddingRight: 4,
    justifyContent: "space-between",
    paddingVertical: 24,
  },
  axisLabelTop: {
    color: THEME.textSec,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  axisLabelBottom: {
    color: THEME.textSec,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  timeRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  timeRangeText: {
    color: THEME.textTertiary,
    fontSize: 10,
  },
  weatherIconsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    marginTop: 12,
  },
  weatherIconItem: {
    alignItems: "center",
    minWidth: 40,
  },
  weatherIconValue: {
    color: THEME.text,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  weatherIconTime: {
    color: THEME.textTertiary,
    fontSize: 9,
    marginTop: 2,
  },
});
