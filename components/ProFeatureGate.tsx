/**
 * ProFeatureGate - Wrapper component for Pro-only features
 * Shows blurred overlay with lock icon for non-Pro users
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useIsPro } from "../hooks/usePurchases";
import { Paywall } from "./Paywall";
import { useLanguage } from "../lib/i18n";

interface ProFeatureGateProps {
  children: React.ReactNode;
  /** Feature name shown in the lock overlay */
  featureName?: string;
  /** Style for the container */
  style?: any;
  /** If true, completely hides content instead of blurring */
  hideContent?: boolean;
}

export function ProFeatureGate({
  children,
  featureName,
  style,
  hideContent = false,
}: ProFeatureGateProps) {
  const { isPro, isLoading } = useIsPro();
  const { language } = useLanguage();
  const [paywallVisible, setPaywallVisible] = useState(false);

  // If Pro or still loading, show content normally
  if (isPro || isLoading) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Content (blurred or hidden) */}
      <View style={styles.contentWrapper} pointerEvents="none">
        {!hideContent && children}
      </View>

      {/* Blur overlay */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setPaywallVisible(true)}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={25} tint="dark" style={styles.blurOverlay}>
            <View style={styles.lockContent}>
              <View style={styles.lockIconCircle}>
                <Ionicons name="lock-closed" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.lockTitle}>
                {language === "da" ? "Pro-funktion" : "Pro Feature"}
              </Text>
              {featureName && (
                <Text style={styles.lockFeatureName}>{featureName}</Text>
              )}
              <View style={styles.unlockButton}>
                <Ionicons name="star" size={14} color="#000" />
                <Text style={styles.unlockButtonText}>
                  {language === "da" ? "Abonner" : "Subscribe"}
                </Text>
              </View>
            </View>
          </BlurView>
        ) : (
          <View style={styles.androidOverlay}>
            <View style={styles.lockContent}>
              <View style={styles.lockIconCircle}>
                <Ionicons name="lock-closed" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.lockTitle}>
                {language === "da" ? "Pro-funktion" : "Pro Feature"}
              </Text>
              {featureName && (
                <Text style={styles.lockFeatureName}>{featureName}</Text>
              )}
              <View style={styles.unlockButton}>
                <Ionicons name="star" size={14} color="#000" />
                <Text style={styles.unlockButtonText}>
                  {language === "da" ? "Abonner" : "Subscribe"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>

      {/* Paywall Modal */}
      <Modal
        visible={paywallVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPaywallVisible(false)}
      >
        <Paywall
          onClose={() => setPaywallVisible(false)}
          onPurchaseComplete={() => setPaywallVisible(false)}
        />
      </Modal>
    </View>
  );
}

/**
 * Hook version - returns whether feature is locked and a function to show paywall
 */
export function useProFeature(): {
  isPro: boolean;
  isLoading: boolean;
  showPaywall: () => void;
  PaywallModal: React.FC;
} {
  const { isPro, isLoading } = useIsPro();
  const [paywallVisible, setPaywallVisible] = useState(false);

  const PaywallModal = () => (
    <Modal
      visible={paywallVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setPaywallVisible(false)}
    >
      <Paywall
        onClose={() => setPaywallVisible(false)}
        onPurchaseComplete={() => setPaywallVisible(false)}
      />
    </Modal>
  );

  return {
    isPro,
    isLoading,
    showPaywall: () => setPaywallVisible(true),
    PaywallModal,
  };
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    minHeight: 220,
  },
  contentWrapper: {
    opacity: 0.3,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13, 13, 15, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  lockContent: {
    alignItems: "center",
    padding: 24,
  },
  lockIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  lockFeatureName: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 16,
    textAlign: "center",
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  unlockButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
});
