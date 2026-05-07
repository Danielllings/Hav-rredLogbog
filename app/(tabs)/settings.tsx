import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect, G, ClipPath, Defs } from "react-native-svg";

// Vector Flag Components
const DenmarkFlag = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size * 0.75} viewBox="0 0 32 24">
    <Defs>
      <ClipPath id="flagClipDK">
        <Rect x="0" y="0" width="32" height="24" rx="3" />
      </ClipPath>
    </Defs>
    <G clipPath="url(#flagClipDK)">
      <Rect x="0" y="0" width="32" height="24" fill="#C8102E" />
      <Rect x="10" y="0" width="4" height="24" fill="#FFFFFF" />
      <Rect x="0" y="10" width="32" height="4" fill="#FFFFFF" />
    </G>
  </Svg>
);

const UKFlag = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size * 0.75} viewBox="0 0 32 24">
    <Defs>
      <ClipPath id="flagClipUK">
        <Rect x="0" y="0" width="32" height="24" rx="3" />
      </ClipPath>
    </Defs>
    <G clipPath="url(#flagClipUK)">
      {/* Blue background */}
      <Rect x="0" y="0" width="32" height="24" fill="#012169" />
      {/* White diagonals */}
      <Rect x="-2" y="10" width="36" height="4" fill="#FFFFFF" transform="rotate(-33.69 16 12)" />
      <Rect x="-2" y="10" width="36" height="4" fill="#FFFFFF" transform="rotate(33.69 16 12)" />
      {/* Red diagonals */}
      <Rect x="-2" y="10.5" width="36" height="2.5" fill="#C8102E" transform="rotate(-33.69 16 12)" />
      <Rect x="-2" y="11" width="36" height="2.5" fill="#C8102E" transform="rotate(33.69 16 12)" />
      {/* White cross */}
      <Rect x="13" y="0" width="6" height="24" fill="#FFFFFF" />
      <Rect x="0" y="9" width="32" height="6" fill="#FFFFFF" />
      {/* Red cross */}
      <Rect x="14" y="0" width="4" height="24" fill="#C8102E" />
      <Rect x="0" y="10" width="32" height="4" fill="#C8102E" />
    </G>
  </Svg>
);
import { auth, signOut, deleteUser } from "../../lib/firebase";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { statsTrips, listTrips } from "../../lib/trips";
import { listSpots } from "../../lib/spots";
import { getUserCollectionRef } from "../../lib/firestore";
import { getDocs, deleteDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage, Language } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import {
  type PatternGroup,
  type PatternReport,
  buildWeatherSummary,
  buildSpotSummary,
  withTimeout,
} from "../../lib/patternAnalysis";
import { generateReportHtml, type ReportChoice } from "../../lib/pdfReport";
import { listGoals, computeGoalProgress, isGoalCompleted, updateGoalDoc } from "../../lib/goals";
import { listCatches } from "../../lib/catches";

// Demo konto email
const DEMO_EMAIL = "demo@havorredlogbog.dk";

// --- NERO TEMA ---
const THEME = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  border: "#2A2A2E",
  primary: "#FFFFFF",
  primaryText: "#0D0D0F",
  accent: "#F59E0B",
  accentMuted: "#F59E0B20",
  accentBorder: "#F59E0B40",
  danger: "#FF3B30",
  dangerMuted: "#FF3B3015",
  success: "#22C55E",
  inputBg: "#1E1E21",
};

// ============================================================================
// Selve settings-skærmen
// ============================================================================

