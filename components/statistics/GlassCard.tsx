/**
 * GlassCard - Reusable glassmorphism card component
 * Apple Health/Fitness inspireret design med blur og gradient borders
 */

import React from "react";
import {
  View,
  StyleSheet,
  ViewStyle,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { APPLE } from "../../constants/appleTheme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: "light" | "medium" | "heavy";
  noPadding?: boolean;
  highlighted?: boolean;
}

export function GlassCard({
  children,
  style,
  intensity = "medium",
  noPadding = false,
  highlighted = false,
}: GlassCardProps) {
  const blurIntensity = intensity === "light" ? 20 : intensity === "heavy" ? 60 : 40;

  // BlurView virker bedst på iOS - fallback til solid farve på Android
  const isIOS = Platform.OS === "ios";

  if (isIOS) {
    return (
      <View style={[styles.containerIOS, highlighted && styles.highlighted, style]}>
        <BlurView
          intensity={blurIntensity}
          tint="dark"
          style={[styles.blur, !noPadding && styles.padding]}
        >
          {children}
        </BlurView>
      </View>
    );
  }

  // Android fallback - semi-transparent solid card
  return (
    <View
      style={[
        styles.container,
        styles.androidFallback,
        highlighted && styles.highlighted,
        !noPadding && styles.padding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Simpel variant uden blur - hurtigere performance
export function SolidCard({
  children,
  style,
  noPadding = false,
}: Omit<GlassCardProps, "intensity" | "highlighted">) {
  return (
    <View style={[styles.solidContainer, !noPadding && styles.padding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
  containerIOS: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: APPLE.card,
  },
  blur: {
    flex: 1,
  },
  padding: {
    padding: 20,
  },
  highlighted: {
    // Subtil highlight uden farvet border
  },
  androidFallback: {
    backgroundColor: APPLE.cardSolid,
  },
  solidContainer: {
    borderRadius: 20,
    backgroundColor: APPLE.cardSolid,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
  },
});
