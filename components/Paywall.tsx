/**
 * Paywall Component - RevenueCat Paywall for Havørred Logbog Pro
 * Premium NERO-themed design with fishing aesthetics
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { PurchasesPackage } from "react-native-purchases";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInUp,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "../lib/i18n";
import { usePurchases } from "../hooks/usePurchases";
import {
  formatPackagePrice,
  getPackageDurationLabel,
  calculateYearlySavings,
  getManagementURL,
  getPurchaseErrorMessage,
} from "../lib/purchases";

const { width } = Dimensions.get("window");

// NERO Theme
const NERO = {
  bg: "#0D0D0F",
  card: "#161618",
  elevated: "#1E1E21",
  cardBorder: "#2A2A2E",
  text: "#FFFFFF",
  textSec: "#A0A0A8",
  textTertiary: "#606068",
  accent: "#F59E0B",
  accentMuted: "rgba(245, 158, 11, 0.15)",
  accentBorder: "rgba(245, 158, 11, 0.4)",
  success: "#22C55E",
  danger: "#FF3B30",
};

interface PaywallProps {
  onClose: () => void;
  onPurchaseComplete?: () => void;
}

/**
 * Present RevenueCat's native paywall
 */
export async function presentPaywall(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywall();
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return true;
      default:
        return false;
    }
  } catch (error) {
    console.error("[Paywall] Failed to present native paywall:", error);
    return false;
  }
}

/**
 * Present RevenueCat's native paywall if needed
 */
export async function presentPaywallIfNeeded(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: "HavørredLogbog Pro",
    });
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (error) {
    console.error("[Paywall] Failed to present paywall:", error);
    return false;
  }
}

/**
 * Custom Paywall Component - NERO Theme
 */
