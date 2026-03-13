// components/Onboarding.tsx
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  StatusBar,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ONBOARDING_COMPLETE_KEY = "onboarding_complete_v1";

type Language = "da" | "en";

// Hardcoded translations for onboarding
const TEXT = {
  da: {
    // Privacy screen
    privacyTitle: "Privatlivspolitik",
    privacySubtitle: "Før du starter, skal du acceptere vores vilkår",
    privacyIntro:
      "Havørred Logbog indsamler og gemmer følgende data for at give dig den bedste oplevelse:",
    privacyPoints: [
      "Din position (GPS) under fiskture for at tracke dine ture",
      "Billeder du tager af dine fangster",
      "Fangstdata (art, vægt, længde, lokation)",
      "Vejrdata fra DMI knyttet til dine ture",
    ],
    privacyStorage:
      "Dine data gemmes sikkert i Firebase og synkroniseres på tværs af dine enheder. Vi deler ikke dine data med tredjepart.",
    privacyLink: "Læs den fulde privatlivspolitik",
    acceptTerms: "Jeg accepterer privatlivspolitikken",
    mustAccept: "Du skal acceptere for at fortsætte",
    continue: "Fortsæt",

    // Welcome slides
    slide1Title: "Velkommen til Havørred Logbog",
    slide1Text:
      "Din personlige fiskejournal til havørredfiskeri. Log dine ture, fangster og få indsigt i dine bedste forhold.",

    slide2Title: "Track dine ture",
    slide2Text:
      "Start GPS-tracking når du fisker. Se din rute, distance og få automatisk vejrdata fra DMI knyttet til turen.",

    slide3Title: "Log dine fangster",
    slide3Text:
      "Tag billeder, registrer vægt og længde. Kobl fangster til dine trackede ture for komplet statistik.",

    slide4Title: "Vejr og spots",
    slide4Text:
      "Se vejrudsigt, vandtemperatur og vindforhold. Gem dine yndlingsspots og få vejret for netop det sted.",

    getStarted: "Kom i gang",
    next: "Næste",
    skip: "Spring over",
  },
  en: {
    // Privacy screen
    privacyTitle: "Privacy Policy",
    privacySubtitle: "Before you start, please accept our terms",
    privacyIntro:
      "Havørred Logbog collects and stores the following data to provide you with the best experience:",
    privacyPoints: [
      "Your location (GPS) during fishing trips to track your routes",
      "Photos you take of your catches",
      "Catch data (species, weight, length, location)",
      "Weather data from DMI linked to your trips",
    ],
    privacyStorage:
      "Your data is securely stored in Firebase and synced across your devices. We do not share your data with third parties.",
    privacyLink: "Read the full privacy policy",
    acceptTerms: "I accept the privacy policy",
    mustAccept: "You must accept to continue",
    continue: "Continue",

    // Welcome slides
    slide1Title: "Welcome to Havørred Logbog",
    slide1Text:
      "Your personal fishing journal for sea trout fishing. Log your trips, catches and gain insight into your best conditions.",

    slide2Title: "Track your trips",
    slide2Text:
      "Start GPS tracking when fishing. View your route, distance and get automatic weather data from DMI linked to your trip.",

    slide3Title: "Log your catches",
    slide3Text:
      "Take photos, record weight and length. Link catches to your tracked trips for complete statistics.",

    slide4Title: "Weather and spots",
    slide4Text:
      "View weather forecast, water temperature and wind conditions. Save your favorite spots and get weather for that exact location.",

    getStarted: "Get Started",
    next: "Next",
    skip: "Skip",
  },
};

type Props = {
  onComplete: () => void;
};

