// app/weather-alerts.tsx
// Settings screen for Smart Weather Alerts

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { listTrips } from "../../lib/trips";
import { listSpots } from "../../lib/spots";
import { useLanguage } from "../../lib/i18n";
import {
  generateUserCatchProfile,
  getSeasonStatsSummary,
  hasEnoughDataForAlerts,
  getCurrentSeason,
} from "../../lib/catchProfileGenerator";
import {
  findBestForecastMatches,
  formatMatchForNotification,
  explainMatch,
  DEFAULT_MIN_MATCH_SCORE,
} from "../../lib/forecastMatcher";
import {
  getAlertSettings,
  saveAlertSettings,
  getDefaultAlertSettings,
  triggerManualCheck,
  setupNotifications,
  initializeWeatherAlerts,
  syncSettingsToFirestore,
  disableAlertsInFirestore,
} from "../../lib/weatherAlertScheduler";
import {
  registerPushToken,
  unregisterPushToken,
  setupNotificationHandlers,
  addNotificationResponseListener,
} from "../../lib/pushTokenManager";
import { saveCatchProfileToFirestore } from "../../lib/catchProfileGenerator";
import {
  UserCatchProfile,
  WeatherAlertSettings,
  ForecastMatch,
  SEASON_LABELS,
} from "../../types/catchProfile";
import { useTheme } from "../../lib/theme";

// --- BASE TEMA (statiske farver) ---
const BASE = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  border: "#333333",
  danger: "#FF453A",
  success: "#22C55E",
  inputBg: "#2C2C2E",
};