export function Paywall({ onClose, onPurchaseComplete }: PaywallProps) {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { offerings, isLoading, purchase, restore } = usePurchases();
  const [purchasing, setPurchasing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);

  const packages = offerings?.availablePackages || [];
  const monthlyPkg = packages.find((p) => p.packageType === "$rc_monthly");
  const yearlyPkg = packages.find((p) => p.packageType === "$rc_annual");
  const lifetimePkg = packages.find((p) => p.packageType === "$rc_lifetime");

  const yearlySavings = monthlyPkg && yearlyPkg
    ? calculateYearlySavings(monthlyPkg, yearlyPkg)
    : 0;

  // Auto-select yearly as default
  React.useEffect(() => {
    if (yearlyPkg && !selectedPackage) {
      setSelectedPackage(yearlyPkg);
    }
  }, [yearlyPkg]);

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    setPurchasing(true);
    try {
      const success = await purchase(selectedPackage);
      if (success) {
        onPurchaseComplete?.();
        onClose();
      }
    } catch (err: any) {
      Alert.alert(
        language === "da" ? "Fejl" : "Error",
        getPurchaseErrorMessage(err, language)
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const success = await restore();
      if (success) {
        Alert.alert(
          language === "da" ? "Genoprettet" : "Restored",
          language === "da"
            ? "Dit abonnement er genoprettet!"
            : "Your subscription has been restored!"
        );
        onPurchaseComplete?.();
        onClose();
      } else {
        Alert.alert(
          language === "da" ? "Ingen køb fundet" : "No purchases found",
          language === "da"
            ? "Vi kunne ikke finde tidligere køb på denne konto."
            : "We couldn't find any previous purchases on this account."
        );
      }
    } catch (err: any) {
      Alert.alert(
        language === "da" ? "Fejl" : "Error",
        getPurchaseErrorMessage(err, language)
      );
    } finally {
      setPurchasing(false);
    }
  };

  const features = [
    {
      icon: "analytics",
      title: language === "da" ? "Avanceret statistik" : "Advanced Statistics",
      desc: language === "da" ? "Spot-analyse, fiskemønstre & grafer" : "Spot analysis, patterns & charts",
    },
    {
      icon: "notifications",
      title: language === "da" ? "Smart vejr-alerts" : "Smart Weather Alerts",
      desc: language === "da" ? "Push-besked ved optimale forhold" : "Push notifications for optimal conditions",
    },
    {
      icon: "layers",
      title: language === "da" ? "Vejrkort & overlay" : "Weather Maps & Overlays",
      desc: language === "da" ? "Strøm, bølger, salinitet, vind" : "Current, waves, salinity, wind",
    },
    {
      icon: "document-text",
      title: language === "da" ? "PDF-eksport" : "PDF Export",
      desc: language === "da" ? "Del din statistik som rapport" : "Share your stats as a report",
    },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={NERO.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header gradient */}
      <LinearGradient
        colors={["rgba(245, 158, 11, 0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      {/* Close button */}
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 16 }]}
        onPress={onClose}
      >
        <Ionicons name="close" size={22} color={NERO.textSec} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
          <View style={styles.iconContainer}>
            <View style={styles.iconGlow} />
            <View style={styles.proIcon}>
              <Ionicons name="fish" size={36} color="#000" />
            </View>
          </View>

          <Text style={styles.title}>
            {language === "da" ? "Bliv Pro-fisker" : "Become a Pro Angler"}
          </Text>
          <Text style={styles.subtitle}>
            {language === "da"
              ? "Få adgang til alle funktioner og optimér dit fiskeri"
              : "Unlock all features and optimize your fishing"}
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.features}>
          {features.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon as any} size={20} color={NERO.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={NERO.success} />
            </View>
          ))}
        </Animated.View>

        {/* Packages */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.packages}>
          {/* Yearly - Recommended */}
          {yearlyPkg && (
            <Pressable
              style={[
                styles.packageCard,
                styles.packageRecommended,
                selectedPackage?.identifier === yearlyPkg.identifier && styles.packageSelected,
              ]}
              onPress={() => setSelectedPackage(yearlyPkg)}
            >
              <View style={styles.recommendedBadge}>
                <Ionicons name="star" size={10} color="#000" />
                <Text style={styles.recommendedText}>
                  {language === "da" ? "ANBEFALET" : "RECOMMENDED"}
                </Text>
              </View>

              <View style={styles.packageHeader}>
                <Text style={styles.packageName}>
                  {language === "da" ? "Årligt" : "Yearly"}
                </Text>
                {yearlySavings > 0 && (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>
                      -{yearlySavings}%
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.packagePricing}>
                <Text style={styles.packagePrice}>{formatPackagePrice(yearlyPkg)}</Text>
                <Text style={styles.packagePer}>/{language === "da" ? "år" : "year"}</Text>
              </View>

              <Text style={styles.packageMonthly}>
                {language === "da" ? "≈ " : "≈ "}
                {(yearlyPkg.product.price / 12).toFixed(0)} kr/{language === "da" ? "md" : "mo"}
              </Text>

              <View style={styles.radioOuter}>
                {selectedPackage?.identifier === yearlyPkg.identifier && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </Pressable>
          )}

          {/* Monthly & Lifetime row */}
          <View style={styles.packageRow}>
            {monthlyPkg && (
              <Pressable
                style={[
                  styles.packageCardSmall,
                  selectedPackage?.identifier === monthlyPkg.identifier && styles.packageSelected,
                ]}
                onPress={() => setSelectedPackage(monthlyPkg)}
              >
                <Text style={styles.packageNameSmall}>
                  {language === "da" ? "Månedlig" : "Monthly"}
                </Text>
                <Text style={styles.packagePriceSmall}>{formatPackagePrice(monthlyPkg)}</Text>
                <Text style={styles.packagePerSmall}>/{language === "da" ? "md" : "mo"}</Text>

                <View style={styles.radioOuterSmall}>
                  {selectedPackage?.identifier === monthlyPkg.identifier && (
                    <View style={styles.radioInnerSmall} />
                  )}
                </View>
              </Pressable>
            )}

            {lifetimePkg && (
              <Pressable
                style={[
                  styles.packageCardSmall,
                  selectedPackage?.identifier === lifetimePkg.identifier && styles.packageSelected,
                ]}
                onPress={() => setSelectedPackage(lifetimePkg)}
              >
                <View style={styles.lifetimeBadge}>
                  <Ionicons name="infinite" size={10} color={NERO.accent} />
                </View>
                <Text style={styles.packageNameSmall}>
                  {language === "da" ? "Livstid" : "Lifetime"}
                </Text>
                <Text style={styles.packagePriceSmall}>{formatPackagePrice(lifetimePkg)}</Text>
                <Text style={styles.packagePerSmall}>
                  {language === "da" ? "engangskøb" : "one-time"}
                </Text>

                <View style={styles.radioOuterSmall}>
                  {selectedPackage?.identifier === lifetimePkg.identifier && (
                    <View style={styles.radioInnerSmall} />
                  )}
                </View>
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Social proof */}
        <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.socialProof}>
          <Ionicons name="people" size={16} color={NERO.textTertiary} />
          <Text style={styles.socialProofText}>
            {language === "da"
              ? "Brugt af havørredfiskere i hele Danmark"
              : "Used by sea trout anglers across Denmark"}
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Bottom CTA */}
      <Animated.View
        entering={SlideInUp.delay(600).duration(400)}
        style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}
      >
        <Pressable
          style={[styles.purchaseBtn, !selectedPackage && styles.purchaseBtnDisabled]}
          onPress={handlePurchase}
          disabled={!selectedPackage || purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.purchaseBtnText}>
                {language === "da" ? "Start Pro nu" : "Start Pro Now"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </>
          )}
        </Pressable>

        <View style={styles.bottomLinks}>
          <Pressable onPress={handleRestore} disabled={purchasing}>
            <Text style={styles.restoreText}>
              {language === "da" ? "Genopret køb" : "Restore"}
            </Text>
          </Pressable>

          <Text style={styles.linkSeparator}>·</Text>

          <Pressable onPress={() => Linking.openURL("https://havorredlogbog.dk/terms")}>
            <Text style={styles.legalLink}>{language === "da" ? "Vilkår" : "Terms"}</Text>
          </Pressable>

          <Text style={styles.linkSeparator}>·</Text>

          <Pressable onPress={() => Linking.openURL("https://havorredlogbog.dk/privacy")}>
            <Text style={styles.legalLink}>{language === "da" ? "Privatliv" : "Privacy"}</Text>
          </Pressable>
        </View>

        <Text style={styles.disclaimer}>
          {language === "da"
            ? "Abonnement fornyes automatisk. Opsig når som helst i App Store."
            : "Subscription auto-renews. Cancel anytime in App Store."}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * Customer Center - Manage subscription
 */
