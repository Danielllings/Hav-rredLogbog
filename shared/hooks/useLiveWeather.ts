import { useState, useCallback, useRef, useEffect } from "react";
import { Animated } from "react-native";
import * as Location from "expo-location";
import { getSpotForecastEdr } from "../../lib/dmi";

type LiveWeatherData = {
  tempC: number | null;
  windMS: number | null;
  windDirDeg: number | null;
  waterLevelCM: number | null;
  waveHeightM: number | null;
  trend: "up" | "down" | "flat" | null;
};

function pickNearest<T extends { ts: number }>(
  series: T[] | undefined,
  now = Date.now(),
  maxAgeMs = 60 * 60 * 1000
): T | null {
  if (!series || !series.length) return null;
  let best = series[0];
  let bestDiff = Math.abs(series[0].ts - now);
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(series[i].ts - now);
    if (d < bestDiff) {
      bestDiff = d;
      best = series[i];
    }
  }
  if (bestDiff > maxAgeMs) return best;
  return best;
}

export function useLiveWeather() {
  const [liveWeather, setLiveWeather] = useState<LiveWeatherData | null>(null);
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveFetchedAt, setLiveFetchedAt] = useState<number | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const waterArrowAnim = useRef(new Animated.Value(0)).current;
  const lastLiveFetchRef = useRef<number | null>(null);

  // Animation for water level trend
  useEffect(() => {
    if (!liveWeather || liveWeather.trend === null) return;
    if (liveWeather.trend === "flat") {
      waterArrowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waterArrowAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(waterArrowAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveWeather?.trend, waterArrowAnim]);

  const fetchLiveWeather = useCallback(
    async (lat: number, lon: number) => {
      if (liveFetching) return;
      setLiveFetching(true);
      setLiveError(null);
      try {
        const edr = await getSpotForecastEdr(lat, lon);
        if (!edr) throw new Error("Ingen EDR-data");
        const now = Date.now();
        const wind = pickNearest(edr.windSpeedSeries, now);
        const windDir = pickNearest(edr.windDirSeries, now);
        const temp = pickNearest(edr.airTempSeries, now);
        const wlPoint = pickNearest(edr.waterLevelSeries, now);
        const wavePoint = pickNearest(edr.waveHeightSeries, now);

        let trend: "up" | "down" | "flat" | null = null;
        if (edr.waterLevelSeries && edr.waterLevelSeries.length >= 2) {
          const first = edr.waterLevelSeries[0].v;
          const last = edr.waterLevelSeries[edr.waterLevelSeries.length - 1].v;
          const diff = last - first;
          if (diff > 0.5) trend = "up";
          else if (diff < -0.5) trend = "down";
          else trend = "flat";
        }

        setLiveWeather({
          tempC: temp?.v ?? null,
          windMS: wind?.v ?? null,
          windDirDeg: windDir?.v ?? null,
          waterLevelCM: wlPoint?.v ?? null,
          waveHeightM: wavePoint?.v ?? null,
          trend,
        });
        setLiveFetchedAt(now);
      } catch (e) {
        setLiveError("Kan ikke hente vejr lige nu");
      } finally {
        setLiveFetching(false);
      }
    },
    [liveFetching]
  );

  const fetchLiveFromDevice = useCallback(async () => {
    const now = Date.now();
    if (lastLiveFetchRef.current && now - lastLiveFetchRef.current < 5 * 60 * 1000) {
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLiveError("Lokation ikke givet");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      lastLiveFetchRef.current = now;
      fetchLiveWeather(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      setLiveError("Kan ikke hente vejr lige nu");
    }
  }, [fetchLiveWeather]);

  // Auto-fetch on mount and every 10 minutes
  useEffect(() => {
    fetchLiveFromDevice();
    const id = setInterval(fetchLiveFromDevice, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchLiveFromDevice]);

  return {
    liveWeather,
    liveFetching,
    liveFetchedAt,
    liveError,
    waterArrowAnim,
    fetchLiveWeather,
    fetchLiveFromDevice,
  };
}
