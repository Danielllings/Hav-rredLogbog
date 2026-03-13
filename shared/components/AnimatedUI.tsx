// shared/components/AnimatedUI.tsx
// Fælles animerede UI-komponenter med gold/gul futuristisk stil

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";

// Gold theme farver
export const GOLD_THEME = {
  gold: "#F59E0B",
  goldLight: "rgba(245, 158, 11, 0.15)",
  goldBorder: "rgba(245, 158, 11, 0.2)",
  goldGlow: "rgba(245, 158, 11, 0.08)",
};

// Animeret kort-wrapper med fade-in og scale animation
export function AnimatedCard({
  children,
  index = 0,
  style,
  delay = 50,
}: {
  children: React.ReactNode;
  index?: number;
  style?: ViewStyle;
  delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * delay),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Animeret liste-element wrapper
export function AnimatedListItem({
  children,
  index = 0,
}: {
  children: React.ReactNode;
  index?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 40),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Animeret sektion med fade-in
export function AnimatedSection({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity: fadeAnim }, style]}>
      {children}
    </Animated.View>
  );
}

// Gold-accented card stil
export const goldCardStyle: ViewStyle = {
  backgroundColor: "#1C1C1E",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: GOLD_THEME.goldBorder,
  shadowColor: GOLD_THEME.gold,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

// Gold title text stil
export const goldTitleStyle: TextStyle = {
  textShadowColor: "rgba(245, 158, 11, 0.12)",
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 6,
};

// Gold filter chip styles
export const goldChipStyles = {
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "transparent",
  } as ViewStyle,
  chipActive: {
    backgroundColor: GOLD_THEME.goldLight,
    borderColor: "rgba(245, 158, 11, 0.4)",
  } as ViewStyle,
  chipText: {
    color: "#A1A1AA",
    fontSize: 12,
  } as TextStyle,
  chipTextActive: {
    color: GOLD_THEME.gold,
    fontSize: 12,
    fontWeight: "700" as const,
  } as TextStyle,
};

// Styles for genbrugelige komponenter
export const animatedStyles = StyleSheet.create({
  goldCard: {
    ...goldCardStyle,
  },
  goldTitle: {
    ...goldTitleStyle,
  },
});