export async function openCustomerCenter(): Promise<void> {
  try {
    const managementURL = await getManagementURL();
    if (managementURL) {
      await Linking.openURL(managementURL);
    }
  } catch (error) {
    console.error("[CustomerCenter] Failed to open:", error);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NERO.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NERO.elevated,
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginBottom: 32,
    marginTop: 24,
  },
  iconContainer: {
    position: "relative",
    marginBottom: 20,
  },
  iconGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: NERO.accent,
    opacity: 0.2,
    top: -14,
    left: -14,
  },
  proIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: NERO.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: NERO.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: NERO.textSec,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  // Features
  features: {
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NERO.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: NERO.cardBorder,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NERO.accentMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: NERO.text,
  },
  featureDesc: {
    fontSize: 12,
    color: NERO.textSec,
    marginTop: 2,
  },

  // Packages
  packages: {
    marginBottom: 20,
  },
  packageCard: {
    backgroundColor: NERO.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: NERO.cardBorder,
    marginBottom: 12,
    position: "relative",
  },
  packageRecommended: {
    borderColor: NERO.accentBorder,
  },
  packageSelected: {
    borderColor: NERO.accent,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
  },
  recommendedBadge: {
    position: "absolute",
    top: -10,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: NERO.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 0.5,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  packageName: {
    fontSize: 18,
    fontWeight: "700",
    color: NERO.text,
  },
  savingsBadge: {
    backgroundColor: NERO.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  savingsText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#000",
  },
  packagePricing: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  packagePrice: {
    fontSize: 32,
    fontWeight: "800",
    color: NERO.text,
  },
  packagePer: {
    fontSize: 16,
    color: NERO.textSec,
    marginLeft: 4,
  },
  packageMonthly: {
    fontSize: 13,
    color: NERO.textTertiary,
    marginTop: 4,
  },
  radioOuter: {
    position: "absolute",
    right: 20,
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: NERO.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: NERO.accent,
  },

  // Small package cards
  packageRow: {
    flexDirection: "row",
    gap: 12,
  },
  packageCardSmall: {
    flex: 1,
    backgroundColor: NERO.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: NERO.cardBorder,
    alignItems: "center",
    position: "relative",
  },
  packageNameSmall: {
    fontSize: 14,
    fontWeight: "600",
    color: NERO.textSec,
    marginBottom: 6,
  },
  packagePriceSmall: {
    fontSize: 22,
    fontWeight: "800",
    color: NERO.text,
  },
  packagePerSmall: {
    fontSize: 12,
    color: NERO.textTertiary,
    marginTop: 2,
  },
  lifetimeBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: NERO.accentMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: NERO.bg,
  },
  radioOuterSmall: {
    marginTop: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: NERO.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInnerSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NERO.accent,
  },

  // Social proof
  socialProof: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  socialProofText: {
    fontSize: 13,
    color: NERO.textTertiary,
  },

  // Bottom
  bottomSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: NERO.bg,
    borderTopWidth: 1,
    borderTopColor: NERO.cardBorder,
  },
  purchaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: NERO.accent,
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  purchaseBtnDisabled: {
    opacity: 0.5,
  },
  purchaseBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  bottomLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  restoreText: {
    fontSize: 14,
    color: NERO.textSec,
    fontWeight: "500",
  },
  linkSeparator: {
    color: NERO.textTertiary,
  },
  legalLink: {
    fontSize: 14,
    color: NERO.textTertiary,
  },
  disclaimer: {
    fontSize: 11,
    color: NERO.textTertiary,
    textAlign: "center",
    lineHeight: 16,
  },
});