export default function SettingsScreen() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState(auth.currentUser?.email);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteDoneModalVisible, setDeleteDoneModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [creditsModalVisible, setCreditsModalVisible] = useState(false);

  // Support
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [supportCategory, setSupportCategory] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportCategoryPickerVisible, setSupportCategoryPickerVisible] = useState(false);
  const [supportSent, setSupportSent] = useState(false);

  // Credits - testere og medvirkende
  const TESTERS = [
    { name: "Sergio JB", role: "Pre-release Tester" },
  ];

  const { language, setLanguage, t } = useLanguage();
  const { theme: dynamicTheme } = useTheme();

  const thisYear = new Date().getFullYear();

  const SUPPORT_CATEGORIES = [
    { key: "general", da: "Generel support", en: "General support" },
    { key: "bug", da: "Fejlrapport", en: "Bug report" },
    { key: "feature", da: "Feature-forslag", en: "Feature request" },
    { key: "app", da: "Spørgsmål om appen", en: "Question about the app" },
    { key: "privacy", da: "Privatlivsspørgsmål", en: "Privacy question" },
    { key: "other", da: "Andet", en: "Other" },
  ];

  const getSupportCategoryLabel = (key: string) => {
    const cat = SUPPORT_CATEGORIES.find((c) => c.key === key);
    return cat ? (language === "da" ? cat.da : cat.en) : "";
  };

  async function sendSupport() {
    if (!supportCategory || !supportMessage.trim()) {
      Alert.alert(t("supportMissingFields"), t("supportMissingFieldsDesc"));
      return;
    }

    setSupportSending(true);
    try {
      const categoryLabel = getSupportCategoryLabel(supportCategory);
      const message = [
        supportMessage.trim(),
        "",
        "---",
        "Sendt fra app",
        `Bruger: ${userEmail || "N/A"}`,
        `Kategori: ${categoryLabel}`,
      ].join("\n");

      const res = await fetch("https://havorredlogbog.dk/send-contact.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userEmail || "App-bruger",
          email: userEmail || "noreply@havorredlogbog.dk",
          subject: `[App] ${categoryLabel}`,
          message,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setSupportCategory(null);
      setSupportMessage("");
      setSupportSent(true);
    } catch (e: any) {
      console.error("Support send error:", e);
      Alert.alert(
        t("supportErrorTitle"),
        `${t("supportErrorDesc")}\n\n(${e?.message || String(e)})`
      );
    } finally {
      setSupportSending(false);
    }
  }

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserEmail(user?.email);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {}
  };

  const deleteAllUserData = async () => {
    if (!auth.currentUser) {
      Alert.alert(
        "Ikke logget ind",
        "Du skal være logget ind for at slette dine data."
      );
      return;
    }

    setDeleteLoading(true);
    try {
      const collections = ["trips", "catches", "spots"];

      for (const name of collections) {
        const colRef = getUserCollectionRef(name);
        const snapshot = await getDocs(colRef);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(docSnap.ref);
        }
      }

      // Slet offline-ture gemt lokalt
      try {
        await AsyncStorage.removeItem("offline_trips_v2");
      } catch {}

      setDeleteModalVisible(false);
      setDeleteConfirmText("");
      setDeleteDoneModalVisible(true);
    } catch (err: any) {
      console.error("Fejl ved sletning af data:", err);
      Alert.alert(
        "Fejl",
        err?.message ?? "Kunne ikke slette alle dine data. Prøv igen."
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDeleteData = () => {
    if (deleteConfirmText.trim() !== "Bekræft") {
      Alert.alert(
        "Bekræft sletning",
        'Skriv "Bekræft" i feltet for at slette alle dine data.'
      );
      return;
    }
    deleteAllUserData();
  };

  const deleteAccountAndData = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert(
        "Ikke logget ind",
        "Du skal være logget ind for at slette din konto."
      );
      return;
    }

    setDeleteAccountLoading(true);
    try {
      // 1. Slet alle data først (trips, catches, spots)
      const collections = ["trips", "catches", "spots"];
      for (const name of collections) {
        const colRef = getUserCollectionRef(name);
        const snapshot = await getDocs(colRef);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(docSnap.ref);
        }
      }

      // 2. Slet offline-ture gemt lokalt
      try {
        await AsyncStorage.removeItem("offline_trips_v2");
      } catch {}

      // 3. Slet Firebase Auth kontoen
      await deleteUser(user);

      setDeleteAccountModalVisible(false);
      setDeleteAccountConfirmText("");

      // Brugeren er nu slettet og logget ud automatisk
      router.replace("/");
    } catch (err: any) {
      console.error("Fejl ved sletning af konto:", err);

      // Håndter "requires-recent-login" fejl
      if (err?.code === "auth/requires-recent-login") {
        Alert.alert(
          "Log ind igen",
          "Af sikkerhedsårsager skal du logge ind igen før du kan slette din konto. Log ud og log ind igen, og prøv derefter.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Fejl",
          err?.message ?? "Kunne ikke slette din konto. Prøv igen."
        );
      }
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  const handleConfirmDeleteAccount = () => {
    const confirmWord = language === "da" ? "SLET" : "DELETE";
    if (deleteAccountConfirmText.trim().toUpperCase() !== confirmWord) {
      Alert.alert(
        language === "da" ? "Bekræft sletning" : "Confirm deletion",
        language === "da"
          ? `Skriv "${confirmWord}" i feltet for at slette din konto.`
          : `Type "${confirmWord}" in the field to delete your account.`
      );
      return;
    }
    deleteAccountAndData();
  };

  const generateReport = async (choice: ReportChoice) => {
    if (reportLoading) return;
    setReportLoading(true);

    try {
      const year = new Date().getFullYear();

      const yearStats: any = await withTimeout(statsTrips(year), 15000, "statsTrips(year)");
      const allStats: any = await withTimeout(statsTrips(), 15000, "statsTrips(all)");
      const allTripsArr: any[] = await withTimeout(listTrips(1000, 0), 20000, "listTrips");
      const yearTripsArr = allTripsArr.filter((trip) => {
        if (!trip.start_ts) return false;
        return new Date(trip.start_ts).getFullYear() === year;
      });
      const allSpots: any[] = await withTimeout(listSpots(), 15000, "listSpots");

      // Fetch goals for the current year
      let yearGoals = await listGoals(year).catch(() => []);
      if (yearGoals.length > 0) {
        const allCatches = await listCatches().catch(() => []);
        yearGoals = yearGoals.map((g) => {
          const progress = computeGoalProgress(g, yearStats, allTripsArr, allCatches, allSpots);
          return { ...g, currentValue: progress };
        });
      }

      const html = generateReportHtml({
        choice,
        yearStats,
        allStats,
        yearTrips: yearTripsArr,
        allTrips: allTripsArr,
        spots: allSpots,
        goals: yearGoals,
        language,
        t,
        year,
      });

      const { uri } = await withTimeout(
        Print.printToFileAsync({ html, base64: false }),
        20000,
        "printToFileAsync"
      );

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: language === "da" ? "Del eller gem din rapport" : "Share or save your report",
        });
      } else {
        Alert.alert("PDF", `PDF generated at:\n${uri}`);
      }
    } catch (err: any) {
      console.error("PDF generation error:", err);
      Alert.alert("Error", err?.message ?? "Could not generate the report.");
    } finally {
      setReportLoading(false);
    }
  };


  const handleDownloadReport = () => {
    if (reportLoading) return;
    setReportModalVisible(true);
  };

  const handleReportChoice = (choice: ReportChoice) => {
    setReportModalVisible(false);
    generateReport(choice);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
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
            <Ionicons name="chevron-back" size={22} color={THEME.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Ionicons name="settings-outline" size={20} color={THEME.textSec} />
            <Text style={styles.headerTitle}>{t("settings")}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Profil Sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("account")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconContainer}>
                <Ionicons name="person" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("email")}</Text>
                <Text style={styles.value}>
                  {userEmail || t("notLoggedIn")}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={THEME.textSec} />
            </View>
          </View>
        </View>

        {/* Smart Vejr-Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === "da" ? "Notifikationer" : "Notifications"}
          </Text>
          <View style={styles.card}>
            <Pressable
              onPress={() => router.push("/weather-alerts")}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="notifications" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {language === "da" ? "Smart Vejr-Alerts" : "Smart Weather Alerts"}
                </Text>
                <Text style={styles.value}>
                  {language === "da"
                    ? "Få besked når vejret matcher dit fiskemønster"
                    : "Get notified when weather matches your pattern"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
          </View>
        </View>

        {/* Info Sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("aboutApp")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconContainer}>
                <Ionicons name="information" size={18} color={THEME.textSec} />
              </View>
              <Text style={[styles.label, { flex: 1 }]}>{t("version")}</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>v1.0.1</Text>
              </View>
            </View>
            <View style={styles.cardDivider} />
            <Pressable
              onPress={() => setCreditsModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="code-slash" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Credits</Text>
                <Text style={styles.value}>
                  {language === "da" ? "Udviklere & testere" : "Developers & testers"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
            <View style={styles.cardDivider} />
            <Pressable
              onPress={() => setPrivacyModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="shield-checkmark" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("privacyPolicy")}</Text>
                <Text style={styles.value}>
                  {t("privacyDesc")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
            <View style={styles.cardDivider} />
            <Pressable
              onPress={() => setLanguageModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="language" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("language")}</Text>
                <Text style={styles.value}>
                  {t("languageDesc")}
                </Text>
              </View>
              <View style={styles.languageBadge}>
                {language === "da" ? <DenmarkFlag size={20} /> : <UKFlag size={20} />}
                <Text style={styles.languageCode}>{language.toUpperCase()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("supportTitle")}</Text>
          <View style={styles.card}>
            <Pressable
              onPress={() => setSupportModalVisible(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" },
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="chatbubble-ellipses" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("supportContact")}</Text>
                <Text style={styles.value}>{t("supportDesc")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textSec} />
            </Pressable>
          </View>
        </View>

        {/* Rapport / logbog */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("export")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconContainer}>
                <Ionicons name="document-text" size={18} color={THEME.textSec} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("pdfStats")}</Text>
                <Text style={styles.value}>
                  {t("pdfDesc")}
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                onPress={handleDownloadReport}
                disabled={reportLoading}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed || reportLoading ? { opacity: 0.85 } : null,
                ]}
              >
                {reportLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="download" size={18} color="#000" />
                    <Text style={styles.actionBtnText}>{t("downloadReport")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* DATA / Slet data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("data")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(255, 69, 58, 0.15)" }]}>
                <Ionicons name="trash" size={18} color={THEME.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("deleteAllData")}</Text>
                <Text style={styles.value}>
                  {t("deleteAllDataDesc")}
                </Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Pressable
                onPress={() => {
                  setDeleteConfirmText("");
                  setDeleteModalVisible(true);
                }}
                style={({ pressed }) => [
                  styles.dangerActionBtn,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="warning" size={18} color={THEME.danger} />
                <Text style={styles.dangerActionBtnText}>{t("deleteData")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Slet konto - skjult for demo-bruger */}
          {userEmail?.toLowerCase() !== DEMO_EMAIL && (
            <View style={[styles.card, { marginTop: 12 }]}>
              <View style={styles.row}>
                <View style={[styles.iconContainer, { backgroundColor: "rgba(255, 69, 58, 0.15)" }]}>
                  <Ionicons name="person-remove" size={18} color={THEME.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {language === "da" ? "Slet konto" : "Delete account"}
                  </Text>
                  <Text style={styles.value}>
                    {language === "da"
                      ? "Slet din konto og alle tilknyttede data permanent"
                      : "Permanently delete your account and all associated data"}
                  </Text>
                </View>
              </View>
              <View style={styles.cardFooter}>
                <Pressable
                  onPress={() => {
                    setDeleteAccountConfirmText("");
                    setDeleteAccountModalVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.dangerActionBtn,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="close-circle" size={18} color={THEME.danger} />
                  <Text style={styles.dangerActionBtnText}>
                    {language === "da" ? "Slet konto" : "Delete account"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Log ud */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={THEME.danger} />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>

      </ScrollView>

      {/* Privatlivspolitik modal */}
      <Modal
        transparent
        visible={privacyModalVisible}
        animationType="slide"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>
              {language === "da" ? "Privatlivspolitik" : "Privacy Policy"}
            </Text>
            <ScrollView style={{ maxHeight: 420, marginBottom: 12 }}>
              {language === "da" ? (
                <>
                  <Text style={styles.modalText}>
                    Dataansvarlig: Sea Trout Log (kontakt: support@havorredlogbog.dk).
                  </Text>

                  <Text style={styles.modalText}>
                    Formål og behandlingsgrundlag (GDPR art. 6(1)(b/f/a)):
                    {"\n"}• Konto og login via Firebase Authentication (opfyldelse af aftalen om at levere appen).
                    {"\n"}• Gemme ture, fangster, noter og spots i Firestore og lokalt (aftale).
                    {"\n"}• Lokation under aktive ture for rute, distance, varighed og statistik (samtykke til lokation + aftale).
                    {"\n"}• Notifikationer om tracking/status (samtykke når du aktiverer notifikationer).
                    {"\n"}• Generering af vejrdata/rapporter til dig (legitim interesse/aftale).
                  </Text>

                  <Text style={styles.modalText}>
                    Kategorier af data:
                    {"\n"}• Konto: email, UID fra Firebase.
                    {"\n"}• Ture/fangster: start-/sluttid, rute (GPS-punkter), distance, varighed, fangster, noter, spots (navn/position).
                    {"\n"}• Enhedsdata til funktioner: push-token til notifikationer, cache/lagring offline.
                  </Text>

                  <Text style={styles.modalText}>
                    Lokation: Indsamles kun når du starter en tur (forgrund og baggrund). Ikke aktiv når ingen tur kører. Baggrundslokation bruges kun til den igangværende tur.
                  </Text>

                  <Text style={styles.modalText}>
                    Modtagere/databehandlere:
                    {"\n"}• Google/Firebase (Authentication, Firestore, Cloud Messaging).
                    {"\n"}• Google Maps/Place tiles til kortvisning.
                    {"\n"}• Open-Meteo (vejrdata baseret på turens position, DMI HARMONIE-model).
                    {"\n"}• Expo/Google for push-notifikationer og app-opdateringer (EAS/OTA).
                    {"\n"}Ingen annonceringsnetværk bruges.
                  </Text>

                  <Text style={styles.modalText}>
                    Overførsler uden for EU/EØS: Firebase/Google og Expo kan behandle data i/uden for EU. Overførsler sker med standardkontraktbestemmelser (SCC) fra udbyderne.
                  </Text>

                  <Text style={styles.modalText}>
                    Opbevaring:
                    {"\n"}• Dine data bevares, indtil du sletter dem eller lukker din konto.
                    {"\n"}• Offline-cache på enheden slettes, hvis du vælger "Slet data" eller afinstallerer appen.
                  </Text>

                  <Text style={styles.modalText}>
                    Dine rettigheder (kontakt os for at bruge dem):
                    {"\n"}• Indsigt, berigtigelse, sletning, begrænsning, dataportabilitet og indsigelse.
                    {"\n"}• Tilbagetræk samtykke til lokation/notifikationer i appens indstillinger eller OS-indstillinger.
                    {"\n"}• Klage til Datatilsynet (www.datatilsynet.dk).
                  </Text>

                  <Text style={styles.modalText}>
                    Sikkerhed: Data lagres i Firebase med adgangskontrol. Lokale data ligger i appens lagring (AsyncStorage) og er ikke delt med andre apps.
                  </Text>

                  <Text style={styles.modalText}>
                    Automatiske afgørelser/profilering: Ingen.
                  </Text>

                  <Text style={[styles.modalText, { fontStyle: "italic" }]}>
                    Senest opdateret: Februar 2026.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.modalText}>
                    Data Controller: Sea Trout Log (contact: support@havorredlogbog.dk).
                  </Text>

                  <Text style={styles.modalText}>
                    Purpose and Legal Basis (GDPR Art. 6(1)(b/f/a)):
                    {"\n"}• Account and login via Firebase Authentication (contract performance to deliver the app).
                    {"\n"}• Storing trips, catches, notes and spots in Firestore and locally (contract).
                    {"\n"}• Location during active trips for route, distance, duration and statistics (consent for location + contract).
                    {"\n"}• Notifications about tracking/status (consent when you enable notifications).
                    {"\n"}• Generation of weather data/reports for you (legitimate interest/contract).
                  </Text>

                  <Text style={styles.modalText}>
                    Categories of Data:
                    {"\n"}• Account: email, UID from Firebase.
                    {"\n"}• Trips/catches: start/end time, route (GPS points), distance, duration, catches, notes, spots (name/position).
                    {"\n"}• Device data for features: push token for notifications, offline cache/storage.
                  </Text>

                  <Text style={styles.modalText}>
                    Location: Only collected when you start a trip (foreground and background). Not active when no trip is running. Background location is only used for the current trip.
                  </Text>

                  <Text style={styles.modalText}>
                    Recipients/Data Processors:
                    {"\n"}• Google/Firebase (Authentication, Firestore, Cloud Messaging).
                    {"\n"}• Google Maps/Place tiles for map display.
                    {"\n"}• Open-Meteo (weather data based on trip position, DMI HARMONIE model).
                    {"\n"}• Expo/Google for push notifications and app updates (EAS/OTA).
                    {"\n"}No advertising networks are used.
                  </Text>

                  <Text style={styles.modalText}>
                    Transfers outside EU/EEA: Firebase/Google and Expo may process data in/outside EU. Transfers are made with Standard Contractual Clauses (SCC) from the providers.
                  </Text>

                  <Text style={styles.modalText}>
                    Retention:
                    {"\n"}• Your data is retained until you delete it or close your account.
                    {"\n"}• Offline cache on the device is deleted if you choose "Delete data" or uninstall the app.
                  </Text>

                  <Text style={styles.modalText}>
                    Your Rights (contact us to exercise them):
                    {"\n"}• Access, rectification, erasure, restriction, data portability and objection.
                    {"\n"}• Withdraw consent for location/notifications in app settings or OS settings.
                    {"\n"}• Complaint to the Danish Data Protection Agency (www.datatilsynet.dk).
                  </Text>

                  <Text style={styles.modalText}>
                    Security: Data is stored in Firebase with access control. Local data is in app storage (AsyncStorage) and is not shared with other apps.
                  </Text>

                  <Text style={styles.modalText}>
                    Automated Decisions/Profiling: None.
                  </Text>

                  <Text style={[styles.modalText, { fontStyle: "italic" }]}>
                    Last updated: February 2026.
                  </Text>
                </>
              )}
            </ScrollView>
            <Pressable
              onPress={() => setPrivacyModalVisible(false)}
              style={({ pressed }) => [
                styles.choiceBtn,
                { marginTop: 4, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.choiceBtnText}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>


      {/* Slet-data modal */}
      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (deleteLoading) return;
          setDeleteModalVisible(false);
          setDeleteConfirmText("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("deleteTitle")}</Text>
            <Text style={styles.modalText}>
              {t("deleteWarning")}
            </Text>
            <Text style={[styles.modalText, { marginTop: 8 }]}>
              {t("deleteConfirmPrompt")}{" "}
              <Text style={{ fontWeight: "700", color: THEME.text }}>
                {t("deleteConfirmWord")}
              </Text>{" "}
              {t("deleteConfirmEnd")}
            </Text>

            <TextInput
              style={styles.confirmInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={t("deleteConfirmWord")}
              placeholderTextColor={THEME.textSec}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              style={({ pressed }) => [
                styles.deleteConfirmBtn,
                { opacity: pressed || deleteLoading ? 0.9 : 1 },
                deleteConfirmText.trim() !== t("deleteConfirmWord") || deleteLoading
                  ? { opacity: 0.4 }
                  : null,
              ]}
              disabled={
                deleteConfirmText.trim() !== t("deleteConfirmWord") || deleteLoading
              }
              onPress={handleConfirmDeleteData}
            >
              {deleteLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.deleteConfirmText}>{t("deleteAllData")}</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                if (deleteLoading) return;
                setDeleteModalVisible(false);
                setDeleteConfirmText("");
              }}
            >
              <Text style={styles.modalCancelText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Efter-sletning modal (pæn UI) */}
      <Modal
        transparent
        visible={deleteDoneModalVisible}
        animationType="fade"
        onRequestClose={() => setDeleteDoneModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View
              style={{
                alignSelf: "center",
                marginBottom: 10,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: THEME.accentMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={26} color="#F59E0B" />
            </View>
            <Text style={styles.modalTitle}>{t("deleteSuccess")}</Text>
            <Text style={styles.modalText}>
              {t("deleteSuccessMsg")}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => setDeleteDoneModalVisible(false)}
            >
              <Text style={styles.choiceBtnText}>{t("ok")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PDF-valg modal */}
      <Modal
        transparent
        visible={reportModalVisible}
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setReportModalVisible(false)}
        >
          <Pressable
            style={[styles.modalBox, { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 }]}
            onPress={() => {}}
          >
            {/* Drag indicator */}
            <View style={styles.dragIndicator} />

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Ionicons name="document-text" size={22} color={THEME.accent} />
              <Text style={styles.modalTitle}>{t("downloadStats")}</Text>
            </View>
            <Text style={[styles.modalText, { marginBottom: 16 }]}>
              {t("downloadStatsDesc")}
            </Text>

            {/* This Year */}
            <Pressable
              style={({ pressed }) => [
                styles.reportCard,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => handleReportChoice("year")}
            >
              <View style={[styles.reportCardIcon, { backgroundColor: "#F59E0B25" }]}>
                <Ionicons name="calendar-outline" size={20} color={THEME.accent} />
              </View>
              <View style={styles.reportCardContent}>
                <Text style={styles.reportCardTitle}>{thisYear}</Text>
                <Text style={styles.reportCardSubtitle}>{t("currentYear")}</Text>
              </View>
              <View style={styles.reportCardChevron}>
                <Ionicons name="chevron-forward" size={18} color={THEME.textTertiary} />
              </View>
            </Pressable>

            {/* All Time */}
            <Pressable
              style={({ pressed }) => [
                styles.reportCard,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => handleReportChoice("all")}
            >
              <View style={[styles.reportCardIcon, { backgroundColor: "#22C55E25" }]}>
                <Ionicons name="trending-up-outline" size={20} color={THEME.success} />
              </View>
              <View style={styles.reportCardContent}>
                <Text style={styles.reportCardTitle}>{t("allTime")}</Text>
                <Text style={styles.reportCardSubtitle}>{language === "da" ? "Hele din historik" : "Complete history"}</Text>
              </View>
              <View style={styles.reportCardChevron}>
                <Ionicons name="chevron-forward" size={18} color={THEME.textTertiary} />
              </View>
            </Pressable>

            {/* Both – Recommended */}
            <Pressable
              style={({ pressed }) => [
                styles.reportCard,
                styles.reportCardRecommended,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => handleReportChoice("both")}
            >
              <View style={styles.reportBadge}>
                <Text style={styles.reportBadgeText}>★</Text>
              </View>
              <View style={[styles.reportCardIcon, { backgroundColor: "#3B82F625" }]}>
                <Ionicons name="document-text-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.reportCardContent}>
                <Text style={styles.reportCardTitle}>{thisYear} + {t("allTime")}</Text>
                <Text style={styles.reportCardSubtitle}>{language === "da" ? "Anbefalet – komplet rapport" : "Recommended – complete report"}</Text>
              </View>
              <View style={styles.reportCardChevron}>
                <Ionicons name="chevron-forward" size={18} color={THEME.textTertiary} />
              </View>
            </Pressable>

            {/* Cancel */}
            <Pressable
              style={[styles.modalCancel, { marginTop: 12 }]}
              onPress={() => setReportModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>{t("close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sprog-valg modal */}
      <Modal
        transparent
        visible={languageModalVisible}
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("language")}</Text>
            <Text style={styles.modalText}>
              {t("languageDesc")}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.languageOption,
                language === "da" && styles.languageOptionActive,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => {
                setLanguage("da");
                setLanguageModalVisible(false);
              }}
            >
              <View style={styles.languageOptionFlag}>
                <DenmarkFlag size={32} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>Dansk</Text>
                <Text style={styles.languageOptionSubtitle}>Danish</Text>
              </View>
              {language === "da" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.textSec} />
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.languageOption,
                language === "en" && styles.languageOptionActive,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => {
                setLanguage("en");
                setLanguageModalVisible(false);
              }}
            >
              <View style={styles.languageOptionFlag}>
                <UKFlag size={32} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>English</Text>
                <Text style={styles.languageOptionSubtitle}>Engelsk</Text>
              </View>
              {language === "en" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.textSec} />
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setLanguageModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Slet konto modal */}
      <Modal
        transparent
        visible={deleteAccountModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (deleteAccountLoading) return;
          setDeleteAccountModalVisible(false);
          setDeleteAccountConfirmText("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View
              style={{
                alignSelf: "center",
                marginBottom: 10,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(255, 69, 58, 0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="warning" size={26} color={THEME.danger} />
            </View>
            <Text style={styles.modalTitle}>
              {language === "da" ? "Slet konto permanent" : "Delete account permanently"}
            </Text>
            <Text style={styles.modalText}>
              {language === "da"
                ? "Dette vil permanent slette din konto og alle dine data:\n\n• Alle ture og ruter\n• Alle fangster og billeder\n• Alle gemte spots\n• Din brugerprofil\n\nDenne handling kan ikke fortrydes."
                : "This will permanently delete your account and all your data:\n\n• All trips and routes\n• All catches and photos\n• All saved spots\n• Your user profile\n\nThis action cannot be undone."}
            </Text>
            <Text style={[styles.modalText, { marginTop: 8 }]}>
              {language === "da" ? "Skriv " : "Type "}
              <Text style={{ fontWeight: "700", color: THEME.danger }}>
                {language === "da" ? "SLET" : "DELETE"}
              </Text>
              {language === "da" ? " for at bekræfte:" : " to confirm:"}
            </Text>

            <TextInput
              style={styles.confirmInput}
              value={deleteAccountConfirmText}
              onChangeText={setDeleteAccountConfirmText}
              placeholder={language === "da" ? "SLET" : "DELETE"}
              placeholderTextColor={THEME.textSec}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Pressable
              style={({ pressed }) => [
                styles.deleteConfirmBtn,
                { opacity: pressed || deleteAccountLoading ? 0.9 : 1 },
                deleteAccountConfirmText.trim().toUpperCase() !== (language === "da" ? "SLET" : "DELETE") || deleteAccountLoading
                  ? { opacity: 0.4 }
                  : null,
              ]}
              disabled={
                deleteAccountConfirmText.trim().toUpperCase() !== (language === "da" ? "SLET" : "DELETE") || deleteAccountLoading
              }
              onPress={handleConfirmDeleteAccount}
            >
              {deleteAccountLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.deleteConfirmText}>
                  {language === "da" ? "Slet min konto" : "Delete my account"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                if (deleteAccountLoading) return;
                setDeleteAccountModalVisible(false);
                setDeleteAccountConfirmText("");
              }}
            >
              <Text style={styles.modalCancelText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Credits Modal */}
      <Modal
        transparent
        visible={creditsModalVisible}
        animationType="fade"
        onRequestClose={() => setCreditsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.creditsModal}>
            {/* Header */}
            <View style={styles.creditsHeader}>
              <View style={styles.creditsIconCircle}>
                <Ionicons name="code-slash" size={32} color={THEME.accent} />
              </View>
              <Text style={styles.creditsDevLabel}>
                {language === "da" ? "Udviklet af" : "Developed by"}
              </Text>
              <Text style={styles.creditsDevName}>Daniel Lings</Text>
            </View>

            {/* Credits Description */}
            <Text style={styles.creditsDesc}>
              {language === "da"
                ? "Kreditlisten er lavet for at udtrykke taknemmelighed for testere, yderst hjælpsom feedback og app-promovering."
                : "The credits list expresses gratitude for testers, invaluable feedback, and app promotion."}
            </Text>

            {/* Testers Section */}
            <View style={styles.creditsSection}>
              <View style={styles.creditsSectionHeader}>
                <Ionicons name="heart" size={16} color={THEME.accent} />
                <Text style={styles.creditsSectionTitle}>
                  {language === "da"
                    ? "Tak til de hidtil hjælpende brugere!"
                    : "Thanks to the helpful users so far!"}
                </Text>
              </View>

              <View style={styles.testersList}>
                {TESTERS.map((tester, index) => (
                  <View
                    key={tester.name}
                    style={[
                      styles.testerRow,
                      index < TESTERS.length - 1 && styles.testerRowBorder,
                    ]}
                  >
                    <View style={styles.testerAvatar}>
                      <Ionicons name="person" size={20} color={THEME.accent} />
                    </View>
                    <View style={styles.testerInfo}>
                      <Text style={styles.testerName}>{tester.name}</Text>
                      <Text style={styles.testerRole}>{tester.role}</Text>
                    </View>
                    <Ionicons name="star" size={16} color={THEME.accent} />
                  </View>
                ))}
              </View>
            </View>

            {/* Close Button */}
            <Pressable
              style={styles.creditsCloseBtn}
              onPress={() => setCreditsModalVisible(false)}
            >
              <Text style={styles.creditsCloseBtnText}>
                {language === "da" ? "Luk" : "Close"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Support Modal */}
      <Modal
        transparent
        visible={supportModalVisible}
        animationType="slide"
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { maxHeight: "85%" }]}>
            {supportSent ? (
              /* ---- Success view ---- */
              <View style={styles.supportSuccessWrap}>
                <View style={styles.supportSuccessIcon}>
                  <Ionicons name="checkmark" size={32} color={THEME.accent} />
                </View>
                <Text style={styles.supportSuccessTitle}>{t("supportSentTitle")}</Text>
                <Text style={styles.supportSuccessText}>{t("supportSentDesc")}</Text>
                <Pressable
                  style={styles.supportSuccessBtn}
                  onPress={() => {
                    setSupportSent(false);
                    setSupportModalVisible(false);
                  }}
                >
                  <Text style={styles.supportSuccessBtnText}>{t("ok")}</Text>
                </Pressable>
              </View>
            ) : (
              /* ---- Form view ---- */
              <>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalTitle}>{t("supportTitle")}</Text>
                  <Text style={[styles.modalText, { marginBottom: 20 }]}>
                    {t("supportModalDesc")}
                  </Text>

                  {/* Category picker */}
                  <Text style={styles.supportFieldLabel}>{t("supportCategoryLabel")}</Text>
                  <Pressable
                    style={styles.supportPickerBtn}
                    onPress={() => setSupportCategoryPickerVisible(!supportCategoryPickerVisible)}
                  >
                    <Text style={[
                      styles.supportPickerText,
                      !supportCategory && { color: THEME.textTertiary },
                    ]}>
                      {supportCategory
                        ? getSupportCategoryLabel(supportCategory)
                        : t("supportChooseCategory")}
                    </Text>
                    <Ionicons
                      name={supportCategoryPickerVisible ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={THEME.textSec}
                    />
                  </Pressable>

                  {supportCategoryPickerVisible && (
                    <View style={styles.supportCategoryList}>
                      {SUPPORT_CATEGORIES.map((cat) => (
                        <Pressable
                          key={cat.key}
                          style={({ pressed }) => [
                            styles.supportCategoryRow,
                            pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
                            supportCategory === cat.key && { backgroundColor: THEME.accentMuted },
                          ]}
                          onPress={() => {
                            setSupportCategory(cat.key);
                            setSupportCategoryPickerVisible(false);
                          }}
                        >
                          <Text style={[
                            styles.supportCategoryRowText,
                            supportCategory === cat.key && { color: THEME.accent },
                          ]}>
                            {language === "da" ? cat.da : cat.en}
                          </Text>
                          {supportCategory === cat.key && (
                            <Ionicons name="checkmark" size={20} color={THEME.accent} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Message */}
                  <Text style={[styles.supportFieldLabel, { marginTop: 16 }]}>
                    {t("supportMessageLabel")}
                  </Text>
                  <TextInput
                    style={styles.supportTextArea}
                    value={supportMessage}
                    onChangeText={setSupportMessage}
                    placeholder={t("supportMessagePlaceholder")}
                    placeholderTextColor={THEME.textTertiary}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                  />
                </ScrollView>

                {/* Buttons */}
                <View style={styles.supportBtnRow}>
                  <Pressable
                    style={styles.supportCancelBtn}
                    onPress={() => {
                      setSupportModalVisible(false);
                      setSupportCategory(null);
                      setSupportMessage("");
                    }}
                  >
                    <Text style={styles.supportCancelText}>{t("cancel")}</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.supportSendBtn,
                      (!supportCategory || !supportMessage.trim()) && { opacity: 0.4 },
                    ]}
                    onPress={sendSupport}
                    disabled={supportSending}
                  >
                    {supportSending ? (
                      <ActivityIndicator size="small" color={THEME.primaryText} />
                    ) : (
                      <Text style={styles.supportSendText}>{t("supportSend")}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
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
    backgroundColor: THEME.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "300",
    color: THEME.text,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.accent,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    overflow: "hidden",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 0,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.text,
  },
  value: {
    fontSize: 13,
    color: THEME.textSec,
    marginTop: 2,
    lineHeight: 18,
  },
  versionBadge: {
    backgroundColor: THEME.elevated,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  versionText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSec,
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 4,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.accent,
  },
  subscriptionDetails: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  subscriptionDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  subscriptionDetailText: {
    fontSize: 13,
    color: THEME.textSec,
  },
  subscriptionWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.dangerMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  subscriptionWarningText: {
    fontSize: 12,
    color: THEME.danger,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.accent,
    borderRadius: 16,
    height: 56,
  },
  actionBtnText: {
    color: THEME.primaryText,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    height: 56,
  },
  secondaryBtnText: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  dangerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.dangerMuted,
    borderRadius: 16,
    height: 48,
  },
  dangerActionBtnText: {
    color: THEME.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: THEME.accent,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: THEME.primaryText,
    fontSize: 15,
    fontWeight: "600",
  },
  dangerBtn: {
    backgroundColor: THEME.danger,
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  logoutBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.dangerMuted,
    borderRadius: 16,
    height: 56,
  },
  logoutText: {
    color: THEME.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  footerText: {
    textAlign: "center",
    color: THEME.textSec,
    fontSize: 12,
    marginTop: 24,
  },

  // Modal til valg af rapport / slet data / besked
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 22,
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalText: {
    color: THEME.textSec,
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  // (how-to modal fjernet)
  trackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  trackCard: {
    borderRadius: 16,
    backgroundColor: THEME.elevated,
    padding: 12,
    marginBottom: 10,
  },
  trackBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  trackBtnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  trackBtnGhost: {
    width: 64,
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  trackList: {
    gap: 6,
  },
  statsRows: {
    gap: 6,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pdfBtnMock: {
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME.accent,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBtn: {
    backgroundColor: THEME.accent,
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  choiceBtnText: {
    color: THEME.primaryText,
    fontSize: 15,
    fontWeight: "600",
  },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  modalCancelText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "500",
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.textTertiary,
    alignSelf: "center",
    marginBottom: 14,
  },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.elevated,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  reportCardRecommended: {
    borderColor: THEME.accentBorder,
    borderWidth: 1.5,
  },
  reportCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCardContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  reportCardTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "600",
  },
  reportCardSubtitle: {
    color: THEME.textSec,
    fontSize: 13,
    marginTop: 2,
  },
  reportCardChevron: {
    justifyContent: "center",
  },
  reportBadge: {
    position: "absolute",
    top: 8,
    right: 12,
  },
  reportBadgeText: {
    color: THEME.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  confirmInput: {
    marginTop: 10,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: THEME.text,
    fontSize: 16,
  },
  deleteConfirmBtn: {
    backgroundColor: THEME.danger,
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  deleteConfirmText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  languageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.elevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 4,
  },
  languageFlag: {
    // Vector flag container - no fontSize needed
  },
  languageCode: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.text,
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  languageOptionActive: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentMuted,
  },
  languageOptionFlag: {
    width: 32,
    height: 24,
    borderRadius: 3,
    overflow: "hidden",
  },
  languageOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.text,
  },
  languageOptionSubtitle: {
    fontSize: 13,
    color: THEME.textSec,
    marginTop: 2,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  colorOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.text,
  },
  colorOptionCode: {
    fontSize: 12,
    color: THEME.textSec,
    marginTop: 2,
    fontFamily: "monospace",
  },

  // Credits Modal Styles
  creditsModal: {
    width: "100%",
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  creditsHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  creditsIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  creditsDevLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  creditsDevName: {
    fontSize: 24,
    fontWeight: "300",
    color: THEME.text,
  },
  creditsDesc: {
    fontSize: 13,
    color: THEME.textSec,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  creditsSection: {
    width: "100%",
    marginBottom: 24,
  },
  creditsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  creditsSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.text,
    flex: 1,
  },
  testersList: {
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    overflow: "hidden",
  },
  testerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  testerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  testerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  testerAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.accent,
  },
  testerInfo: {
    flex: 1,
  },
  testerName: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 2,
  },
  testerRole: {
    fontSize: 12,
    color: THEME.textSec,
  },
  creditsCloseBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    backgroundColor: THEME.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  creditsCloseBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.textSec,
  },

  // Support Modal Styles
  supportFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  supportPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  supportPickerText: {
    fontSize: 15,
    color: THEME.text,
  },
  supportTextArea: {
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    fontSize: 15,
    color: THEME.text,
    minHeight: 120,
  },
  supportSuccessWrap: {
    alignItems: "center",
    paddingVertical: 24,
  },
  supportSuccessIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  supportSuccessTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
    marginBottom: 8,
  },
  supportSuccessText: {
    fontSize: 14,
    color: THEME.textSec,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  supportSuccessBtn: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  supportSuccessBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.primaryText,
  },
  supportBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  supportCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: THEME.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  supportCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.textSec,
  },
  supportSendBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  supportSendText: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.primaryText,
  },
  supportCategoryList: {
    backgroundColor: THEME.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginTop: 8,
    overflow: "hidden",
  },
  supportCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  supportCategoryRowText: {
    fontSize: 15,
    color: THEME.text,
  },
});
