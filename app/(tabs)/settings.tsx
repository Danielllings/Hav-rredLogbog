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

type ReportChoice = "year" | "all" | "both";

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

  // Credits - testere og medvirkende
  const TESTERS = [
    { name: "Sergio JB", role: "Beta Tester" },
  ];

  const { language, setLanguage, t } = useLanguage();
  const { theme: dynamicTheme } = useTheme();

  const thisYear = new Date().getFullYear();

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

    // PDF oversættelser
    const pdfText = language === "da" ? {
      fishingReport: "Fiskerapport",
      seaTroutLog: "Havørred Logbog",
      generated: "Genereret",
      generatedBy: "Genereret af Havørred Logbog",
      statistics: "Statistik",
      allTimeStatistics: "All-Time Statistik",
      currentYear: "Indeværende år",
      total: "Samlet",
      totalTrips: "Ture i alt",
      catchTrips: "Fangstture",
      blankTrips: "Nulture",
      fishCaught: "Fisk fanget",
      kmFished: "Km fisket",
      hoursFished: "Timer fisket",
      catchRate: "Fangstrate",
      fishPerHour: "Fisk pr. time",
      multiCatchRate: "Multi-fangst rate",
      spots: "Spots",
      visitedSpots: "Besøgte spots",
      mostVisited: "Mest besøgt",
      bestSpot: "Bedste spot",
      trips: "ture",
      fish: "fisk",
      fishPerTrip: "fisk/tur",
      fishingPattern: "Fiskemønster",
      youCatchMostUnder: "Du fanger flest fisk under disse forhold",
      catchDistribution: "Fordeling af fangster",
      noPatternYet: "Ingen fiskemønstre endnu - fang flere fisk for at se mønstre.",
      noSummaryYet: "Ingen samlet opsummering endnu.",
      allTime: "All-Time",
    } : {
      fishingReport: "Fishing Report",
      seaTroutLog: "Sea Trout Log",
      generated: "Generated",
      generatedBy: "Generated by Sea Trout Log",
      statistics: "Statistics",
      allTimeStatistics: "All-Time Statistics",
      currentYear: "Current year",
      total: "Total",
      totalTrips: "Total trips",
      catchTrips: "Catch trips",
      blankTrips: "Blank trips",
      fishCaught: "Fish caught",
      kmFished: "Km fished",
      hoursFished: "Hours fished",
      catchRate: "Catch rate",
      fishPerHour: "Fish per hour",
      multiCatchRate: "Multi-catch rate",
      spots: "Spots",
      visitedSpots: "Visited spots",
      mostVisited: "Most visited",
      bestSpot: "Best spot",
      trips: "trips",
      fish: "fish",
      fishPerTrip: "fish/trip",
      fishingPattern: "Fishing Pattern",
      youCatchMostUnder: "You catch most fish under these conditions",
      catchDistribution: "Catch distribution",
      noPatternYet: "No fishing patterns yet - catch more fish to see patterns.",
      noSummaryYet: "No summary available yet.",
      allTime: "All-Time",
    };

    // Oversættelse af gruppe-titler og labels fra patternAnalysis
    const groupTitleMap: Record<string, string> = language === "en" ? {
      "Årstid": "Season",
      "Tid på dagen": "Time of day",
      "Vandstand": "Water level",
      "Havtemperatur": "Sea temperature",
      "Lufttemperatur": "Air temperature",
      "Vindstyrke": "Wind strength",
      "Vindretning": "Wind direction",
      "Vind ift. kyst": "Wind vs. coast",
      "Turlængde": "Trip duration",
      "Bevægelse": "Movement",
      "Spots med flest fisk": "Top spots",
    } : {};

    const labelMap: Record<string, string> = language === "en" ? {
      // Seasons
      "Foråret": "Spring",
      "Sommeren": "Summer",
      "Efteråret": "Autumn",
      "Vinteren": "Winter",
      // Time of day
      "Morgenen": "Morning",
      "Formiddagen": "Late morning",
      "Eftermiddagen": "Afternoon",
      "Aftenen": "Evening",
      "Natten": "Night",
      // Water level
      "Lavvande": "Low tide",
      "Højvande": "High tide",
      "Middel vandstand": "Medium tide",
      "ukendt": "Unknown",
      // Wind strength
      "svag vind": "Light wind",
      "mild vind": "Mild wind",
      "frisk vind": "Fresh wind",
      "hård vind": "Strong wind",
      // Wind vs coast
      "fralandsvind": "Offshore wind",
      "pålandsvind": "Onshore wind",
      "sidevind": "Side wind",
      // Wind directions
      "Nord": "North",
      "Nordøst": "Northeast",
      "Øst": "East",
      "Sydøst": "Southeast",
      "Syd": "South",
      "Sydvest": "Southwest",
      "Vest": "West",
      "Nordvest": "Northwest",
      // Duration
      "<2 timer": "<2 hours",
      "2-4 timer": "2-4 hours",
      "4-6 timer": "4-6 hours",
      "6+ timer": "6+ hours",
      // Movement
      "Stillestående/let bevægelse": "Stationary/light movement",
      "Affiskning af vand": "Covering water",
      "Roligt tempo": "Slow pace",
    } : {};

    const translateGroupTitle = (title: string) => groupTitleMap[title] || title;
    const translateLabel = (label: string) => labelMap[label] || label;

    // Oversæt fulde linjer fra fiskemønsteret
    const translatePatternLine = (line: string): string => {
      if (language === "da") return line;

      // Spot: X
      if (line.startsWith("Spot: ")) {
        return "Spot: " + line.substring(6);
      }

      // Simple replacements
      const lineMap: Record<string, string> = {
        "Lavvande": "Low tide",
        "Højvande": "High tide",
        "Middel vandstand": "Medium tide",
        "Svag vindstyrke": "Light wind",
        "Mild vindstyrke": "Mild wind",
        "Frisk vindstyrke": "Fresh wind",
        "Hård vindstyrke": "Strong wind",
        "Ved fralandsvind": "With offshore wind",
        "Ved pålandsvind": "With onshore wind",
        "Ved sidevind": "With side wind",
        "Flest fisk ved affiskning af vand": "Most fish when covering water",
        "Flest fisk ved stillestående/rolig placering": "Most fish when stationary",
      };

      if (lineMap[line]) return lineMap[line];

      // Vindretning: X
      if (line.startsWith("Vindretning: ")) {
        const dir = line.substring(13);
        return "Wind direction: " + (labelMap[dir] || dir);
      }

      // Om morgenen/eftermiddagen/etc.
      if (line.startsWith("Om ")) {
        const rest = line.substring(3);
        const todMap: Record<string, string> = {
          "morgenen": "in the morning",
          "formiddagen": "in late morning",
          "eftermiddagen": "in the afternoon",
          "aftenen": "in the evening",
          "natten": "at night",
          "foråret": "in spring",
          "sommeren": "in summer",
          "efteråret": "in autumn",
          "vinteren": "in winter",
        };
        if (todMap[rest]) return todMap[rest].charAt(0).toUpperCase() + todMap[rest].slice(1);
      }

      // Havtemperatur: X
      if (line.startsWith("Havtemperatur: ")) {
        return "Sea temperature: " + line.substring(15);
      }

      // Lufttemperatur: X
      if (line.startsWith("Lufttemperatur: ")) {
        return "Air temperature: " + line.substring(16);
      }

      // Typisk X min før/efter solopgang/solnedgang
      const sunMatch = line.match(/^Typisk (\d+) min (før|efter) (solopgang|solnedgang)$/);
      if (sunMatch) {
        const [, mins, dir, event] = sunMatch;
        const dirEn = dir === "før" ? "before" : "after";
        const eventEn = event === "solopgang" ? "sunrise" : "sunset";
        return `Typically ${mins} min ${dirEn} ${eventEn}`;
      }

      // Turlængde: X giver flest fisk
      const durMatch = line.match(/^Turlængde: (.+) giver flest fisk$/);
      if (durMatch) {
        const dur = translateLabel(durMatch[1]);
        return `Trip duration: ${dur} yields most fish`;
      }

      // Flest fisk ved X
      if (line.startsWith("Flest fisk ved ")) {
        const rest = line.substring(15);
        return "Most fish with " + (labelMap[rest] || rest);
      }

      // Prognose: kig efter X for bedste match
      const progMatch = line.match(/^Prognose: kig efter (.+) for bedste match$/);
      if (progMatch) {
        const hints = progMatch[1].split(", ").map(h => translateLabel(h)).join(", ");
        return `Forecast: look for ${hints} for best match`;
      }

      // Vind ift. kyst: X
      if (line.startsWith("Vind ift. kyst: ")) {
        const wind = line.substring(16);
        return "Wind vs. coast: " + (labelMap[wind] || wind);
      }

      return line;
    };

    try {
      const year = new Date().getFullYear();

      const yearStats: any = await withTimeout(
        statsTrips(year),
        15000,
        "statsTrips(year)"
      );
      const allStats: any = await withTimeout(
        statsTrips(),
        15000,
        "statsTrips(all)"
      );

      const allTripsArr: any[] = await withTimeout(
        listTrips(1000, 0),
        20000,
        "listTrips"
      );
      const yearTripsArr = allTripsArr.filter((t) => {
        if (!t.start_ts) return false;
        const d = new Date(t.start_ts);
        return d.getFullYear() === year;
      });

      const allSpots: any[] = await withTimeout(
        listSpots(),
        15000,
        "listSpots"
      );

      const dateStr = new Date().toLocaleDateString(language === "da" ? "da-DK" : "en-US");

      const safe = (v: any, fallback = "0") =>
        v === null || v === undefined ? fallback : String(v);

      // ÅR
      const yearTrips = safe(yearStats?.trips, "0");
      const yearFish = safe(yearStats?.total_fish, "0");
      const yearKm = ((yearStats?.total_m ?? 0) / 1000).toFixed(1);
      const yearHours = ((yearStats?.total_sec ?? 0) / 3600).toFixed(1);
      const yearNullTrips = safe(yearStats?.null_trips, "0");
      const yearCatchTrips = safe(yearStats?.catch_trips, "0");
      const yearFangstrate = safe(yearStats?.fangstrate ?? "0", "0");
      const yearFishPerHour = safe(yearStats?.fish_per_hour ?? "0", "0");
      const yearMulti =
        yearStats?.multi_fish_rate != null
          ? `${yearStats.multi_fish_rate}%`
          : "0%";

      // ALL TIME
      const allTrips = safe(allStats?.trips, "0");
      const allFish = safe(allStats?.total_fish, "0");
      const allKm = ((allStats?.total_m ?? 0) / 1000).toFixed(1);
      const allHours = ((allStats?.total_sec ?? 0) / 3600).toFixed(1);
      const allNullTrips = safe(allStats?.null_trips, "0");
      const allCatchTrips = safe(allStats?.catch_trips, "0");
      const allFangstrate = safe(allStats?.fangstrate ?? "0", "0");
      const allFishPerHour = safe(allStats?.fish_per_hour ?? "0", "0");
      const allMulti =
        allStats?.multi_fish_rate != null
          ? `${allStats.multi_fish_rate}%`
          : "0%";

      const yearPatternReport =
        yearTripsArr.length > 0 ? buildWeatherSummary(yearTripsArr, allSpots) : null;
      const allTimePatternReport =
        allTripsArr.length > 0 ? buildWeatherSummary(allTripsArr, allSpots) : null;

      const yearSpotSummary = buildSpotSummary(yearTripsArr, allSpots);
      const allSpotSummary = buildSpotSummary(allTripsArr, allSpots);

      const renderPatternLines = (lines: string[], hasGroups: boolean) => {
        if (!lines.length) {
          const msg = hasGroups
            ? pdfText.noSummaryYet
            : pdfText.noPatternYet;
          return `<div class="pattern-empty">${msg}</div>`;
        }
        return `<ul>${lines.map((line) => `<li>${translatePatternLine(line)}</li>`).join("")}</ul>`;
      };

      const renderPatternGroups = (groups: PatternGroup[]) => {
        if (!groups.length) return "";
        return `
          <div class="pattern-detail-title">${pdfText.catchDistribution}</div>
          <div class="pattern-grid">
            ${groups
              .map((group) => {
                const rows = group.items
                  .map(
                    (item) =>
                      `<div class="pattern-row"><span class="pattern-row-label">${translateLabel(item.label)}</span><span class="pattern-row-value">${item.fish} ${pdfText.fish} (${item.share}%)</span></div>`
                  )
                  .join("");
                return `
                  <div class="pattern-group">
                    <div class="pattern-group-title">${translateGroupTitle(group.title)}</div>
                    ${rows}
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      };

      let sectionsHtml = "";

      // ÅRSSEKTION
      try {
        if (choice === "year" || choice === "both") {
          sectionsHtml += `
          <section class="section">
            <div class="section-header">
              <h2>${pdfText.statistics} ${year}</h2>
              <span class="badge">${pdfText.currentYear}</span>
            </div>

            <div class="stats-grid">
              <div class="stat-cell">
                <div class="stat-label">${pdfText.totalTrips}</div>
                <div class="stat-value">${yearTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.catchTrips}</div>
                <div class="stat-value highlight">${yearCatchTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.blankTrips}</div>
                <div class="stat-value">${yearNullTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.fishCaught}</div>
                <div class="stat-value highlight">${yearFish}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.kmFished}</div>
                <div class="stat-value">${yearKm}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.hoursFished}</div>
                <div class="stat-value">${yearHours}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.catchRate}</div>
                <div class="stat-value">${yearFangstrate}%</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.fishPerHour}</div>
                <div class="stat-value">${yearFishPerHour}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.multiCatchRate}</div>
                <div class="stat-value">${yearMulti}</div>
              </div>
            </div>
        `;

          if (yearSpotSummary) {
            sectionsHtml += `
            <div class="info-box">
              <div class="info-box-title">${pdfText.spots} (${year})</div>
              <ul>
                <li><strong>${pdfText.visitedSpots}:</strong> ${yearSpotSummary.totalSpots}</li>
                <li><strong>${pdfText.mostVisited}:</strong> ${yearSpotSummary.mostVisited.name} (${yearSpotSummary.mostVisited.trips} ${pdfText.trips}, ${yearSpotSummary.mostVisited.fish} ${pdfText.fish})</li>
                <li><strong>${pdfText.bestSpot}:</strong> ${yearSpotSummary.bestCatch.name} (${yearSpotSummary.bestCatch.fish} ${pdfText.fish} / ${yearSpotSummary.bestCatch.trips} ${pdfText.trips} = ${yearSpotSummary.bestCatch.avg.toFixed(1)} ${pdfText.fishPerTrip})</li>
              </ul>
            </div>
          `;
          }

          if (yearPatternReport) {
            sectionsHtml += `
            <div class="pattern-summary">
              <div class="pattern-summary-title">${pdfText.fishingPattern} (${year})</div>
              <div class="pattern-summary-subtitle">${pdfText.youCatchMostUnder}:</div>
              ${renderPatternLines(
                yearPatternReport.lines,
                yearPatternReport.groups.length > 0
              )}
              ${renderPatternGroups(yearPatternReport.groups)}
            </div>
          `;
          }

          sectionsHtml += `</section>`;
        }
      } catch (e) {
        // console.log("Fejl i år-sektion til PDF:", e);
      }

      // ALL-TIME SEKTION
      try {
        if (choice === "all" || choice === "both") {
          sectionsHtml += `
          <section class="section">
            <div class="section-header">
              <h2>${pdfText.allTimeStatistics}</h2>
              <span class="badge">${pdfText.total}</span>
            </div>

            <div class="stats-grid">
              <div class="stat-cell">
                <div class="stat-label">${pdfText.totalTrips}</div>
                <div class="stat-value">${allTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.catchTrips}</div>
                <div class="stat-value highlight">${allCatchTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.blankTrips}</div>
                <div class="stat-value">${allNullTrips}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.fishCaught}</div>
                <div class="stat-value highlight">${allFish}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.kmFished}</div>
                <div class="stat-value">${allKm}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.hoursFished}</div>
                <div class="stat-value">${allHours}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.catchRate}</div>
                <div class="stat-value">${allFangstrate}%</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.fishPerHour}</div>
                <div class="stat-value">${allFishPerHour}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">${pdfText.multiCatchRate}</div>
                <div class="stat-value">${allMulti}</div>
              </div>
            </div>
        `;

          if (allSpotSummary) {
            sectionsHtml += `
            <div class="info-box">
              <div class="info-box-title">${pdfText.spots} (${pdfText.allTime})</div>
              <ul>
                <li><strong>${pdfText.visitedSpots}:</strong> ${allSpotSummary.totalSpots}</li>
                <li><strong>${pdfText.mostVisited}:</strong> ${allSpotSummary.mostVisited.name} (${allSpotSummary.mostVisited.trips} ${pdfText.trips}, ${allSpotSummary.mostVisited.fish} ${pdfText.fish})</li>
                <li><strong>${pdfText.bestSpot}:</strong> ${allSpotSummary.bestCatch.name} (${allSpotSummary.bestCatch.fish} ${pdfText.fish} / ${allSpotSummary.bestCatch.trips} ${pdfText.trips} = ${allSpotSummary.bestCatch.avg.toFixed(1)} ${pdfText.fishPerTrip})</li>
              </ul>
            </div>
          `;
          }

          if (allTimePatternReport) {
            sectionsHtml += `
            <div class="pattern-summary">
              <div class="pattern-summary-title">${pdfText.fishingPattern} (${pdfText.allTime})</div>
              <div class="pattern-summary-subtitle">${pdfText.youCatchMostUnder}:</div>
              ${renderPatternLines(
                allTimePatternReport.lines,
                allTimePatternReport.groups.length > 0
              )}
              ${renderPatternGroups(allTimePatternReport.groups)}
            </div>
          `;
          }

          sectionsHtml += `</section>`;
        }
      } catch (e) {
        // console.log("Fejl i all-time sektion til PDF:", e);
      }

      // PDF – blækvenlig, professionel og ren
      const html = `
        <!DOCTYPE html>
        <html lang="da">
        <head>
          <meta charset="utf-8" />
          <title>Havørred Logbog - Fiskerapport</title>
          <style>
            @page {
              margin: 15mm 12mm;
              size: A4;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
              background: #fff;
              color: #1a1a1a;
              font-size: 11px;
              line-height: 1.5;
            }
            .page {
              max-width: 100%;
            }

            /* Header */
            .report-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              padding-bottom: 12px;
              margin-bottom: 20px;
              border-bottom: 2px solid #1a1a1a;
            }
            .report-header-left h1 {
              margin: 0;
              font-size: 22px;
              font-weight: 700;
              letter-spacing: -0.02em;
              color: #1a1a1a;
            }
            .report-header-left .subtitle {
              font-size: 11px;
              color: #666;
              margin-top: 2px;
              text-transform: uppercase;
              letter-spacing: 0.1em;
            }
            .report-header-right {
              text-align: right;
              font-size: 10px;
              color: #666;
            }
            .report-header-right .date {
              font-weight: 600;
              color: #1a1a1a;
            }

            /* Section */
            .section {
              margin-bottom: 24px;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .section:not(:first-of-type) {
              page-break-before: always;
            }
            .section-header {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 12px;
              padding-bottom: 6px;
              border-bottom: 1px solid #ddd;
            }
            .section-header h2 {
              margin: 0;
              font-size: 14px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #1a1a1a;
            }
            .section-header .badge {
              font-size: 9px;
              padding: 2px 8px;
              border: 1px solid #1a1a1a;
              border-radius: 3px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }

            /* Stats Table */
            .stats-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            .stats-table th,
            .stats-table td {
              padding: 8px 12px;
              text-align: left;
              border: 1px solid #ddd;
            }
            .stats-table th {
              background: #f5f5f5;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 600;
              color: #666;
            }
            .stats-table td {
              font-size: 13px;
              font-weight: 700;
              font-variant-numeric: tabular-nums;
            }
            .stats-table tr:nth-child(even) td {
              background: #fafafa;
            }

            /* Stats Grid - kompakt alternativ */
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 1px;
              background: #ddd;
              border: 1px solid #ddd;
              margin-bottom: 16px;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .stat-cell {
              background: #fff;
              padding: 10px 12px;
            }
            .stat-cell:nth-child(even) {
              background: #fafafa;
            }
            .stat-label {
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #666;
              margin-bottom: 2px;
            }
            .stat-value {
              font-size: 16px;
              font-weight: 700;
              color: #1a1a1a;
              font-variant-numeric: tabular-nums;
            }
            .stat-value.highlight {
              color: #0066cc;
            }

            /* Info Box */
            .info-box {
              border: 1px solid #ddd;
              padding: 12px 14px;
              margin-bottom: 12px;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .info-box-title {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 8px;
              padding-bottom: 6px;
              border-bottom: 1px dashed #ddd;
            }
            .info-box ul {
              margin: 0;
              padding-left: 16px;
              font-size: 11px;
              line-height: 1.6;
            }
            .info-box li {
              margin-bottom: 3px;
            }
            .info-box li strong {
              font-weight: 600;
            }

            /* Pattern Section */
            .pattern-summary {
              border: 1px solid #ddd;
              padding: 12px 14px;
              margin-bottom: 12px;
              background: #fafafa;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .pattern-summary-title {
              font-size: 11px;
              font-weight: 700;
              margin-bottom: 6px;
            }
            .pattern-summary-subtitle {
              font-size: 10px;
              color: #666;
              margin-bottom: 8px;
            }
            .pattern-summary ul {
              margin: 0;
              padding-left: 16px;
              font-size: 11px;
            }
            .pattern-summary li {
              margin-bottom: 2px;
            }
            .pattern-empty {
              font-size: 10px;
              color: #888;
              font-style: italic;
            }

            /* Pattern Grid */
            .pattern-detail-title {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #666;
              margin: 14px 0 8px 0;
              font-weight: 600;
            }
            .pattern-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            .pattern-group {
              border: 1px solid #ddd;
              padding: 10px 12px;
              break-inside: avoid;
            }
            .pattern-group-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              margin-bottom: 8px;
              padding-bottom: 4px;
              border-bottom: 1px solid #eee;
            }
            .pattern-row {
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              padding: 3px 0;
              border-bottom: 1px dotted #eee;
            }
            .pattern-row:last-child {
              border-bottom: none;
            }
            .pattern-row-label {
              color: #333;
            }
            .pattern-row-value {
              color: #666;
              font-variant-numeric: tabular-nums;
            }

            /* Footer */
            .report-footer {
              margin-top: 30px;
              padding-top: 12px;
              border-top: 1px solid #ddd;
              font-size: 9px;
              color: #888;
              text-align: center;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .section { break-inside: avoid; }
              .pattern-group { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="report-header">
              <div class="report-header-left">
                <h1>${pdfText.fishingReport}</h1>
                <div class="subtitle">${pdfText.seaTroutLog}</div>
              </div>
              <div class="report-header-right">
                <div>${pdfText.generated}</div>
                <div class="date">${dateStr}</div>
              </div>
            </div>

            ${sectionsHtml}

            <div class="report-footer">
              ${pdfText.generatedBy} · ${dateStr}
            </div>
          </div>
        </body>
        </html>
      `;

      const { uri } = await withTimeout(
        Print.printToFileAsync({
          html,
          base64: false,
        }),
        20000,
        "printToFileAsync"
      );

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Del eller gem din statistikrapport",
        });
      } else {
        Alert.alert(
          "PDF genereret",
          "PDF-rapporten er lavet, men deling er ikke understøttet på denne enhed.\n\nSti:\n" +
            uri
        );
      }
    } catch (err: any) {
      console.error("Fejl ved PDF-generering:", err);
      Alert.alert(
        "Fejl",
        err?.message ?? "Kunne ikke generere statistikrapporten."
      );
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
            <Ionicons name="settings-outline" size={20} color={THEME.accent} />
            <Text style={styles.headerTitle}>{t("settings")}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Profil Sektion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("account")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="person" size={18} color={THEME.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("email")}</Text>
                <Text style={styles.value}>
                  {userEmail || t("notLoggedIn")}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={THEME.success} />
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="notifications" size={18} color="#F59E0B" />
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(161, 161, 170, 0.15)" }]}>
                <Ionicons name="information" size={18} color={THEME.textSec} />
              </View>
              <Text style={[styles.label, { flex: 1 }]}>{t("version")}</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>v1.0.0</Text>
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="heart" size={18} color={THEME.accent} />
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="shield-checkmark" size={18} color={THEME.success} />
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(96, 165, 250, 0.15)" }]}>
                <Ionicons name="language" size={18} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("language")}</Text>
                <Text style={styles.value}>
                  {t("languageDesc")}
                </Text>
              </View>
              <View style={styles.languageBadge}>
                <Text style={styles.languageFlag}>{language === "da" ? "🇩🇰" : "🇬🇧"}</Text>
                <Text style={styles.languageCode}>{language.toUpperCase()}</Text>
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
              <View style={[styles.iconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="document-text" size={18} color={THEME.accent} />
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

          {/* Slet konto */}
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
                    {"\n"}• DMI (vejrdata baseret på turens position).
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
                    {"\n"}• DMI (weather data based on trip position).
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
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t("downloadStats")}</Text>
            <Text style={styles.modalText}>
              {t("downloadStatsDesc")}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("year")}
            >
              <Text style={styles.choiceBtnText}>
                {thisYear} – {t("currentYear")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("all")}
            >
              <Text style={styles.choiceBtnText}>{t("allTime")}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.choiceBtn,
                pressed ? { opacity: 0.9 } : null,
              ]}
              onPress={() => handleReportChoice("both")}
            >
              <Text style={styles.choiceBtnText}>
                {thisYear} + {t("allTime")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setReportModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
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
              <Text style={styles.languageOptionFlag}>🇩🇰</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>Dansk</Text>
                <Text style={styles.languageOptionSubtitle}>Danish</Text>
              </View>
              {language === "da" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.success} />
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
              <Text style={styles.languageOptionFlag}>🇬🇧</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.languageOptionTitle}>English</Text>
                <Text style={styles.languageOptionSubtitle}>Engelsk</Text>
              </View>
              {language === "en" && (
                <Ionicons name="checkmark-circle" size={22} color={THEME.success} />
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

            {/* Testers Section */}
            <View style={styles.creditsSection}>
              <View style={styles.creditsSectionHeader}>
                <Ionicons name="heart" size={16} color={THEME.accent} />
                <Text style={styles.creditsSectionTitle}>
                  {language === "da"
                    ? "Tak til de hjælpende medvirkende"
                    : "Thanks to the helpful contributors"}
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
                      <Text style={styles.testerAvatarText}>
                        {tester.name.charAt(0).toUpperCase()}
                      </Text>
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
    fontSize: 16,
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
    fontSize: 28,
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
});