function OnboardingContent({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<Language>("da");
  const [step, setStep] = useState<"privacy" | "slides">("privacy");
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const t = TEXT[lang];

  const handlePrivacyContinue = async () => {
    if (!accepted) {
      setShowError(true);
      return;
    }
    setStep("slides");
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      // Also save language preference
      await AsyncStorage.setItem("app_language", lang);
    } catch (e) {
      // Ignore
    }
    onComplete();
  };

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setCurrentSlide(index);
  };

  const slides = [
    {
      icon: "fish" as const,
      title: t.slide1Title,
      text: t.slide1Text,
      color: "#F59E0B",
    },
    {
      icon: "map-marker-path" as const,
      title: t.slide2Title,
      text: t.slide2Text,
      color: "#22C55E",
    },
    {
      icon: "camera" as const,
      title: t.slide3Title,
      text: t.slide3Text,
      color: "#3B82F6",
    },
    {
      icon: "weather-partly-cloudy" as const,
      title: t.slide4Title,
      text: t.slide4Text,
      color: "#8B5CF6",
    },
  ];

  // Privacy acceptance screen
  if (step === "privacy") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />

        {/* Language selector */}
        <View style={styles.langRow}>
          <Pressable
            style={[styles.langBtn, lang === "da" && styles.langBtnActive]}
            onPress={() => setLang("da")}
          >
            <Text
              style={[
                styles.langBtnText,
                lang === "da" && styles.langBtnTextActive,
              ]}
            >
              Dansk
            </Text>
          </Pressable>
          <Pressable
            style={[styles.langBtn, lang === "en" && styles.langBtnActive]}
            onPress={() => setLang("en")}
          >
            <Text
              style={[
                styles.langBtnText,
                lang === "en" && styles.langBtnTextActive,
              ]}
            >
              English
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.privacyScroll}
          contentContainerStyle={styles.privacyContent}
        >
          {/* Icon */}
          <View style={styles.privacyIconWrap}>
            <MaterialCommunityIcons
              name="shield-check"
              size={64}
              color="#F59E0B"
            />
          </View>

          <Text style={styles.privacyTitle}>{t.privacyTitle}</Text>
          <Text style={styles.privacySubtitle}>{t.privacySubtitle}</Text>

          <Text style={styles.privacyText}>{t.privacyIntro}</Text>

          <View style={styles.privacyList}>
            {t.privacyPoints.map((point, i) => (
              <View key={i} style={styles.privacyListItem}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color="#22C55E"
                />
                <Text style={styles.privacyListText}>{point}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.privacyText}>{t.privacyStorage}</Text>

          <Pressable
            style={styles.privacyLinkBtn}
            onPress={() =>
              Linking.openURL(
                "https://github.com/your-repo/sea-trout-log/blob/main/PRIVACY_POLICY.md"
              )
            }
          >
            <MaterialCommunityIcons
              name="open-in-new"
              size={16}
              color="#F59E0B"
            />
            <Text style={styles.privacyLinkText}>{t.privacyLink}</Text>
          </Pressable>

          {/* Acceptance checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => {
              setAccepted(!accepted);
              setShowError(false);
            }}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && (
                <MaterialCommunityIcons name="check" size={18} color="#000" />
              )}
            </View>
            <Text style={styles.checkboxLabel}>{t.acceptTerms}</Text>
          </Pressable>

          {showError && <Text style={styles.errorText}>{t.mustAccept}</Text>}
        </ScrollView>

        {/* Continue button */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[styles.continueBtn, !accepted && styles.continueBtnDisabled]}
            onPress={handlePrivacyContinue}
          >
            <Text style={styles.continueBtnText}>{t.continue}</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={20}
              color="#000"
            />
          </Pressable>
        </View>
      </View>
    );
  }

  // Welcome slides
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Skip button */}
      <Pressable style={[styles.skipBtn, { top: insets.top + 8 }]} onPress={handleComplete}>
        <Text style={styles.skipText}>{t.skip}</Text>
      </Pressable>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentSlide(index);
        }}
        scrollEventThrottle={16}
      >
        {slides.map((slide, index) => (
          <View key={index} style={styles.slide}>
            <View
              style={[styles.slideIconWrap, { backgroundColor: slide.color + "20" }]}
            >
              <MaterialCommunityIcons
                name={slide.icon}
                size={80}
                color={slide.color}
              />
            </View>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideText}>{slide.text}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentSlide === index && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Bottom button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {currentSlide === slides.length - 1 ? (
          <Pressable style={styles.continueBtn} onPress={handleComplete}>
            <Text style={styles.continueBtnText}>{t.getStarted}</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={20}
              color="#000"
            />
          </Pressable>
        ) : (
          <Pressable
            style={styles.continueBtn}
            onPress={() => goToSlide(currentSlide + 1)}
          >
            <Text style={styles.continueBtnText}>{t.next}</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={20}
              color="#000"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Wrapper with SafeAreaProvider
export default function Onboarding({ onComplete }: Props) {
  return (
    <SafeAreaProvider>
      <OnboardingContent onComplete={onComplete} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },

  // Language selector
  langRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  langBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#2C2C2E",
  },
  langBtnActive: {
    backgroundColor: "#F59E0B",
  },
  langBtnText: {
    color: "#A1A1AA",
    fontSize: 14,
    fontWeight: "600",
  },
  langBtnTextActive: {
    color: "#000",
  },

  // Privacy screen
  privacyScroll: {
    flex: 1,
  },
  privacyContent: {
    padding: 24,
    paddingBottom: 40,
  },
  privacyIconWrap: {
    alignItems: "center",
    marginBottom: 24,
  },
  privacyTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  privacySubtitle: {
    fontSize: 15,
    color: "#A1A1AA",
    textAlign: "center",
    marginBottom: 24,
  },
  privacyText: {
    fontSize: 15,
    color: "#D1D1D6",
    lineHeight: 22,
    marginBottom: 16,
  },
  privacyList: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  privacyListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  privacyListText: {
    flex: 1,
    fontSize: 14,
    color: "#D1D1D6",
    lineHeight: 20,
  },
  privacyLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 24,
  },
  privacyLinkText: {
    fontSize: 14,
    color: "#F59E0B",
    fontWeight: "500",
  },

  // Checkbox
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1C1C1E",
    padding: 16,
    borderRadius: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#F59E0B",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  errorText: {
    color: "#FF453A",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
  },

  // Skip button
  skipBtn: {
    position: "absolute",
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 15,
    color: "#A1A1AA",
  },

  // Slides
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  slideIconWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  slideText: {
    fontSize: 16,
    color: "#A1A1AA",
    textAlign: "center",
    lineHeight: 24,
  },

  // Dots
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3C3C3E",
  },
  dotActive: {
    backgroundColor: "#F59E0B",
    width: 24,
  },
});
