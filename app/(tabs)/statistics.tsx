// app/(tabs)/statistics.tsx
// Statistik-skærm med Apple Health/Fitness inspireret design

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInRight,
} from "react-native-reanimated";
import SunCalc from "suncalc";

import { listTrips, statsTrips, listYears, type TripRow } from "../../lib/trips";
import { listCatches, type CatchRow } from "../../lib/catches";
import { listSpots, type SpotRow, getWindType, type CoastDirection } from "../../lib/spots";
import { useLanguage } from "../../lib/i18n";
import { APPLE, APPLE_TIMING } from "../../constants/appleTheme";
import {
  GlassCard,
  CatchRateHero,
  QuickStatsGrid,
  TrendChart,
  BarChart,
  AdvancedBarChart,
  SeasonGoalsSection,
  GoalEditorModal,
} from "../../components/statistics";
import {
  listGoals,
  createGoal,
  updateGoalDoc,
  deleteGoal as deleteGoalDoc,
  computeGoalProgress,
  isGoalCompleted,
} from "../../lib/goals";
import type { SeasonGoal, GoalType } from "../../types/goals";


const { width } = Dimensions.get("window");

// === TYPER ===

type SimpleBucket = { trips: number; fish: number };

type WeatherSummary = {
  bestSeason: string | null;
  bestSpot: string | null;
  bestDuration: string | null;
  bestMovement: string | null;
  bestHour: string | null;
  bestSunOffset: string | null;
  bestMoonPhase: string | null;
  bestWaterLevel: string | null;
  bestWaterLevelTrend: string | null;
  bestAirTemp: string | null;
  bestWaterTemp: string | null;
  bestWindSpeed: string | null;
  bestCoastWind: string | null;
  bestCloudCover: string | null;
  bestPressureTrend: string | null;
  bestPressure: string | null;
  bestHumidity: string | null;
};

// === ANALYSE-LOGIK (bevaret fra original) ===

function pickBestBucket(
  stats: Record<string, SimpleBucket>,
  minTrips: number
): string | null {
  const entries = Object.entries(stats);
  if (entries.length === 0) return null;

  let best: { key: string; rate: number } | null = null;
  let fallback: { key: string; fish: number } | null = null;
  for (const [key, { trips, fish }] of entries) {
    // Track fallback (most fish regardless of minTrips)
    if (!fallback || fish > fallback.fish) {
      fallback = { key, fish };
    }
    if (trips < minTrips) continue;
    const rate = fish / trips;
    if (!best || rate > best.rate) {
      best = { key, rate };
    }
  }
  return best?.key ?? (fallback?.fish ? fallback.key : null);
}

type SpotPerformance = {
  name: string;
  trips: number;
  fish: number;
  rate: number;
};

type SpotAnalysis = {
  bestSpot: SpotPerformance | null;
  worstSpot: SpotPerformance | null;
  topSpots: SpotPerformance[];
};

function analyzeSpotPerformance(
  trips: TripRow[],
  spots: SpotRow[]
): SpotAnalysis {
  const spotStats: Record<string, { trips: number; fish: number }> = {};
  const spotMap = new Map<string, SpotRow>();
  for (const sp of spots) spotMap.set(sp.id, sp);

  for (const trip of trips) {
    const spotRow = trip.spot_id ? spotMap.get(trip.spot_id) : null;
    const spotName = spotRow?.name || trip.spot_name || null;

    if (!spotName) continue;

    if (!spotStats[spotName]) {
      spotStats[spotName] = { trips: 0, fish: 0 };
    }
    spotStats[spotName].trips += 1;
    spotStats[spotName].fish += trip.fish_count || 0;
  }

  const validSpots = Object.entries(spotStats)
    .filter(([_, { trips }]) => trips >= 1)
    .map(([name, { trips, fish }]) => ({
      name,
      trips,
      fish,
      rate: trips > 0 ? fish / trips : 0,
    }));

  if (validSpots.length === 0) {
    return { bestSpot: null, worstSpot: null, topSpots: [] };
  }

  validSpots.sort((a, b) => b.rate - a.rate);

  const bestSpot = validSpots[0];
  const worstSpot = validSpots.length > 1 ? validSpots[validSpots.length - 1] : null;
  const topSpots = validSpots;

  return { bestSpot, worstSpot, topSpots };
}

function getTripLocation(trip: TripRow): { lat: number; lng: number } | null {
  if (Number.isFinite(trip.spot_lat) && Number.isFinite(trip.spot_lng)) {
    return { lat: trip.spot_lat!, lng: trip.spot_lng! };
  }
  if (trip.path_json) {
    try {
      const parsed = JSON.parse(trip.path_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const lat = first.lat ?? first.latitude ?? null;
        const lng = first.lng ?? first.longitude ?? null;
        if (lat != null && lng != null) return { lat, lng };
      }
    } catch {}
  }
  return null;
}

function getMoonPhaseLabel(date: Date, lat: number, lng: number, t: (k: any) => string): string {
  const moonIllum = SunCalc.getMoonIllumination(date);
  const phase = moonIllum.phase;

  if (phase < 0.125 || phase >= 0.875) return t("newMoon");
  if (phase < 0.375) return t("waxing");
  if (phase < 0.625) return t("fullMoon");
  return t("waning");
}