type SpotData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export default function WeatherAlertsScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WeatherAlertSettings | null>(null);
  const [profile, setProfile] = useState<UserCatchProfile | null>(null);
  const [spots, setSpots] = useState<SpotData[]>([]);
  const [testingAlert, setTestingAlert] = useState(false);
  const [testResult, setTestResult] = useState<ForecastMatch | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();

    // Setup notification handlers - returns cleanup function
    const cleanupNotifications = setupNotificationHandlers();

    // Listen for notification taps
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "weather_alert") {
        // Handle notification tap - could navigate to details
        console.log("[WeatherAlerts] Notification tapped:", data);
      }
    });

    return () => {
      cleanupNotifications();
      subscription.remove();
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Initialize weather alerts system
      await initializeWeatherAlerts();

      // Load settings
      let alertSettings = await getAlertSettings();
      if (!alertSettings) {
        alertSettings = getDefaultAlertSettings();
        await saveAlertSettings(alertSettings);
      }
      setSettings(alertSettings);

      // Load trips and generate profile
      const trips = await listTrips(1000, 0);
      const userProfile = generateUserCatchProfile(trips, alertSettings.monitoredSpotIds);
      setProfile(userProfile);

      // Load spots
      const spotsList = await listSpots();
      const spotsData: SpotData[] = spotsList
        .filter((s: any) => s.lat && s.lng)
        .map((s: any) => ({
          id: s.id,
          name: s.name || `Spot #${s.id}`,
          lat: s.lat,
          lng: s.lng,
        }));
      setSpots(spotsData);
    } catch (error) {
      console.error("Error loading weather alerts data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAlerts = async (enabled: boolean) => {
    if (!settings) return;

    // Request notification permissions if enabling
    if (enabled) {
      const permissionGranted = await setupNotifications();
      if (!permissionGranted) {
        Alert.alert(
          language === "da" ? "Tilladelse kræves" : "Permission required",
          language === "da"
            ? "Du skal give tilladelse til notifikationer for at modtage vejr-alerts."
            : "You need to grant notification permission to receive weather alerts."
        );
        return;
      }

      // Register push token for server-side notifications
      const tokenResult = await registerPushToken();
      if (!tokenResult.success) {
        console.warn("[WeatherAlerts] Failed to register push token:", tokenResult.error);
        // Continue anyway - local notifications will still work
      }

      // Save profile to Firestore
      if (profile) {
        await saveCatchProfileToFirestore(profile);
      }

      // Sync settings to Firestore for server-side processing
      const newSettings = { ...settings, enabled };
      setSettings(newSettings);
      await saveAlertSettings(newSettings);
      await syncSettingsToFirestore(newSettings, profile, spots);
    } else {
      // Disable alerts
      const newSettings = { ...settings, enabled };
      setSettings(newSettings);
      await saveAlertSettings(newSettings);

      // Disable in Firestore
      await disableAlertsInFirestore();
    }
  };

  const handleToggleSpot = async (spotId: string) => {
    if (!settings) return;

    const currentSpots = settings.monitoredSpotIds || [];
    const newSpots = currentSpots.includes(spotId)
      ? currentSpots.filter((id) => id !== spotId)
      : [...currentSpots, spotId];

    const newSettings = { ...settings, monitoredSpotIds: newSpots };
    setSettings(newSettings);
    await saveAlertSettings(newSettings);

    // Sync to Firestore if alerts are enabled
    if (settings.enabled) {
      await syncSettingsToFirestore(newSettings, profile, spots);
    }
  };

  const handleTestAlert = async () => {
    if (!profile || !spots.length) return;

    setTestingAlert(true);
    setTestResult(null);

    try {
      // Use first monitored spot or first spot available
      const monitoredSpots = settings?.monitoredSpotIds || [];
      const testSpot = monitoredSpots.length > 0
        ? spots.find((s) => monitoredSpots.includes(s.id)) || spots[0]
        : spots[0];

      const result = await findBestForecastMatches(profile, testSpot.lat, testSpot.lng, {
        minScore: 0, // Show any match for testing
        maxResults: 1,
        daysAhead: 5,
      });

      setTestResult(result.bestMatch);
    } catch (error) {
      console.error("Error testing alert:", error);
      Alert.alert(
        language === "da" ? "Fejl" : "Error",
        language === "da"
          ? "Kunne ikke hente vejrdata. Prøv igen."
          : "Could not fetch weather data. Please try again."
      );
    } finally {
      setTestingAlert(false);
    }
  };

  const seasonStats = profile ? getSeasonStatsSummary(profile) : [];
  const currentSeason = getCurrentSeason();
  const hasEnoughData = profile ? hasEnoughDataForAlerts(profile) : false;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <StatusBar barStyle="light-content" backgroundColor={BASE.bg} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>
            {language === "da" ? "Indlæser..." : "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={BASE.bg} />

      {/* Overlay når der ikke er nok data */}
      {!hasEnoughData && (
        <View style={styles.notEnoughDataOverlay}>
          <View style={styles.notEnoughDataCard}>
            <View style={styles.notEnoughDataIconContainer}>
              <Ionicons name="fish" size={48} color="#F59E0B" />
            </View>
            <Text style={styles.notEnoughDataTitle}>
              {language === "da" ? "Ikke nok data endnu" : "Not enough data yet"}
            </Text>
            <Text style={styles.notEnoughDataText}>
              {language === "da"
                ? `Du skal have mindst ${profile?.minimumTripsRequired || 5} ture med fangster før vi kan analysere dit fiskemønster og sende relevante vejr-alerts.`
                : `You need at least ${profile?.minimumTripsRequired || 5} trips with catches before we can analyze your fishing pattern and send relevant weather alerts.`}
            </Text>
            <View style={styles.notEnoughDataStats}>
              <Text style={styles.notEnoughDataStatsText}>
                {language === "da"
                  ? `Du har ${profile?.totalTrips || 0} ture`
                  : `You have ${profile?.totalTrips || 0} trips`}
              </Text>
            </View>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.notEnoughDataBtn,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.notEnoughDataBtnText}>
                {language === "da" ? "Forstået" : "Got it"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        style={[styles.container, !hasEnoughData && styles.blurredContent]}
        contentContainerStyle={styles.content}
        scrollEnabled={hasEnoughData}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={BASE.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Ionicons name="notifications" size={20} color={theme.primary} />
            <Text style={styles.headerTitle}>
              {language === "da" ? "Smart Vejr-Alerts" : "Smart Weather Alerts"}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Description */}
        <Text style={styles.description}>
          {language === "da"
            ? "Få besked når vejret matcher dine bedste fangstforhold. Baseret på din personlige fiskemønster-analyse."
            : "Get notified when weather matches your best catch conditions. Based on your personal fishing pattern analysis."}
        </Text>

        {/* Enable/Disable Toggle */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>
                  {language === "da" ? "Aktivér alerts" : "Enable alerts"}
                </Text>
                <Text style={styles.toggleDesc}>
                  {language === "da"
                    ? "Modtag notifikationer ved godt fiskevejr"
                    : "Receive notifications for good fishing weather"}
                </Text>
              </View>
              <Switch
                value={settings?.enabled ?? false}
                onValueChange={handleToggleAlerts}
                trackColor={{ false: BASE.inputBg, true: theme.primary }}
                thumbColor={BASE.text}
              />
            </View>
          </View>
        </View>

        {/* Data Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === "da" ? "Din sæson-data" : "Your season data"}
          </Text>
          <View style={styles.card}>
            {seasonStats.map((stat) => (
              <View
                key={stat.season}
                style={[
                  styles.seasonRow,
                  stat.season === currentSeason && styles.seasonRowActive,
                ]}
              >
                <View style={styles.seasonInfo}>
                  <Text style={styles.seasonLabel}>{stat.label}</Text>
                  <Text style={styles.seasonData}>
                    {stat.trips} {language === "da" ? "ture" : "trips"}, {stat.fish}{" "}
                    {language === "da" ? "fisk" : "fish"}
                  </Text>
                </View>
                {stat.hasEnoughData ? (
                  <View style={styles.statusBadgeGood}>
                    <Ionicons name="checkmark" size={14} color={BASE.success} />
                  </View>
                ) : (
                  <View style={styles.statusBadgeWarn}>
                    <Ionicons name="alert" size={14} color={theme.primary} />
                  </View>
                )}
              </View>
            ))}

            {!hasEnoughData && (
              <View style={styles.warningBox}>
                <Ionicons name="information-circle" size={18} color={theme.primary} />
                <Text style={styles.warningText}>
                  {language === "da"
                    ? `Du skal have mindst ${profile?.minimumTripsRequired || 5} ture med fangster for at aktivere alerts.`
                    : `You need at least ${profile?.minimumTripsRequired || 5} trips with catches to enable alerts.`}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Monitored Spots */}
        {spots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {language === "da" ? "Overvåg spots" : "Monitor spots"}
            </Text>
            <View style={styles.card}>
              {spots.map((spot) => {
                const isSelected = settings?.monitoredSpotIds?.includes(spot.id) ?? false;
                return (
                  <Pressable
                    key={spot.id}
                    onPress={() => handleToggleSpot(spot.id)}
                    style={({ pressed }) => [
                      styles.spotRow,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color={BASE.bg} />
                      )}
                    </View>
                    <Text style={styles.spotName}>{spot.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Test Alert */}
        {hasEnoughData && spots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {language === "da" ? "Test din profil" : "Test your profile"}
            </Text>
            <View style={styles.card}>
              <Text style={styles.testDesc}>
                {language === "da"
                  ? "Se hvordan dit fiskemønster matcher den aktuelle vejrudsigt."
                  : "See how your fishing pattern matches the current forecast."}
              </Text>

              <Pressable
                onPress={handleTestAlert}
                disabled={testingAlert}
                style={({ pressed }) => [
                  styles.testBtn,
                  (pressed || testingAlert) && { opacity: 0.8 },
                ]}
              >
                {testingAlert ? (
                  <ActivityIndicator color={BASE.bg} />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color={BASE.bg} />
                    <Text style={styles.testBtnText}>
                      {language === "da" ? "Test vejrmatch" : "Test weather match"}
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Test Result */}
              {testResult && (
                <View style={styles.testResult}>
                  <View style={styles.testResultHeader}>
                    <Text style={styles.testResultScore}>{testResult.score}%</Text>
                    <Text style={styles.testResultLabel}>
                      {language === "da" ? "match" : "match"}
                    </Text>
                  </View>

                  <Text style={styles.testResultTime}>
                    {new Date(testResult.forecastTime).toLocaleDateString(
                      language === "da" ? "da-DK" : "en-US",
                      { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                    )}
                  </Text>

                  <View style={styles.testResultConditions}>
                    {testResult.forecastSummary.windMS != null && (
                      <View style={styles.conditionChip}>
                        <Ionicons name="leaf" size={12} color={BASE.textSec} />
                        <Text style={styles.conditionText}>
                          {testResult.forecastSummary.windMS} m/s {testResult.forecastSummary.windDir}
                        </Text>
                      </View>
                    )}
                    {testResult.forecastSummary.airTempC != null && (
                      <View style={styles.conditionChip}>
                        <Ionicons name="thermometer" size={12} color={BASE.textSec} />
                        <Text style={styles.conditionText}>
                          {testResult.forecastSummary.airTempC}°C
                        </Text>
                      </View>
                    )}
                    {testResult.forecastSummary.waterLevelCM != null && (
                      <View style={styles.conditionChip}>
                        <Ionicons name="water" size={12} color={BASE.textSec} />
                        <Text style={styles.conditionText}>
                          {testResult.forecastSummary.waterLevelCM > 20
                            ? language === "da" ? "Højvande" : "High tide"
                            : testResult.forecastSummary.waterLevelCM < -20
                            ? language === "da" ? "Lavvande" : "Low tide"
                            : language === "da" ? "Middel" : "Medium"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Explanation */}
                  <View style={styles.explanationBox}>
                    {explainMatch(testResult).slice(0, 4).map((line, i) => (
                      <Text key={i} style={styles.explanationLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={BASE.textSec} />
          <Text style={styles.infoText}>
            {language === "da"
              ? "Alerts sendes maksimalt én gang hver 12. time. Vejrdata hentes fra DMI."
              : "Alerts are sent at most once every 12 hours. Weather data from DMI."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BASE.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: BASE.textSec,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingVertical: 8,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: BASE.card,
    borderWidth: 1,
    borderColor: BASE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: BASE.text,
  },
  description: {
    color: BASE.textSec,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: BASE.textSec,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: BASE.card,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BASE.cardBorder,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: BASE.text,
  },
  toggleDesc: {
    fontSize: 13,
    color: BASE.textSec,
    marginTop: 4,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: BASE.cardBorder,
  },
  seasonRowActive: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
  },
  seasonInfo: {
    flex: 1,
  },
  seasonLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: BASE.text,
  },
  seasonData: {
    fontSize: 13,
    color: BASE.textSec,
    marginTop: 2,
  },
  statusBadgeGood: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeWarn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#F59E0B",
    lineHeight: 18,
  },
  spotRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BASE.cardBorder,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BASE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  spotName: {
    flex: 1,
    fontSize: 15,
    color: BASE.text,
  },
  testDesc: {
    fontSize: 14,
    color: BASE.textSec,
    padding: 14,
    paddingBottom: 0,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    margin: 14,
    padding: 14,
    borderRadius: 14,
  },
  testBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: BASE.bg,
  },
  testResult: {
    padding: 14,
    paddingTop: 0,
  },
  testResultHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 8,
  },
  testResultScore: {
    fontSize: 32,
    fontWeight: "700",
    color: "#F59E0B",
  },
  testResultLabel: {
    fontSize: 16,
    color: BASE.textSec,
  },
  testResultTime: {
    fontSize: 14,
    color: BASE.text,
    marginBottom: 12,
  },
  testResultConditions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: BASE.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 13,
    color: BASE.text,
  },
  explanationBox: {
    backgroundColor: BASE.inputBg,
    borderRadius: 12,
    padding: 12,
  },
  explanationLine: {
    fontSize: 13,
    color: BASE.textSec,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: BASE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BASE.cardBorder,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: BASE.textSec,
    lineHeight: 18,
  },
  // Not enough data overlay styles
  blurredContent: {
    opacity: 0.3,
  },
  notEnoughDataOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  notEnoughDataCard: {
    backgroundColor: BASE.card,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BASE.cardBorder,
    maxWidth: 340,
    width: "100%",
  },
  notEnoughDataIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  notEnoughDataTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: BASE.text,
    marginBottom: 12,
    textAlign: "center",
  },
  notEnoughDataText: {
    fontSize: 15,
    color: BASE.textSec,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  notEnoughDataStats: {
    backgroundColor: BASE.inputBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 24,
  },
  notEnoughDataStatsText: {
    fontSize: 14,
    color: "#F59E0B",
    fontWeight: "600",
  },
  notEnoughDataBtn: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  notEnoughDataBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: BASE.bg,
  },
});
