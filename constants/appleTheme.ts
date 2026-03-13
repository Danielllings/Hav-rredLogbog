/**
 * Statistik tema - Minimalistisk dark mode
 * Matcher appens NERO tema med gul accent
 */

export const APPLE = {
  // Baggrunde
  bg: "#121212",
  card: "rgba(28, 28, 30, 0.8)",
  cardSolid: "#1C1C1E",
  cardElevated: "rgba(44, 44, 46, 0.8)",

  // Tekst
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.6)",
  textTertiary: "rgba(255, 255, 255, 0.3)",

  // Activity Ring farver (alle gul-toner)
  ringRed: "#F59E0B",
  ringGreen: "#D97706",
  ringCyan: "#FBBF24",

  // Primær accent (app's yellow)
  accent: "#F59E0B",
  accentMuted: "rgba(245, 158, 11, 0.15)",
  accentBorder: "rgba(245, 158, 11, 0.3)",

  // Grå-skala
  gray1: "rgba(255, 255, 255, 0.08)",
  gray2: "rgba(255, 255, 255, 0.12)",
  gray3: "rgba(255, 255, 255, 0.18)",
  gray4: "rgba(255, 255, 255, 0.24)",

  // Glassmorphism
  glass: "rgba(255, 255, 255, 0.05)",
  glassBorder: "rgba(255, 255, 255, 0.1)",
  glassHighlight: "rgba(255, 255, 255, 0.15)",

  // Gradients (gul-toner)
  gradientRed: ["#F59E0B", "#FBBF24"],
  gradientGreen: ["#D97706", "#F59E0B"],
  gradientCyan: ["#FBBF24", "#FCD34D"],

  // Shadows
  shadowColor: "#000000",
  shadowOpacity: 0.4,

  // Success/Error (subtile grå-toner)
  success: "#A1A1AA",
  error: "#71717A",
  warning: "#F59E0B",

  // Chart farver
  chartLine: "#F59E0B",
  chartFill: "rgba(245, 158, 11, 0.2)",
  chartGrid: "rgba(255, 255, 255, 0.06)",
};

// Animation timing presets
export const APPLE_TIMING = {
  fast: 200,
  normal: 300,
  slow: 500,
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
  springBouncy: {
    damping: 10,
    stiffness: 200,
    mass: 0.8,
  },
};

// Blur intensiteter
export const BLUR_INTENSITY = {
  light: 20,
  medium: 40,
  heavy: 60,
  ultraHeavy: 80,
};