function getSunOffsetLabel(date: Date, lat: number, lng: number, t: (k: any) => string): string | null {
  try {
    const times = SunCalc.getTimes(date, lat, lng);
    const catchTs = date.getTime();
    const sunrise = times.sunrise?.getTime();
    const sunset = times.sunset?.getTime();

    if (!sunrise || !sunset) return null;

    const diffSunrise = (catchTs - sunrise) / 60000;
    const diffSunset = (catchTs - sunset) / 60000;

    const usesSunrise = Math.abs(diffSunrise) < Math.abs(diffSunset);
    const diff = usesSunrise ? diffSunrise : diffSunset;
    const event = usesSunrise ? t("sunrise") : t("sunset");

    const hours = Math.round(diff / 60);

    if (Math.abs(hours) < 1) return `${t("at")} ${event}`;
    if (hours < 0) return `${Math.abs(hours)}h ${t("before")} ${event}`;
    return `${hours}h ${t("after")} ${event}`;
  } catch {
    return null;
  }
}

/** Extract avg from a stat that may be {avg,min,max} object or plain number */
function statAvg(val: any): number | null {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val === "object" && val.avg != null) return Number.isFinite(val.avg) ? val.avg : null;
  return null;
}

function analyzeTripsWeather(
  trips: TripRow[],
  spots: SpotRow[],
  t: (k: any) => string
): WeatherSummary {
  const MIN_TRIPS = 1;

  const seasonStats: Record<string, SimpleBucket> = {};
  const spotStats: Record<string, SimpleBucket> = {};
  const durationStats: Record<string, SimpleBucket> = {};
  const movementStats: Record<string, SimpleBucket> = {};
  const hourStats: Record<string, SimpleBucket> = {};
  const sunOffsetStats: Record<string, SimpleBucket> = {};
  const moonPhaseStats: Record<string, SimpleBucket> = {};
  const waterLevelStats: Record<string, SimpleBucket> = {};
  const airTempStats: Record<string, SimpleBucket> = {};
  const waterTempStats: Record<string, SimpleBucket> = {};
  const windSpeedStats: Record<string, SimpleBucket> = {};
  const coastWindStats: Record<string, SimpleBucket> = {};
  const cloudCoverStats: Record<string, SimpleBucket> = {};
  const pressureTrendStats: Record<string, SimpleBucket> = {};
  const pressureStats: Record<string, SimpleBucket> = {};
  const humidityStats: Record<string, SimpleBucket> = {};
  const waterLevelTrendStats: Record<string, SimpleBucket> = {};

  const spotMap = new Map<string, SpotRow>();
  for (const sp of spots) spotMap.set(sp.id, sp);

  for (const trip of trips) {
    let meta: any = null;
    let evaluation: any = null;
    try {
      meta = trip.meta_json ? JSON.parse(trip.meta_json) : null;
      evaluation = meta?.evaluation || meta?.summary?.evaluation || (meta?.source ? meta : null);
    } catch {}

    const fishCount = typeof trip.fish_events_json === "string"
      ? (() => { try { const a = JSON.parse(trip.fish_events_json); return Array.isArray(a) ? a.length : trip.fish_count || 0; } catch { return trip.fish_count || 0; } })()
      : (trip.fish_count || 0);
    if (fishCount === 0) continue;

    const spotRow = trip.spot_id ? spotMap.get(trip.spot_id) : null;
    const spotName = spotRow?.name || trip.spot_name || null;
    const tripLocation = getTripLocation(trip);
    const startDate = new Date(trip.start_ts);

    // Season
    const month = startDate.getMonth();
    const seasonKey =
      month >= 2 && month <= 4 ? t("spring") :
      month >= 5 && month <= 7 ? t("summer") :
      month >= 8 && month <= 10 ? t("autumn") : t("winter");
    if (!seasonStats[seasonKey]) seasonStats[seasonKey] = { trips: 0, fish: 0 };
    seasonStats[seasonKey].trips += 1;
    seasonStats[seasonKey].fish += fishCount;

    // Hour
    const hour = startDate.getHours();
    const hourKey = `${hour}-${hour + 1}`;
    if (!hourStats[hourKey]) hourStats[hourKey] = { trips: 0, fish: 0 };
    hourStats[hourKey].trips += 1;
    hourStats[hourKey].fish += fishCount;

    // Sun offset & Moon phase
    if (tripLocation) {
      const sunOffset = getSunOffsetLabel(startDate, tripLocation.lat, tripLocation.lng, t);
      if (sunOffset) {
        if (!sunOffsetStats[sunOffset]) sunOffsetStats[sunOffset] = { trips: 0, fish: 0 };
        sunOffsetStats[sunOffset].trips += 1;
        sunOffsetStats[sunOffset].fish += fishCount;
      }

      const moonPhase = getMoonPhaseLabel(startDate, tripLocation.lat, tripLocation.lng, t);
      if (!moonPhaseStats[moonPhase]) moonPhaseStats[moonPhase] = { trips: 0, fish: 0 };
      moonPhaseStats[moonPhase].trips += 1;
      moonPhaseStats[moonPhase].fish += fishCount;
    }

    // Water level — find præcis vandstand ved hvert fangst-tidspunkt fra serien
    const wlSeries: { ts: number; v: number }[] = evaluation?.waterLevelSeries ?? evaluation?.waterLevelCmSeries ?? [];
    let fishEventTimes: number[] = [];
    if (trip.fish_events_json) {
      try {
        const parsed = JSON.parse(trip.fish_events_json);
        if (Array.isArray(parsed)) {
          fishEventTimes = parsed.map((e: any) => typeof e === "string" ? new Date(e).getTime() : (typeof e === "number" ? e : 0)).filter((t: number) => t > 0);
        }
      } catch {}
    }

    if (wlSeries.length >= 2 && fishEventTimes.length > 0) {
      // For hver fangst, find nærmeste vandstands-datapunkt
      for (const catchTs of fishEventTimes) {
        let closest = wlSeries[0];
        let closestDist = Math.abs(catchTs - closest.ts);
        for (const pt of wlSeries) {
          const dist = Math.abs(catchTs - pt.ts);
          if (dist < closestDist) { closest = pt; closestDist = dist; }
        }
        const bucket = Math.round(closest.v / 5) * 5;
        const bucketEnd = bucket + 5;
        const waterLevelKey = `${bucket > 0 ? "+" : ""}${bucket} til ${bucketEnd > 0 ? "+" : ""}${bucketEnd} cm`;
        if (!waterLevelStats[waterLevelKey]) waterLevelStats[waterLevelKey] = { trips: 0, fish: 0 };
        waterLevelStats[waterLevelKey].trips += 1;
        waterLevelStats[waterLevelKey].fish += 1;

        // Trend ved fangst-tidspunktet: sammenlign med punkt 1 time før
        const oneHourBefore = catchTs - 3600000;
        let before = wlSeries[0];
        let beforeDist = Math.abs(oneHourBefore - before.ts);
        for (const pt of wlSeries) {
          const dist = Math.abs(oneHourBefore - pt.ts);
          if (dist < beforeDist) { before = pt; beforeDist = dist; }
        }
        const diff = closest.v - before.v;
        const trendKey = diff > 2 ? `↑ ${t("rising")}` :
          diff < -2 ? `↓ ${t("falling")}` :
          `→ ${t("stable")}`;
        if (!waterLevelTrendStats[trendKey]) waterLevelTrendStats[trendKey] = { trips: 0, fish: 0 };
        waterLevelTrendStats[trendKey].trips += 1;
        waterLevelTrendStats[trendKey].fish += 1;
      }
    } else {
      // Fallback: brug gennemsnit hvis ingen serie/events
      const waterLevel = statAvg(evaluation?.waterLevelCM) ?? statAvg(evaluation?.waterLevelCm);
      if (waterLevel != null && Number.isFinite(waterLevel)) {
        const bucket = Math.round(waterLevel / 5) * 5;
        const bucketEnd = bucket + 5;
        const waterLevelKey = `${bucket > 0 ? "+" : ""}${bucket} til ${bucketEnd > 0 ? "+" : ""}${bucketEnd} cm`;
        if (!waterLevelStats[waterLevelKey]) waterLevelStats[waterLevelKey] = { trips: 0, fish: 0 };
        waterLevelStats[waterLevelKey].trips += 1;
        waterLevelStats[waterLevelKey].fish += fishCount;
      }
    }

    // Air temp
    const airTemp = statAvg(evaluation?.airTempC);
    if (airTemp != null && Number.isFinite(airTemp)) {
      const roundedTemp = Math.round(airTemp);
      const airTempKey = `${roundedTemp}C`;
      if (!airTempStats[airTempKey]) airTempStats[airTempKey] = { trips: 0, fish: 0 };
      airTempStats[airTempKey].trips += 1;
      airTempStats[airTempKey].fish += fishCount;
    }

    // Water temp
    const waterTemp = statAvg(evaluation?.waterTempC) ?? statAvg(evaluation?.seaTempC);
    if (waterTemp != null && Number.isFinite(waterTemp)) {
      const roundedWaterTemp = Math.round(waterTemp);
      const waterTempKey = `${roundedWaterTemp}C`;
      if (!waterTempStats[waterTempKey]) waterTempStats[waterTempKey] = { trips: 0, fish: 0 };
      waterTempStats[waterTempKey].trips += 1;
      waterTempStats[waterTempKey].fish += fishCount;
    }

    // Wind speed
    const windSpeed = statAvg(evaluation?.windMS);
    if (windSpeed != null && Number.isFinite(windSpeed)) {
      const roundedWind = Math.round(windSpeed);
      const windSpeedKey = `${roundedWind} m/s`;
      if (!windSpeedStats[windSpeedKey]) windSpeedStats[windSpeedKey] = { trips: 0, fish: 0 };
      windSpeedStats[windSpeedKey].trips += 1;
      windSpeedStats[windSpeedKey].fish += fishCount;
    }

    // Coast wind
    const windDir = statAvg(evaluation?.windDirDeg) ?? statAvg(evaluation?.windDeg);
    const spotCoastDir = spotRow?.coastDirection as CoastDirection | null;

    // Brug coastWind fra evaluation (beregnet fra GPS-track) eller spot's kystretning
    const coastWind = evaluation?.coastWind;
    if (coastWind?.category && coastWind.category !== 'ukendt') {
      const coastWindKey = coastWind.category === 'på-tværs-af-kysten' ? t("crossWind") :
        coastWind.category === 'langs-kysten' ? t("alongCoast") :
        t("angledWind");
      if (!coastWindStats[coastWindKey]) coastWindStats[coastWindKey] = { trips: 0, fish: 0 };
      coastWindStats[coastWindKey].trips += 1;
      coastWindStats[coastWindKey].fish += fishCount;
    } else if (windDir != null && Number.isFinite(windDir) && spotCoastDir) {
      const windType = getWindType(windDir, spotCoastDir);
      const coastWindKey = windType === 'onshore' ? t("onshoreWind") :
        windType === 'offshore' ? t("offshoreWind") : t("sideWind");
      if (!coastWindStats[coastWindKey]) coastWindStats[coastWindKey] = { trips: 0, fish: 0 };
      coastWindStats[coastWindKey].trips += 1;
      coastWindStats[coastWindKey].fish += fishCount;
    }

    // Cloud cover
    const cloudCover = statAvg(evaluation?.cloudCoverPct) ?? statAvg(evaluation?.cloudCover) ?? statAvg(meta?.cloudCover);
    if (cloudCover != null && Number.isFinite(cloudCover)) {
      const cloudKey = cloudCover < 20 ? t("clearSky") :
        cloudCover < 50 ? t("partlyCloudy") :
        cloudCover < 80 ? t("mostlyCloudy") : t("overcast");
      if (!cloudCoverStats[cloudKey]) cloudCoverStats[cloudKey] = { trips: 0, fish: 0 };
      cloudCoverStats[cloudKey].trips += 1;
      cloudCoverStats[cloudKey].fish += fishCount;
    }

    // Pressure trend
    const pressureTrend = evaluation?.pressureTrend ?? meta?.pressureTrend ?? null;
    if (pressureTrend) {
      const trendKey = pressureTrend === 'rising' ? t("rising") :
        pressureTrend === 'falling' ? t("falling") : t("stable");
      if (!pressureTrendStats[trendKey]) pressureTrendStats[trendKey] = { trips: 0, fish: 0 };
      pressureTrendStats[trendKey].trips += 1;
      pressureTrendStats[trendKey].fish += fishCount;
    }

    // Pressure (hPa) - præcis værdi
    const pressure = statAvg(evaluation?.pressureHPa) ?? statAvg(evaluation?.pressure) ?? statAvg(meta?.pressure);
    if (pressure != null && Number.isFinite(pressure)) {
      const roundedPressure = Math.round(pressure);
      const pressureKey = `${roundedPressure} hPa`;
      if (!pressureStats[pressureKey]) pressureStats[pressureKey] = { trips: 0, fish: 0 };
      pressureStats[pressureKey].trips += 1;
      pressureStats[pressureKey].fish += fishCount;
    }

    // Humidity (%) - præcis værdi
    const humidity = statAvg(evaluation?.humidityPct) ?? statAvg(evaluation?.humidity) ?? statAvg(meta?.humidity);
    if (humidity != null && Number.isFinite(humidity)) {
      const roundedHumidity = Math.round(humidity);
      const humidityKey = `${roundedHumidity}%`;
      if (!humidityStats[humidityKey]) humidityStats[humidityKey] = { trips: 0, fish: 0 };
      humidityStats[humidityKey].trips += 1;
      humidityStats[humidityKey].fish += fishCount;
    }

    // Spot
    if (spotName) {
      if (!spotStats[spotName]) spotStats[spotName] = { trips: 0, fish: 0 };
      spotStats[spotName].trips += 1;
      spotStats[spotName].fish += fishCount;
    }

    // Duration
    const durationHours = (trip.duration_sec || 0) / 3600;
    const hAbbrev = t("hourShort");
    const durationLabel =
      durationHours < 1 ? `<1${hAbbrev}` :
      durationHours < 2 ? `1-2${hAbbrev}` :
      durationHours < 3 ? `2-3${hAbbrev}` :
      durationHours < 4 ? `3-4${hAbbrev}` : `4+${hAbbrev}`;
    if (!durationStats[durationLabel]) durationStats[durationLabel] = { trips: 0, fish: 0 };
    durationStats[durationLabel].trips += 1;
    durationStats[durationLabel].fish += fishCount;

    // Movement
    const distanceKm = (trip.distance_m || 0) / 1000;
    const moveLabel =
      distanceKm < 0.5 ? "<0.5km" :
      distanceKm < 1 ? "0.5-1km" :
      distanceKm < 2 ? "1-2km" : "2+km";
    if (!movementStats[moveLabel]) movementStats[moveLabel] = { trips: 0, fish: 0 };
    movementStats[moveLabel].trips += 1;
    movementStats[moveLabel].fish += fishCount;
  }

  return {
    bestSeason: pickBestBucket(seasonStats, MIN_TRIPS),
    bestSpot: pickBestBucket(spotStats, MIN_TRIPS),
    bestDuration: pickBestBucket(durationStats, MIN_TRIPS),
    bestMovement: pickBestBucket(movementStats, MIN_TRIPS),
    bestHour: pickBestBucket(hourStats, MIN_TRIPS),
    bestSunOffset: pickBestBucket(sunOffsetStats, MIN_TRIPS),
    bestMoonPhase: pickBestBucket(moonPhaseStats, MIN_TRIPS),
    bestWaterLevel: pickBestBucket(waterLevelStats, 1),
    bestWaterLevelTrend: pickBestBucket(waterLevelTrendStats, 1),
    bestAirTemp: pickBestBucket(airTempStats, MIN_TRIPS),
    bestWaterTemp: pickBestBucket(waterTempStats, MIN_TRIPS),
    bestWindSpeed: pickBestBucket(windSpeedStats, MIN_TRIPS),
    bestCoastWind: pickBestBucket(coastWindStats, MIN_TRIPS),
    bestCloudCover: pickBestBucket(cloudCoverStats, 1),
    bestPressureTrend: pickBestBucket(pressureTrendStats, MIN_TRIPS),
    bestPressure: pickBestBucket(pressureStats, MIN_TRIPS),
    bestHumidity: pickBestBucket(humidityStats, MIN_TRIPS),
  };
}

