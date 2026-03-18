/**
 * AdvancedBarChart - Minimalistisk månedsoversigt med horizontal scroll
 * Viser 5 måneder ad gangen, fulde månedsnavne, swipe for flere
 */

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { APPLE } from "../../constants/appleTheme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VISIBLE_MONTHS = 5;

interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface AdvancedBarChartProps {
  data: DataPoint[];
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  language?: string;
}

const MONTH_NAMES_DA = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December"
];

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_ABBR = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function getFullMonthName(abbr: string, language: string = "da"): string {
  const months = language === "da" ? MONTH_NAMES_DA : MONTH_NAMES_EN;
  const index = MONTH_ABBR.indexOf(abbr);
  return index >= 0 ? months[index] : abbr;
}

export function AdvancedBarChart({
  data,
  height = 140,
  primaryColor = APPLE.accent,
  secondaryColor = APPLE.ringGreen,
  primaryLabel = "Fisk",
  secondaryLabel = "Ture",
  language = "da",
}: AdvancedBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Beregn bredde per måned baseret på at vise 5 ad gangen
  const containerWidth = SCREEN_WIDTH - 72; // Match GlassCard padding
  const monthWidth = containerWidth / VISIBLE_MONTHS;

  const hasSecondary = data.some(d => d.secondaryValue !== undefined);
  const allValues = data.flatMap(d =>
    d.secondaryValue !== undefined ? [d.value, d.secondaryValue] : [d.value]
  );
  const maxValue = Math.max(...allValues, 1);

  const barHeight = height - 32; // Plads til labels

  const getHeight = (value: number) => {
    return Math.max((value / maxValue) * barHeight, value > 0 ? 4 : 0);
  };

  const selected = selectedIndex !== null ? data[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {/* Valgt måned tooltip */}
      {selected && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.tooltip}>
          <Text style={styles.tooltipText}>
            <Text style={{ color: primaryColor, fontWeight: "700" }}>{selected.value}</Text>
            <Text style={styles.tooltipLabel}> {primaryLabel.toLowerCase()}</Text>
            {selected.secondaryValue !== undefined && (
              <>
                <Text style={styles.tooltipDivider}> · </Text>
                <Text style={{ color: secondaryColor, fontWeight: "700" }}>{selected.secondaryValue}</Text>
                <Text style={styles.tooltipLabel}> {secondaryLabel.toLowerCase()}</Text>
              </>
            )}
          </Text>
        </Animated.View>
      )}

      {/* Scrollable måneder */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={monthWidth}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
      >
        {data.map((item, i) => {
          const isSelected = selectedIndex === i;
          const monthName = getFullMonthName(item.label, language);

          return (
            <Pressable
              key={i}
              style={[styles.monthColumn, { width: monthWidth }]}
              onPress={() => setSelectedIndex(isSelected ? null : i)}
            >
              {/* Søjler */}
              <View style={[styles.barArea, { height: barHeight }]}>
                <View style={styles.barGroup}>
                  {/* Primary bar */}
                  <View
                    style={[
                      styles.bar,
                      {
                        height: getHeight(item.value),
                        backgroundColor: primaryColor,
                        opacity: isSelected ? 1 : 0.7,
                        width: hasSecondary ? 6 : 10,
                      },
                    ]}
                  />
                  {/* Secondary bar */}
                  {hasSecondary && item.secondaryValue !== undefined && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: getHeight(item.secondaryValue),
                          backgroundColor: secondaryColor,
                          opacity: isSelected ? 0.9 : 0.45,
                          width: 6,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>

              {/* Månedsnavn */}
              <Text
                style={[
                  styles.monthLabel,
                  isSelected && styles.monthLabelSelected,
                ]}
                numberOfLines={1}
              >
                {monthName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Scroll indikator */}
      <View style={styles.scrollHint}>
        <View style={styles.scrollDots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.scrollDot,
                i === 1 && styles.scrollDotActive,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  tooltip: {
    alignItems: "center",
    marginBottom: 10,
    minHeight: 20,
  },
  tooltipText: {
    fontSize: 13,
    color: APPLE.text,
  },
  tooltipLabel: {
    color: APPLE.textSecondary,
    fontWeight: "400",
  },
  tooltipDivider: {
    color: APPLE.textTertiary,
  },

  scrollContent: {
    paddingRight: 0,
  },

  monthColumn: {
    alignItems: "center",
  },

  barArea: {
    justifyContent: "flex-end",
    alignItems: "center",
  },

  barGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },

  bar: {
    borderRadius: 3,
    minHeight: 0,
  },

  monthLabel: {
    fontSize: 11,
    color: APPLE.textTertiary,
    marginTop: 8,
    fontWeight: "500",
    textAlign: "center",
  },
  monthLabelSelected: {
    color: APPLE.accent,
    fontWeight: "600",
  },

  scrollHint: {
    alignItems: "center",
    marginTop: 12,
  },
  scrollDots: {
    flexDirection: "row",
    gap: 4,
  },
  scrollDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: APPLE.textTertiary,
    opacity: 0.3,
  },
  scrollDotActive: {
    opacity: 0.6,
    width: 12,
  },
});
