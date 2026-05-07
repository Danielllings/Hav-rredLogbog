// app/trip-replay/[id].tsx
// Animated trip replay with route playback and catch events

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
  GestureResponderEvent,
  LayoutChangeEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import MapView, {
  Polyline,
  Marker,
  Region,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  AnimatedRegion,
  UrlTile,
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getTrip, TripRow } from "../../../lib/trips";
import { useLanguage } from "../../../lib/i18n";
import { useTheme } from "../../../lib/theme";

const { width, height } = Dimensions.get("window");

// Theme
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  danger: "#FF453A",
  success: "#22C55E",
};

// Map style
const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
];

// Types
type PathPoint = {
  latitude: number;
  longitude: number;
  t: number; // timestamp in ms
};

type CatchEvent = {
  timestamp: number; // ms
  shown: boolean;
};

// Check for Google Maps key
const HAS_GOOGLE_MAPS_KEY = (() => {
  const extra = Constants.expoConfig?.extra ?? (Constants.manifest as any)?.extra ?? {};
  const key = extra.googleMapsApiKey ?? "";
  return typeof key === "string" && key.length > 10;
})();

// Playback speeds
const SPEEDS = [1, 2, 4, 8, 16];

export default function TripReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { theme } = useTheme();

  // Trip data
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Path and events
  const [pathPoints, setPathPoints] = useState<PathPoint[]>([]);
  const [catchEvents, setCatchEvents] = useState<CatchEvent[]>([]);
  const [visibleCatches, setVisibleCatches] = useState<number[]>([]); // indices of catch events to show

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1); // default 2x
  const [progress, setProgress] = useState(0); // 0-1
  const [currentPointIndex, setCurrentPointIndex] = useState(0);

  // Animation
  const animationRef = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(0);
  const mapRef = useRef<MapView>(null);

  // Timeline scrubbing
  const progressTrackLayout = useRef<{ x: number; width: number }>({ x: 0, width: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Current position for the animated marker
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Camera follow mode


  // Catch popup animation
  const catchPopupAnim = useRef(new Animated.Value(0)).current;
  const [showCatchPopup, setShowCatchPopup] = useState(false);
  const lastCatchCount = useRef(0);

  // Traveled path (portion of path that has been "walked")
  const traveledPath = useMemo(() => {
    if (pathPoints.length === 0) return [];
    return pathPoints.slice(0, currentPointIndex + 1);
  }, [pathPoints, currentPointIndex]);

  // Remaining path
  const remainingPath = useMemo(() => {
    if (pathPoints.length === 0) return [];
    return pathPoints.slice(currentPointIndex);
  }, [pathPoints, currentPointIndex]);

  // Load trip data
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const tripData = await getTrip(id);
        if (!tripData) {
          setError(language === "da" ? "Tur ikke fundet" : "Trip not found");
          return;
        }
        setTrip(tripData);

        // Parse path
        if (tripData.path_json) {
          try {
            const parsed = JSON.parse(tripData.path_json);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const points: PathPoint[] = parsed.map((p: any) => ({
                latitude: p.latitude ?? p.lat,
                longitude: p.longitude ?? p.lng,
                t: p.t ?? 0,
              }));
              setPathPoints(points);
              setCurrentPosition(points[0]);
            }
          } catch (e) {
            console.warn("Could not parse path_json", e);
          }
        }

        // Parse catch events
        if (tripData.fish_events_json) {
          try {
            const parsed = JSON.parse(tripData.fish_events_json);
            if (Array.isArray(parsed)) {
              const events: CatchEvent[] = parsed.map((ts: string | number) => ({
                timestamp: typeof ts === "string" ? new Date(ts).getTime() : ts,
                shown: false,
              }));
              setCatchEvents(events);
            }
          } catch (e) {
            console.warn("Could not parse fish_events_json", e);
          }
        }
      } catch (e) {
        setError(language === "da" ? "Kunne ikke hente tur" : "Could not load trip");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, language]);

  // Calculate initial map region
  const initialRegion = useMemo((): Region | undefined => {
    if (pathPoints.length === 0) return undefined;

    let minLat = pathPoints[0].latitude;
    let maxLat = pathPoints[0].latitude;
    let minLng = pathPoints[0].longitude;
    let maxLng = pathPoints[0].longitude;

    for (const p of pathPoints) {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    }

    const padding = 0.002;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(maxLat - minLat + padding, 0.005),
      longitudeDelta: Math.max(maxLng - minLng + padding, 0.005),
    };
  }, [pathPoints]);

  // Get trip time range
  const timeRange = useMemo(() => {
    if (pathPoints.length < 2) return { start: 0, end: 0, duration: 0 };
    const start = pathPoints[0].t;
    const end = pathPoints[pathPoints.length - 1].t;
    return { start, end, duration: end - start };
  }, [pathPoints]);

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!isPlaying || pathPoints.length < 2) return;

      const delta = timestamp - lastFrameTime.current;
      lastFrameTime.current = timestamp;

      // Calculate progress increment based on speed
      // We want to complete the trip in ~30 seconds at 1x speed
      const baseDuration = 30000; // 30 seconds at 1x
      const speed = SPEEDS[speedIndex];
      const progressIncrement = (delta / baseDuration) * speed;

      setProgress((prev) => {
        const newProgress = Math.min(prev + progressIncrement, 1);

        // Calculate current point index based on progress
        const targetIndex = Math.floor(newProgress * (pathPoints.length - 1));
        setCurrentPointIndex(targetIndex);

        // Update current position
        const point = pathPoints[targetIndex];
        if (point) {
          setCurrentPosition({
            latitude: point.latitude,
            longitude: point.longitude,
          });

          // Always follow camera during replay
          if (mapRef.current) {
            mapRef.current.animateToRegion(
              {
                latitude: point.latitude,
                longitude: point.longitude,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              },
              150
            );
          }

          // Check for catch events that should be shown
          const currentTime =
            timeRange.start + newProgress * timeRange.duration;

          const newVisibleCatches: number[] = [];
          catchEvents.forEach((event, index) => {
            if (event.timestamp <= currentTime) {
              newVisibleCatches.push(index);
            }
          });

          // Check if a new catch appeared
          if (newVisibleCatches.length > lastCatchCount.current) {
            // Trigger catch popup animation
            setShowCatchPopup(true);
            catchPopupAnim.setValue(0);
            Animated.sequence([
              Animated.spring(catchPopupAnim, {
                toValue: 1,
                friction: 4,
                tension: 100,
                useNativeDriver: true,
              }),
              Animated.delay(800),
              Animated.timing(catchPopupAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start(() => setShowCatchPopup(false));
          }
          lastCatchCount.current = newVisibleCatches.length;

          setVisibleCatches(newVisibleCatches);
        }

        // Stop at end
        if (newProgress >= 1) {
          setIsPlaying(false);
          return 1;
        }

        return newProgress;
      });

      animationRef.current = requestAnimationFrame(animate);
    },
    [isPlaying, pathPoints, speedIndex, timeRange, catchEvents, catchPopupAnim]
  );

  // Start/stop animation
  useEffect(() => {
    if (isPlaying) {
      lastFrameTime.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Toggle playback
  const togglePlayback = () => {
    if (progress >= 1) {
      // Reset if at end
      setProgress(0);
      setCurrentPointIndex(0);
      setVisibleCatches([]);
      lastCatchCount.current = 0;
      if (pathPoints.length > 0) {
        setCurrentPosition(pathPoints[0]);
      }
    }
    setIsPlaying(!isPlaying);
  };

  // Cycle speed
  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEEDS.length);
  };

  // Reset playback
  const resetPlayback = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentPointIndex(0);
    setVisibleCatches([]);
    lastCatchCount.current = 0;
    if (pathPoints.length > 0) {
      setCurrentPosition(pathPoints[0]);
      // Reset camera to start
      if (mapRef.current && initialRegion) {
        mapRef.current.animateToRegion(initialRegion, 500);
      }
    }
  };

  // Handle timeline layout
  const onProgressTrackLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    progressTrackLayout.current = { x, width };
  };

  // Seek to position based on touch
  const seekToPosition = useCallback(
    (pageX: number) => {
      if (pathPoints.length < 2) return;

      const { width } = progressTrackLayout.current;
      if (width <= 0) return;

      // Calculate progress from touch position (relative to track)
      // Note: pageX is absolute, we need to account for track position
      const trackX = 24; // paddingHorizontal from controlsOverlay
      const relativeX = pageX - trackX;
      const newProgress = Math.max(0, Math.min(1, relativeX / width));

      // Update state
      setProgress(newProgress);
      const targetIndex = Math.floor(newProgress * (pathPoints.length - 1));
      setCurrentPointIndex(targetIndex);

      // Update position
      const point = pathPoints[targetIndex];
      if (point) {
        setCurrentPosition({
          latitude: point.latitude,
          longitude: point.longitude,
        });

        // Update camera
        if (mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: point.latitude,
              longitude: point.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            },
            100
          );
        }

        // Update visible catches
        const currentTime = timeRange.start + newProgress * timeRange.duration;
        const newVisibleCatches: number[] = [];
        catchEvents.forEach((event, index) => {
          if (event.timestamp <= currentTime) {
            newVisibleCatches.push(index);
          }
        });
        lastCatchCount.current = newVisibleCatches.length;
        setVisibleCatches(newVisibleCatches);
      }
    },
    [pathPoints, timeRange, catchEvents]
  );

  // Touch handlers for scrubbing
  const onScrubStart = (event: GestureResponderEvent) => {
    setIsScrubbing(true);
    setIsPlaying(false); // Pause while scrubbing
    seekToPosition(event.nativeEvent.pageX);
  };

  const onScrubMove = (event: GestureResponderEvent) => {
    if (isScrubbing) {
      seekToPosition(event.nativeEvent.pageX);
    }
  };

  const onScrubEnd = () => {
    setIsScrubbing(false);
  };

  // Format time
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  // Get catch position from nearest path point
  const getCatchPosition = (catchIndex: number) => {
    if (catchEvents.length === 0 || pathPoints.length === 0) return null;

    const catchTime = catchEvents[catchIndex].timestamp;

    // Find nearest path point
    let nearestPoint = pathPoints[0];
    let minDiff = Math.abs(pathPoints[0].t - catchTime);

    for (const point of pathPoints) {
      const diff = Math.abs(point.t - catchTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearestPoint = point;
      }
    }

    return {
      latitude: nearestPoint.latitude,
      longitude: nearestPoint.longitude,
    };
  };

  // Elapsed time in replay
  const elapsedTime = useMemo(() => {
    if (!trip) return "0:00";
    const totalSec = trip.duration_sec || 0;
    const elapsedSec = totalSec * progress;
    return formatDuration(elapsedSec);
  }, [trip, progress]);

  // Total time
  const totalTime = useMemo(() => {
    if (!trip) return "0:00";
    return formatDuration(trip.duration_sec || 0);
  }, [trip]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {language === "da" ? "Indlæser tur..." : "Loading trip..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trip || pathPoints.length < 2) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={THEME.danger} />
          <Text style={styles.errorText}>
            {error || (language === "da" ? "Ingen rute at afspille" : "No route to replay")}
          </Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>
              {language === "da" ? "Tilbage" : "Back"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const mapProvider = HAS_GOOGLE_MAPS_KEY ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={mapProvider}
        initialRegion={initialRegion}
        mapType="satellite"
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >

        {/* Remaining path (faded) */}
        {remainingPath.length > 1 && (
          <Polyline
            coordinates={remainingPath}
            strokeColor="rgba(255, 255, 255, 0.25)"
            strokeWidth={4}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Traveled path (bright) */}
        {traveledPath.length > 1 && (
          <Polyline
            coordinates={traveledPath}
            strokeColor={theme.primary}
            strokeWidth={5}
          />
        )}

        {/* Start marker */}
        {pathPoints.length > 0 && (
          <Marker
            coordinate={pathPoints[0]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.startMarker}>
              <Ionicons name="flag" size={16} color="#FFFFFF" />
            </View>
          </Marker>
        )}

        {/* End marker (if finished) */}
        {progress >= 1 && pathPoints.length > 0 && (
          <Marker
            coordinate={pathPoints[pathPoints.length - 1]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.endMarker}>
              <Ionicons name="flag" size={16} color="#FFFFFF" />
            </View>
          </Marker>
        )}

        {/* Catch event markers */}
        {visibleCatches.map((catchIndex) => {
          const position = getCatchPosition(catchIndex);
          if (!position) return null;
          return (
            <Marker
              key={`catch-${catchIndex}`}
              coordinate={position}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.catchMarker}>
                <MaterialCommunityIcons name="fish" size={20} color="#FFFFFF" />
              </View>
            </Marker>
          );
        })}

        {/* Current position marker (animated fisher) */}
        {currentPosition && progress < 1 && (
          <Marker
            coordinate={currentPosition}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.currentMarker}>
              <MaterialCommunityIcons name="walk" size={24} color="#000000" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Floating back button */}
      <SafeAreaView style={styles.floatingBackContainer} edges={["top"]} pointerEvents="box-none">
        <Pressable style={styles.floatingBackBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </Pressable>
      </SafeAreaView>

      {/* Stats pill */}
      <SafeAreaView style={styles.statsPillContainer} edges={["top"]} pointerEvents="box-none">
        <View style={styles.statsPill}>
          <Text style={styles.statsPillTitle}>{trip.spot_name || "Replay"}</Text>
          <View style={styles.statsPillDivider} />
          <Ionicons name="time-outline" size={14} color="#FFF" />
          <Text style={styles.statsPillText}>{elapsedTime}</Text>
          <View style={styles.statsPillDivider} />
          <MaterialCommunityIcons name="fish" size={16} color="#22C55E" />
          <Text style={styles.statsPillFish}>{visibleCatches.length}/{catchEvents.length}</Text>
        </View>
      </SafeAreaView>

      {/* Controls overlay */}
      <View style={styles.controlsOverlay}>
        {/* Progress bar - touchable for scrubbing */}
        <View
          style={styles.progressContainer}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onScrubStart}
          onResponderMove={onScrubMove}
          onResponderRelease={onScrubEnd}
          onResponderTerminate={onScrubEnd}
        >
          <View
            style={styles.progressTrack}
            onLayout={onProgressTrackLayout}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: theme.primary },
              ]}
            />
            {/* Scrubber handle */}
            <View
              style={[
                styles.scrubberHandle,
                {
                  left: `${progress * 100}%`,
                  backgroundColor: theme.primary,
                  transform: [{ scale: isScrubbing ? 1.3 : 1 }],
                },
              ]}
            />
            {/* Catch event markers on timeline */}
            {catchEvents.map((event, index) => {
              const eventProgress =
                (event.timestamp - timeRange.start) / timeRange.duration;
              if (eventProgress < 0 || eventProgress > 1) return null;
              return (
                <View
                  key={`timeline-catch-${index}`}
                  style={[
                    styles.timelineCatchMarker,
                    { left: `${eventProgress * 100}%` },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Control buttons */}
        <View style={styles.controlButtons}>
          <Pressable style={styles.controlBtn} onPress={resetPlayback}>
            <Ionicons name="refresh" size={24} color="#FFFFFF" />
          </Pressable>

          <Pressable
            style={[styles.playBtn, { backgroundColor: theme.primary }]}
            onPress={togglePlayback}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={32}
              color="#000000"
            />
          </Pressable>

          <Pressable style={styles.controlBtn} onPress={cycleSpeed}>
            <Text style={styles.speedText}>{SPEEDS[speedIndex]}x</Text>
          </Pressable>
        </View>
      </View>

      {/* Catch popup when new catch appears */}
      {showCatchPopup && (
        <Animated.View
          style={[
            styles.catchPopup,
            {
              opacity: catchPopupAnim,
              transform: [
                {
                  scale: catchPopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialCommunityIcons name="fish" size={28} color="#FFFFFF" />
          <Text style={styles.catchPopupText}>
            {language === "da" ? "Fangst!" : "Catch!"}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: THEME.textSec,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 16,
  },
  errorText: {
    color: THEME.textSec,
    fontSize: 16,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: THEME.card,
    borderRadius: 12,
    marginTop: 8,
  },
  backButtonText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "600",
  },

  // Floating back button
  floatingBackContainer: {
    position: "absolute",
    top: 0,
    left: 12,
  },
  floatingBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Stats pill - centered at top
  statsPillContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  statsPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
  },
  statsPillTitle: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  statsPillDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  statsPillText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "500",
  },
  statsPillFish: {
    color: "#22C55E",
    fontSize: 13,
    fontWeight: "600",
  },
  // Controls overlay
  controlsOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  progressContainer: {
    marginBottom: 20,
    paddingVertical: 16, // Større touch-område
  },
  progressTrack: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  scrubberHandle: {
    position: "absolute",
    top: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  timelineCatchMarker: {
    position: "absolute",
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    marginLeft: -7,
  },
  controlButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  speedText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Markers
  startMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.success,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  endMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  currentMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  catchMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },

  // Camera toggle
  // Catch popup
  catchPopup: {
    position: "absolute",
    top: "35%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#22C55E",
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 32,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  catchPopupText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