// === PATTERN CELL KOMPONENT ===

function PatternCell({
  icon,
  label,
  value,
  index,
}: {
  icon: string;
  label: string;
  value: string;
  index: number;
}) {
  const isIOS = Platform.OS === "ios";

  const content = (
    <>
      <View style={styles.patternIconWrap}>
        <Ionicons name={icon as any} size={16} color={APPLE.accent} />
      </View>
      <View style={styles.patternCellText}>
        <Text style={styles.patternLabel}>{label}</Text>
        <Text style={styles.patternValue}>{value}</Text>
      </View>
    </>
  );

  if (isIOS) {
    return (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(400).springify()}
        style={styles.patternCell}
      >
        <View style={styles.patternCellContainer}>
          <BlurView intensity={30} tint="dark" style={styles.patternCellInner}>
            {content}
          </BlurView>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(400).springify()}
      style={styles.patternCell}
    >
      <View style={[styles.patternCellContainer, styles.patternCellAndroid]}>
        {content}
      </View>
    </Animated.View>
  );
}

// === HOVEDKOMPONENT ===

export default function StatisticsScreen() {
  const { t, language } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearStats, setYearStats] = useState<any | null>(null);
  const [allStats, setAllStats] = useState<any | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [activeTab, setActiveTab] = useState<"year" | "alltime">("year");
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(null);
  const [catches, setCatches] = useState<CatchRow[]>([]);
  const [goals, setGoals] = useState<SeasonGoal[]>([]);
  const [showGoalEditor, setShowGoalEditor] = useState(false);

  const seasonOptions = useMemo(() => [
    { key: null, label: t("allSeasons") },
    { key: "spring", label: t("spring") },
    { key: "summer", label: t("summer") },
    { key: "autumn", label: t("autumn") },
    { key: "winter", label: t("winter") },
  ], [t]);

  const filteredTrips = useMemo(() => {
    if (!selectedSeasonKey) return trips;
    return trips.filter((trip) => {
      const month = new Date(trip.start_ts).getMonth();
      switch (selectedSeasonKey) {
        case "spring": return month >= 2 && month <= 4;
        case "summer": return month >= 5 && month <= 7;
        case "autumn": return month >= 8 && month <= 10;
        case "winter": return month <= 1 || month === 11;
        default: return true;
      }
    });
  }, [trips, selectedSeasonKey]);

  const yearWeatherSummary = useMemo(
    () => analyzeTripsWeather(
      filteredTrips.filter((tr) => new Date(tr.start_ts).getFullYear() === year),
      spots, t
    ),
    [filteredTrips, spots, year, t]
  );

  const allTimeWeatherSummary = useMemo(
    () => analyzeTripsWeather(filteredTrips, spots, t),
    [filteredTrips, spots, t]
  );

  const yearSpotAnalysis = useMemo(
    () => analyzeSpotPerformance(
      filteredTrips.filter((tr) => new Date(tr.start_ts).getFullYear() === year),
      spots
    ),
    [filteredTrips, spots, year]
  );

  const allTimeSpotAnalysis = useMemo(
    () => analyzeSpotPerformance(filteredTrips, spots),
    [filteredTrips, spots]
  );

  const yearGraphData = useMemo(() => {
    const labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    const arr = labels.map((label) => ({ label, value: 0, secondaryValue: 0 }));
    for (const trip of trips) {
      const d = new Date(trip.start_ts);
      if (d.getFullYear() === year) {
        arr[d.getMonth()].value += trip.fish_count || 0;
        arr[d.getMonth()].secondaryValue! += 1;
      }
    }
    return arr;
  }, [trips, year]);

  const allTimeGraphData = useMemo(() => {
    const byYear: Record<number, number> = {};
    for (const trip of trips) {
      const y = new Date(trip.start_ts).getFullYear();
      byYear[y] = (byYear[y] || 0) + (trip.fish_count || 0);
    }
    return Object.keys(byYear)
      .map(Number)
      .sort((a, b) => a - b)
      .map((y) => ({ label: String(y).slice(-2), value: byYear[y] }));
  }, [trips]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedYears, fetchedTrips, fetchedSpots, fetchedCatches] = await Promise.all([
        listYears(), listTrips(), listSpots(), listCatches(),
      ]);
      setYears(fetchedYears);
      setTrips(fetchedTrips);
      setSpots(fetchedSpots);
      setCatches(fetchedCatches);

      const targetYear = fetchedYears.includes(year) ? year : fetchedYears[0] || new Date().getFullYear();
      setYear(targetYear);

      const [yStats, aStats, fetchedGoals] = await Promise.all([
        statsTrips(targetYear), statsTrips(), listGoals(targetYear),
      ]);
      setYearStats(yStats);
      setAllStats(aStats);

      // Compute goal progress
      const updatedGoals = fetchedGoals.map((g) => {
        const progress = computeGoalProgress(g, yStats, fetchedTrips, fetchedCatches, fetchedSpots);
        const updated = { ...g, currentValue: progress };
        // Mark completed if reached
        if (isGoalCompleted(updated) && g.status === "active") {
          updateGoalDoc(g.id, {
            currentValue: progress,
            status: "completed",
            completedAt: new Date().toISOString(),
          }).catch(() => {});
          return { ...updated, status: "completed" as const, completedAt: new Date().toISOString() };
        }
        // Update cached progress
        if (progress !== g.currentValue) {
          updateGoalDoc(g.id, { currentValue: progress }).catch(() => {});
        }
        return updated;
      });
      setGoals(updatedGoals);
    } catch (e) {
      console.error("Kunne ikke indlæse statistik:", e);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const changeYear = async (newYear: number) => {
    setYear(newYear);
    const yStats = await statsTrips(newYear);
    setYearStats(yStats);
  };

  const handleAddGoal = async (type: GoalType, targetValue: number) => {
    try {
      await createGoal({ type, targetValue, seasonYear: year });
      setShowGoalEditor(false);
      loadData();
    } catch (e) {
      console.error("Could not create goal:", e);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await deleteGoalDoc(goalId);
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch (e) {
      console.error("Could not delete goal:", e);
    }
  };

  const currentStats = activeTab === "year" ? yearStats : allStats;
  const currentWeather = activeTab === "year" ? yearWeatherSummary : allTimeWeatherSummary;
  const currentGraphData = activeTab === "year" ? yearGraphData : allTimeGraphData;
  const currentSpotAnalysis = activeTab === "year" ? yearSpotAnalysis : allTimeSpotAnalysis;

  // Quick stats grid data
  const quickStats = useMemo(() => {
    if (!currentStats) return [];
    return [
      {
        icon: "checkmark-circle" as const,
        label: t("catchTrips"),
        value: currentStats.catch_trips || 0,
        color: APPLE.accent,
      },
      {
        icon: "close-circle" as const,
        label: t("nullTrips"),
        value: currentStats.null_trips || 0,
        color: APPLE.textSecondary,
      },
      {
        icon: "time" as const,
        label: t("hoursLabel"),
        value: Math.round((currentStats.total_sec || 0) / 3600),
        suffix: t("hourShort"),
        color: APPLE.accent,
      },
      {
        icon: "navigate" as const,
        label: t("kmFished"),
        value: ((currentStats.total_m || 0) / 1000).toFixed(1),
        suffix: "km",
        color: APPLE.accent,
      },
      {
        icon: "flash" as const,
        label: t("fishPerHour"),
        value: currentStats.fish_per_hour ?? "0",
        color: APPLE.accent,
      },
      {
        icon: "star" as const,
        label: t("multiFish"),
        value: currentStats.multi_fish_rate ?? 0,
        suffix: "%",
        color: APPLE.accent,
      },
      ...(currentStats.avg_length_cm != null ? [{
        icon: "resize" as const,
        label: t("avgCatchSize"),
        value: currentStats.avg_length_cm,
        suffix: "cm",
        color: APPLE.accent,
      }] : []),
    ];
  }, [currentStats, t]);

  // Pattern items
  const patternItems = useMemo(() => {
    return [
      { icon: "time-outline", label: t("hourInterval"), value: currentWeather.bestHour },
      { icon: "sunny-outline", label: t("sunOffset"), value: currentWeather.bestSunOffset },
      { icon: "moon-outline", label: t("moonPhase"), value: currentWeather.bestMoonPhase },
      { icon: "leaf-outline", label: t("season"), value: currentWeather.bestSeason },
      { icon: "water-outline", label: t("waterLevel"), value: currentWeather.bestWaterLevel },
      { icon: "trending-up-outline", label: t("waterLevelTrend"), value: currentWeather.bestWaterLevelTrend },
      { icon: "thermometer-outline", label: t("airTemp"), value: currentWeather.bestAirTemp },
      { icon: "flask-outline", label: t("waterTemp"), value: currentWeather.bestWaterTemp },
      { icon: "speedometer-outline", label: t("windSpeed"), value: currentWeather.bestWindSpeed },
      { icon: "flag-outline", label: t("coastWind"), value: currentWeather.bestCoastWind },
      { icon: "cloud-outline", label: t("cloudCover"), value: currentWeather.bestCloudCover },
      { icon: "analytics-outline", label: t("pressureTrend"), value: currentWeather.bestPressureTrend },
      { icon: "pulse-outline", label: t("pressure"), value: currentWeather.bestPressure },
      { icon: "cloudy-outline", label: t("humidity"), value: currentWeather.bestHumidity },
      { icon: "location-outline", label: t("bestSpot"), value: currentWeather.bestSpot },
      { icon: "timer-outline", label: t("tripDuration"), value: currentWeather.bestDuration },
      { icon: "walk-outline", label: t("movement"), value: currentWeather.bestMovement },
    ].filter(item => item.value);
  }, [currentWeather, t]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={APPLE.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Minimal Tab Switcher */}
      <Animated.View entering={FadeIn.duration(600)} style={styles.tabWrapper}>
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === "year" && styles.tabActive]}
            onPress={() => setActiveTab("year")}
          >
            <Text style={[styles.tabText, activeTab === "year" && styles.tabTextActive]}>
              {year}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "alltime" && styles.tabActive]}
            onPress={() => setActiveTab("alltime")}
          >
            <Text style={[styles.tabText, activeTab === "alltime" && styles.tabTextActive]}>
              {t("allTime")}
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Year selector */}
      {activeTab === "year" && years.length > 1 && (
        <Animated.ScrollView
          entering={SlideInRight.duration(400)}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.yearRow}
          contentContainerStyle={styles.yearRowContent}
        >
          {years.map((y) => (
            <Pressable
              key={y}
              style={[styles.yearChip, y === year && styles.yearChipActive]}
              onPress={() => changeYear(y)}
            >
              <Text style={[styles.yearChipText, y === year && styles.yearChipTextActive]}>
                {y}
              </Text>
            </Pressable>
          ))}
        </Animated.ScrollView>
      )}

      {currentStats ? (
        <>
          {/* Hero - Fangstrate */}
          <Animated.View entering={FadeInUp.delay(100).duration(500).springify()}>
            <GlassCard style={styles.heroCard}>
              <CatchRateHero
                rate={currentStats.fangstrate || 0}
                totalFish={currentStats.total_fish || 0}
                totalTrips={currentStats.trips || 0}
              />
            </GlassCard>
          </Animated.View>

          {/* Quick Stats Grid */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(500)}
            style={styles.section}
          >
            <QuickStatsGrid stats={quickStats} columns={3} />
          </Animated.View>

          {/* Season Goals */}
          {activeTab === "year" && (
            <SeasonGoalsSection
              goals={goals}
              onAddGoal={() => setShowGoalEditor(true)}
              onDeleteGoal={handleDeleteGoal}
              year={year}
              t={t}
            />
          )}

          {/* Spot Performance Section */}
          {(currentSpotAnalysis.bestSpot || currentSpotAnalysis.worstSpot) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("spotPerformance")}</Text>
              <View style={styles.spotPerformanceRow}>
                {currentSpotAnalysis.bestSpot && (
                  <View style={styles.spotPerformanceCard}>
                    <View style={styles.spotPerformanceHeader}>
                      <View style={[styles.spotIconWrap, styles.spotIconBest]}>
                        <Ionicons name="trophy" size={16} color="#22C55E" />
                      </View>
                      <Text style={styles.spotPerformanceLabel}>{t("bestSpot")}</Text>
                    </View>
                    <Text style={styles.spotPerformanceName} numberOfLines={1}>
                      {currentSpotAnalysis.bestSpot.name}
                    </Text>
                    <View style={styles.spotPerformanceStats}>
                      <Text style={styles.spotPerformanceStat}>
                        {currentSpotAnalysis.bestSpot.fish} 🐟
                      </Text>
                      <Text style={styles.spotPerformanceStatSep}>·</Text>
                      <Text style={styles.spotPerformanceStat}>
                        {currentSpotAnalysis.bestSpot.trips} {t("tripsOnSpot")}
                      </Text>
                      <Text style={styles.spotPerformanceStatSep}>·</Text>
                      <Text style={[styles.spotPerformanceStat, styles.spotPerformanceRate]}>
                        {currentSpotAnalysis.bestSpot.rate.toFixed(1)} {t("fishPerTrip")}
                      </Text>
                    </View>
                  </View>
                )}
                {currentSpotAnalysis.worstSpot && (
                  <View style={styles.spotPerformanceCard}>
                    <View style={styles.spotPerformanceHeader}>
                      <View style={[styles.spotIconWrap, styles.spotIconWorst]}>
                        <Ionicons name="trending-down" size={16} color="#EF4444" />
                      </View>
                      <Text style={styles.spotPerformanceLabel}>{t("worstSpot")}</Text>
                    </View>
                    <Text style={styles.spotPerformanceName} numberOfLines={1}>
                      {currentSpotAnalysis.worstSpot.name}
                    </Text>
                    <View style={styles.spotPerformanceStats}>
                      <Text style={styles.spotPerformanceStat}>
                        {currentSpotAnalysis.worstSpot.fish} 🐟
                      </Text>
                      <Text style={styles.spotPerformanceStatSep}>·</Text>
                      <Text style={styles.spotPerformanceStat}>
                        {currentSpotAnalysis.worstSpot.trips} {t("tripsOnSpot")}
                      </Text>
                      <Text style={styles.spotPerformanceStatSep}>·</Text>
                      <Text style={[styles.spotPerformanceStat, styles.spotPerformanceRateWorst]}>
                        {currentSpotAnalysis.worstSpot.rate.toFixed(1)} {t("fishPerTrip")}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
              {/* Plads 2-5 som kompakte piller */}
              {currentSpotAnalysis.topSpots.length > 1 && (
                <View style={styles.spotPillList}>
                  {currentSpotAnalysis.topSpots.slice(1, 5).map((spot, i) => (
                    <View key={spot.name} style={styles.spotPill}>
                      <Text style={styles.spotPillRank}>{i + 2}</Text>
                      <Text style={styles.spotPillName} numberOfLines={1}>{spot.name}</Text>
                      <Text style={styles.spotPillStat}>
                        {spot.rate.toFixed(1)} {t("fishPerTrip")}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Chart Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {activeTab === "year" ? t("monthlyOverview") : t("catchesPerYear")}
            </Text>

            {activeTab === "year" ? (
              <GlassCard>
                <AdvancedBarChart
                  data={yearGraphData}
                  height={150}
                  primaryColor={APPLE.accent}
                  secondaryColor={APPLE.ringGreen}
                  primaryLabel={t("fish")}
                  secondaryLabel={t("trips")}
                  language={language}
                />
              </GlassCard>
            ) : (
              <GlassCard>
                <TrendChart
                  data={allTimeGraphData}
                  height={160}
                  lineColor={APPLE.accent}
                  showDots={true}
                  showGrid={true}
                  animated={true}
                />
              </GlassCard>
            )}
          </View>

          {/* Fishing Pattern Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("fishingPattern")}</Text>
            </View>

            {/* Reliability hint */}
            {currentStats && (currentStats.catch_trips || 0) < 10 && patternItems.length > 0 && (
              <View style={styles.patternHintBar}>
                <Ionicons name="information-circle-outline" size={16} color={APPLE.accent} />
                <Text style={styles.patternHintText}>
                  {t("patternReliabilityHint").replace("{count}", String(currentStats.catch_trips || 0))}
                </Text>
              </View>
            )}

            {/* Season filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
            >
              {seasonOptions.map((opt) => (
                <Pressable
                  key={opt.key ?? "all"}
                  style={[
                    styles.filterChip,
                    selectedSeasonKey === opt.key && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedSeasonKey(opt.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedSeasonKey === opt.key && styles.filterChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {patternItems.length > 0 ? (
              <View style={styles.patternGrid}>
                {patternItems.map((item, idx) => (
                  <PatternCell
                    key={idx}
                    icon={item.icon}
                    label={item.label}
                    value={item.value!}
                    index={idx}
                  />
                ))}
              </View>
            ) : (
              <GlassCard style={styles.emptyState}>
                <Ionicons name="fish-outline" size={48} color={APPLE.textTertiary} />
                <Text style={styles.emptyText}>{t("notEnoughData")}</Text>
              </GlassCard>
            )}
          </View>
        </>
      ) : (
        <GlassCard style={styles.emptyState}>
          <Ionicons name="fish-outline" size={48} color={APPLE.textTertiary} />
          <Text style={styles.emptyText}>{t("noData")}</Text>
        </GlassCard>
      )}

      <View style={{ height: 100 }} />

      <GoalEditorModal
        visible={showGoalEditor}
        onClose={() => setShowGoalEditor(false)}
        onSave={handleAddGoal}
        existingTypes={goals.map((g) => g.type)}
        year={year}
        t={t}
      />
    </ScrollView>
  );
}

// === STYLES ===

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APPLE.bg,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: APPLE.bg,
  },

  // Tab switcher
  tabWrapper: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 8,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: APPLE.gray1,
    borderRadius: 20,
    padding: 3,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 17,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: APPLE.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.textSecondary,
  },
  tabTextActive: {
    color: "#000",
  },

  // Year selector
  yearRow: {
    marginBottom: 20,
    marginHorizontal: -16,
  },
  yearRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  yearChipActive: {
    backgroundColor: APPLE.accentMuted,
    borderColor: APPLE.accentBorder,
  },
  yearChipText: {
    fontSize: 14,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
  yearChipTextActive: {
    color: APPLE.accent,
    fontWeight: "600",
  },

  // Hero card
  heroCard: {
    marginBottom: 16,
  },

  // Sections
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  patternHintBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: APPLE.accentMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  patternHintText: {
    flex: 1,
    fontSize: 13,
    color: APPLE.textSecondary,
    lineHeight: 18,
  },

  // Legend
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: APPLE.textSecondary,
  },

  // Spot Performance
  spotPerformanceRow: {
    flexDirection: "row",
    gap: 12,
  },
  spotPerformanceCard: {
    flex: 1,
    backgroundColor: APPLE.cardSolid,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  spotPerformanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  spotIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  spotIconBest: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  spotIconWorst: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  spotPerformanceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  spotPerformanceName: {
    fontSize: 16,
    fontWeight: "700",
    color: APPLE.text,
    marginBottom: 6,
  },
  spotPerformanceStats: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  spotPerformanceStat: {
    fontSize: 12,
    color: APPLE.textSecondary,
  },
  spotPerformanceStatSep: {
    fontSize: 12,
    color: APPLE.textTertiary,
    marginHorizontal: 4,
  },
  spotPerformanceRate: {
    color: "#22C55E",
    fontWeight: "600",
  },
  spotPerformanceRateWorst: {
    color: "#EF4444",
    fontWeight: "600",
  },

  // Spot pills (plads 2-5)
  spotPillList: {
    marginTop: 10,
    gap: 6,
  },
  spotPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: APPLE.cardSolid,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  spotPillRank: {
    fontSize: 13,
    fontWeight: "700",
    color: APPLE.textTertiary,
    width: 20,
  },
  spotPillName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.text,
  },
  spotPillStat: {
    fontSize: 12,
    color: APPLE.textSecondary,
    marginLeft: 8,
  },

  // Filter chips
  filterRow: {
    marginBottom: 16,
    marginHorizontal: -16,
  },
  filterRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  filterChipActive: {
    backgroundColor: APPLE.accentMuted,
    borderColor: APPLE.accentBorder,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: APPLE.textSecondary,
  },
  filterChipTextActive: {
    color: APPLE.accent,
    fontWeight: "600",
  },

  // Pattern grid
  patternGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  patternCell: {
    width: "50%",
    padding: 4,
  },
  patternCellContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    backgroundColor: APPLE.card,
    height: 60,
  },
  patternCellAndroid: {
    backgroundColor: APPLE.cardSolid,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  patternCellInner: {
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  patternIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: APPLE.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  patternCellText: {
    flex: 1,
    marginLeft: 12,
  },
  patternLabel: {
    fontSize: 10,
    color: APPLE.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  patternValue: {
    fontSize: 14,
    fontWeight: "600",
    color: APPLE.text,
    marginTop: 2,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: APPLE.textSecondary,
    marginTop: 16,
  },
});
