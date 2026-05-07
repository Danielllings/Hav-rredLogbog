// app/(tabs)/_layout.tsx
// BEMÆRK: Denne fil ligger inde i (tabs)-mappen!

import { Tabs, useRouter } from "expo-router";
import React from "react";
import {
  View,
  Pressable,
  Text,
  Platform,
  StatusBar,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

// --- BASE TEMA (statiske farver) ---
const BASE = {
  bg: "#121212",
  barBg: "#1E1E1E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  border: "#333333",
  midBtnIcon: "#000000",
  danger: "#FF453A",
  ghost: "#333333",
  sun: "#FACC15",
};

export default function TabsLayout() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <>
      {/* STATUSBAR – lys tekst til mørk baggrund */}
      <StatusBar barStyle="light-content" backgroundColor={BASE.bg} />

      <Tabs
        sceneContainerStyle={{ backgroundColor: BASE.bg }}
        screenOptions={({ route }) => {
          const isSpotWeather = route.name === "spot-weather";

          return {
            headerShown: true,
            headerTitle: "",
            headerTransparent: isSpotWeather,
            headerStyle: {
              backgroundColor: isSpotWeather ? "transparent" : BASE.barBg,
              height:
                Platform.OS === "ios"
                  ? 84
                  : 44 + (StatusBar.currentHeight || 16),
            },
            headerShadowVisible: false,
            headerTintColor: BASE.text,

            // VENSTRE: SETTINGS
            headerLeft: () => (
                  <Pressable
                    onPress={() => router.push("/settings")}
                    style={{
                      marginLeft: 16,
                      marginTop: isSpotWeather ? 8 : -24,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "rgba(0,0,0,0.5)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="cog-outline"
                      size={22}
                      color={BASE.text}
                    />
                  </Pressable>
                ),

            // HØJRE: Tom (vejr-ikon fjernet - spot-weather er nu en tab)
            headerRight: undefined,

            tabBarShowLabel: false,
            tabBarStyle: {
              backgroundColor: BASE.barBg,
              borderTopColor: BASE.border,
            },
          };
        }}
        tabBar={(props) => <CustomBar {...props} />}
      >
        {/* Tab 1: Galleri (fangster) */}
        <Tabs.Screen name="catches" options={{ title: "Galleri" }} />
        {/* Tab 2: Ny fangst */}
        <Tabs.Screen name="new-catch" options={{ title: "Ny fangst" }} />
        {/* Tab 3: Ture & Tracking (centrum) */}
        <Tabs.Screen name="index" options={{ title: "Ture" }} />
        {/* Tab 4: Vejrkort */}
        <Tabs.Screen name="spot-weather" options={{ title: "Vejrkort" }} />
        {/* Tab 5: Statistik */}
        <Tabs.Screen name="statistics" options={{ title: "Statistik" }} />
        {/* Skjulte skærme */}
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="manual-import" options={{ href: null }} />
        <Tabs.Screen name="weather-alerts" options={{ href: null }} />
        <Tabs.Screen name="catch/[id]" options={{ href: null }} />
        <Tabs.Screen name="trips/[id]" options={{ href: null }} />
        <Tabs.Screen name="trip-replay/[id]" options={{ href: null }} />
      </Tabs>
    </>
  );
}

// --- Custom tab-bar (5 tabs) ---

function CustomBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isFocused = (name: string) =>
    state.routes[state.index]?.name === name;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        backgroundColor: BASE.barBg,
        borderTopColor: BASE.border,
        borderTopWidth: 1,
        height: 72 + insets.bottom,
        paddingHorizontal: 8,
        paddingBottom: insets.bottom,
      }}
    >
      {/* Tab 1: Galleri (fangster) */}
      <Pressable
        onPress={() => navigation.navigate("catches")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("catches") ? "trophy" : "trophy-outline"}
          size={22}
          color={isFocused("catches") ? theme.primary : BASE.textSec}
        />
        <Text
          style={{
            fontSize: 9,
            fontWeight: isFocused("catches") ? "600" : "500",
            color: isFocused("catches") ? BASE.text : BASE.textSec,
            marginTop: 3,
            letterSpacing: 0.1,
          }}
        >
          {t("tabGallery")}
        </Text>
      </Pressable>

      {/* Tab 2: Ny fangst */}
      <Pressable
        onPress={() => navigation.navigate("new-catch")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("new-catch") ? "clipboard-plus" : "clipboard-plus-outline"}
          size={22}
          color={isFocused("new-catch") ? theme.primary : BASE.textSec}
        />
        <Text
          style={{
            fontSize: 9,
            fontWeight: isFocused("new-catch") ? "600" : "500",
            color: isFocused("new-catch") ? BASE.text : BASE.textSec,
            marginTop: 3,
            letterSpacing: 0.1,
          }}
        >
          {t("tabCatch")}
        </Text>
      </Pressable>

      {/* Tab 3: Ture & Tracking (midterknap) */}
      <Pressable
        onPress={() => navigation.navigate("index")}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.primary,
          alignItems: "center",
          justifyContent: "center",
          marginTop: -18,
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
          borderWidth: 3,
          borderColor: BASE.barBg,
        }}
      >
        <MaterialCommunityIcons
          name="crosshairs-gps"
          size={26}
          color={BASE.midBtnIcon}
        />
      </Pressable>

      {/* Tab 4: Vejrkort */}
      <Pressable
        onPress={() => navigation.navigate("spot-weather")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("spot-weather") ? "map-marker-radius" : "map-marker-radius-outline"}
          size={22}
          color={isFocused("spot-weather") ? theme.primary : BASE.textSec}
        />
        <Text
          style={{
            fontSize: 9,
            fontWeight: isFocused("spot-weather") ? "600" : "500",
            color: isFocused("spot-weather") ? BASE.text : BASE.textSec,
            marginTop: 3,
            letterSpacing: 0.1,
          }}
        >
          {t("tabWeather")}
        </Text>
      </Pressable>

      {/* Tab 5: Statistik */}
      <Pressable
        onPress={() => navigation.navigate("statistics")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("statistics") ? "chart-box" : "chart-box-outline"}
          size={22}
          color={isFocused("statistics") ? theme.primary : BASE.textSec}
        />
        <Text
          style={{
            fontSize: 9,
            fontWeight: isFocused("statistics") ? "600" : "500",
            color: isFocused("statistics") ? BASE.text : BASE.textSec,
            marginTop: 3,
            letterSpacing: 0.1,
          }}
        >
          {t("tabStats")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ingen ekstra styles pt.
});
