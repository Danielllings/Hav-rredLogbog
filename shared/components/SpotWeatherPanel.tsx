// shared/components/SpotWeatherPanel.tsx
// Floating weather panel for spot details - replaces modal

import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type EdrForecast } from "../../lib/dmi";
import { type SpotRow } from "../../lib/spots";
import { ScrollableGraph } from "./ScrollableGraph";

// NERO THEME (matching spot-weather.tsx)
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",
  primary: "#FFFFFF",
  primaryText: "#0D0D0F",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
  blue: "#3B82F6",
  cyan: "#40E0D0",
  purple: "#A855F7",
  graphYellow: "#F59E0B",
  border: "#2A2A2E",
};

const SCREEN_HEIGHT = Dimensions.get("window").height;
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const SWIPE_THRESHOLD = 80;

type TranslateFn = (key: any) => string;

function getWeatherIcon(
  temp: number,
  isNight: boolean
): { name: any; color: string } {
  if (temp > 15) return { name: "sunny", color: THEME.graphYellow };
  if (temp > 5) return { name: "cloudy", color: THEME.textSec };
  if (temp > 0) return { name: "rainy", color: THEME.blue };
  return { name: "snow", color: THEME.blue };
}

function getForecastDays(edrData: EdrForecast | null, t?: TranslateFn) {
  if (!edrData || !edrData.airTempSeries || edrData.airTempSeries.length === 0)
    return [];

  const dayNames = t
    ? [t("sun"), t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat")]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayLabel = t ? t("today") : "Today";

  const days: { label: string; icon: any; temp: number }[] = [];
  const today = new Date();

  for (let i = 0; i < 5; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const middayTs = checkDate.setHours(13, 0, 0, 0);

    const validSeries = edrData.airTempSeries.filter(
      (p) => typeof p.v === "number" && !isNaN(p.v)
    );

    if (validSeries.length === 0) return [];

    const dataPoint = validSeries.reduce(
      (prev, curr) =>
        Math.abs(curr.ts - middayTs) < Math.abs(prev.ts - middayTs)
          ? curr
          : prev,
      validSeries[0]
    );

    const isNight = checkDate.getHours() < 6 || checkDate.getHours() > 20;

    days.push({
      label: i === 0 ? todayLabel : dayNames[checkDate.getDay()],
      icon: getWeatherIcon(dataPoint.v, isNight).name,
      temp: dataPoint.v,
    });
  }
  return days;
}

interface SpotWeatherPanelProps {
  spot: SpotRow;
  isBestSpot: boolean;
  fishCount: number | null;
  weatherData: EdrForecast | null;
  isLoading: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onEdit: () => void;
  t: TranslateFn;
  language: string;
}

export function SpotWeatherPanel({
  spot,
  isBestSpot,
  fishCount,
  weatherData,
  isLoading,
  errorMsg,
  onClose,
  onEdit,
  t,
  language,
}: SpotWeatherPanelProps) {
  const translateY = useRef(new Animated.Value(PANEL_MAX_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);

  // Keep ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Animate in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const animateOut = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: PANEL_MAX_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback?.();
    });
  };

  const handleClose = () => {
    animateOut(() => onCloseRef.current());
  };

  // Pan responder for handle area only - swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down (positive dy)
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5) {
          // Dismiss
          animateOut(() => onCloseRef.current());
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const forecastDays = weatherData ? getForecastDays(weatherData, t) : [];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Semi-transparent backdrop - visual only, taps pass through to map */}
      <Animated.View
        style={[styles.backdrop, { opacity }]}
        pointerEvents="none"
      />

      {/* Floating panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle - only this area responds to pan gestures */}
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleArea}>
            {isBestSpot && (
              <View style={styles.bestSpotBadge}>
                <Ionicons name="star" size={12} color="#000" />
                <Text style={styles.bestSpotBadgeText}>{t("bestSpot")}</Text>
              </View>
            )}
            <Text style={styles.title} numberOfLines={2}>
              {spot.name}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.editBtn} onPress={onEdit}>
              <Ionicons name="create-outline" size={18} color="#000" />
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={20} color={THEME.textSec} />
            </Pressable>
          </View>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          nestedScrollEnabled={true}
        >
          {/* Stats row */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <Ionicons name="fish" size={18} color={THEME.graphYellow} />
              </View>
              <View>
                <Text style={styles.statValue}>{fishCount ?? 0}</Text>
                <Text style={styles.statLabel}>{t("catches")}</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: "rgba(94, 158, 255, 0.15)" }]}>
                <Ionicons name="navigate" size={18} color={THEME.blue} />
              </View>
              <View>
                <Text style={styles.statValue}>{spot.lat.toFixed(2)}°</Text>
                <Text style={styles.statLabel}>{t("location")}</Text>
              </View>
            </View>
          </View>

          {/* Loading state */}
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={THEME.graphYellow} />
              <Text style={styles.loadingText}>{t("loadingWeather")}</Text>
            </View>
          )}

          {/* Error state */}
          {!isLoading && errorMsg && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={THEME.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Weather data */}
          {!isLoading && weatherData && (
            <>
              {/* Day forecast row */}
              {forecastDays.length > 0 && (
                <View style={styles.dayForecast}>
                  {forecastDays.map((day, index) => (
                    <View key={index} style={styles.dayItem}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                      <View style={styles.dayIconWrap}>
                        <Ionicons name={day.icon} size={22} color={THEME.text} />
                      </View>
                      <Text style={styles.dayTemp}>{day.temp.toFixed(0)}°</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Graphs */}
              {weatherData.airTempSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.airTempSeries}
                  label={t("airTemperature")}
                  unit="°C"
                  color={THEME.graphYellow}
                />
              )}
              {weatherData.windSpeedSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.windSpeedSeries}
                  dirSeries={weatherData.windDirSeries}
                  label={`${t("windSpeed")} & ${t("windDir")}`}
                  unit="m/s"
                  color={THEME.textSec}
                />
              )}
              {weatherData.humiditySeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.humiditySeries}
                  label={t("humidity")}
                  unit="%"
                  color={THEME.cyan}
                />
              )}
              {weatherData.pressureSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.pressureSeries}
                  label={t("pressure")}
                  unit="hPa"
                  color={THEME.purple}
                />
              )}
              {weatherData.cloudCoverSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.cloudCoverSeries}
                  label={t("cloudCover")}
                  unit="%"
                  color={THEME.textSec}
                  showWeatherIcons={true}
                  iconType="cloud"
                />
              )}
              {weatherData.uvIndexSeries && weatherData.uvIndexSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.uvIndexSeries}
                  label={t("uvIndex")}
                  unit=""
                  color="#F59E0B"
                />
              )}
              {weatherData.precipitationSeries && weatherData.precipitationSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.precipitationSeries}
                  label={t("precipitation")}
                  unit="mm/h"
                  color="#60A5FA"
                  showAsBars={true}
                  pixelsPerPoint={35}
                  showWeatherIcons={true}
                  iconType="rain"
                />
              )}
              {weatherData.waveHeightSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.waveHeightSeries}
                  label={t("waveHeight")}
                  unit="m"
                  color={THEME.blue}
                  pixelsPerPoint={40}
                  minWidth={2400}
                  showTimeRange
                  dateTickEvery={6}
                />
              )}
              {weatherData.waterLevelSeries.length > 0 && (
                <ScrollableGraph
                  series={weatherData.waterLevelSeries}
                  label={t("waterLevel")}
                  unit="cm"
                  color={THEME.blue}
                  zeroLineAt={0}
                  pixelsPerPoint={40}
                  minWidth={2400}
                  showTimeRange
                  dateTickEvery={6}
                />
              )}
              {weatherData.oceanFallbackStation && (
                <Text style={styles.oceanFallbackNote}>
                  {language === "da"
                    ? `Hav-data fra ${weatherData.oceanFallbackStation}`
                    : `Ocean data from ${weatherData.oceanFallbackStation}`}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: PANEL_MAX_HEIGHT,
    backgroundColor: THEME.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    // Bigger touch target for swipe
    paddingHorizontal: 50,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: THEME.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  titleArea: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: THEME.elevated,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bestSpotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: THEME.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 10,
  },
  bestSpotBadgeText: {
    color: THEME.primaryText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: THEME.text,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: THEME.textTertiary,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
    backgroundColor: THEME.card,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  loadingText: {
    color: THEME.textSec,
    fontSize: 14,
    fontWeight: "500",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: THEME.dangerMuted,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  errorText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  dayForecast: {
    flexDirection: "row",
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  dayItem: {
    flex: 1,
    alignItems: "center",
  },
  dayLabel: {
    color: THEME.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dayIconWrap: {
    marginBottom: 6,
    width: 36,
    height: 36,
    backgroundColor: THEME.elevated,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayTemp: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  oceanFallbackNote: {
    fontSize: 11,
    color: THEME.textTertiary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
    fontStyle: "italic",
  },
});
