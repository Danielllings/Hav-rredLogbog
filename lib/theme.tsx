// lib/theme.tsx
// Global theme color management

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Available theme colors
export type ThemeColorKey = "yellow" | "red" | "blue";

export type ThemeColor = {
  key: ThemeColorKey;
  label: string;
  primary: string;
  primarySoft: string;
};

export const THEME_COLORS: Record<ThemeColorKey, ThemeColor> = {
  yellow: {
    key: "yellow",
    label: "Gul",
    primary: "#F59E0B",
    primarySoft: "rgba(245, 158, 11, 0.15)",
  },
  red: {
    key: "red",
    label: "Rød",
    primary: "#EF4444",
    primarySoft: "rgba(239, 68, 68, 0.15)",
  },
  blue: {
    key: "blue",
    label: "Blå",
    primary: "#3B82F6",
    primarySoft: "rgba(59, 130, 246, 0.15)",
  },
};

// Base theme (non-color values)
export const BASE_THEME = {
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

// Full theme type
export type Theme = typeof BASE_THEME & {
  primary: string;
  accent: string;
  primarySoft: string;
};

// Storage key
const STORAGE_KEY = "theme_color";

// Context
type ThemeContextType = {
  themeColor: ThemeColor;
  theme: Theme;
  setThemeColor: (key: ThemeColorKey) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

// Provider
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorKey, setColorKey] = useState<ThemeColorKey>("yellow");

  // Load saved theme on mount
  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && THEME_COLORS[saved as ThemeColorKey]) {
        setColorKey(saved as ThemeColorKey);
      }
    } catch (error) {
      console.error("Error loading theme:", error);
    }
  };

  const setThemeColor = async (key: ThemeColorKey) => {
    setColorKey(key);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, key);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  };

  const themeColor = THEME_COLORS[colorKey];

  const theme: Theme = {
    ...BASE_THEME,
    primary: themeColor.primary,
    accent: themeColor.primary,
    primarySoft: themeColor.primarySoft,
  };

  return (
    <ThemeContext.Provider value={{ themeColor, theme, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    // Return default theme if not in provider (for backwards compatibility)
    const defaultColor = THEME_COLORS.yellow;
    return {
      themeColor: defaultColor,
      theme: {
        ...BASE_THEME,
        primary: defaultColor.primary,
        accent: defaultColor.primary,
        primarySoft: defaultColor.primarySoft,
      },
      setThemeColor: async () => {},
    };
  }
  return context;
}

// Helper to get static theme (for files that can't use hooks)
export function getStaticTheme(colorKey: ThemeColorKey = "yellow"): Theme {
  const color = THEME_COLORS[colorKey];
  return {
    ...BASE_THEME,
    primary: color.primary,
    accent: color.primary,
    primarySoft: color.primarySoft,
  };
}
