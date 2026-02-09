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

// --- TEMA (Dark Mode + Gul Midterknap) ---
const THEME = {
  bg: "#121212",        // Helt mørk baggrund
  barBg: "#1E1E1E",     // Tab bar og header baggrund
  text: "#FFFFFF",      // Hvid tekst
  textSec: "#A1A1AA",   // Grå inaktiv tekst
  border: "#333333",    // Mørk kant
  
  midBtn: "#F59E0B",    // GUL til midterknappen
  midBtnIcon: "#000000",// Sort ikon på gul knap
  
  danger: "#FF453A",    // Rød til log ud
  ghost: "#333333",     // Grå til annuller
  sun: "#FACC15",
};

export default function TabsLayout() {
  const router = useRouter();

  return (
    <>
      {/* STATUSBAR – lys tekst til mørk baggrund */}
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />

      <Tabs
        screenOptions={({ route }) => {
          const isSpotWeather = route.name === "spot-weather";
          
          return {
            // TOPBAR SKJULT KUN PÅ SPOT-WEATHER
            headerShown: !isSpotWeather,
            headerTitle: "", // Ingen titel, men vi beholder headeren for knapperne
            headerStyle: {
              backgroundColor: THEME.barBg, // Mørk header
              height:
                Platform.OS === "ios"
                  ? 84
                  : 44 + (StatusBar.currentHeight || 16),
            },
            headerShadowVisible: false,
            headerTintColor: THEME.text, // Hvid tekst/ikoner

            // VENSTRE: SETTINGS
            headerLeft: isSpotWeather
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => router.push("/settings")}
                    style={{
                      marginLeft: 16,
                      marginTop: -12,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="cog-outline"
                      size={22}
                      color={THEME.text}
                    />
                  </Pressable>
                ),

            // HØJRE: VEJR-IKON
            headerRight: isSpotWeather
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => router.push("/spot-weather")}
                    style={{
                      marginRight: 16,
                      marginTop: -12,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="weather-partly-cloudy"
                      size={22}
                      color={THEME.midBtn}
                    />
                  </Pressable>
                ),

            tabBarShowLabel: false,
            tabBarStyle: {
              backgroundColor: THEME.barBg,
              borderTopColor: THEME.border,
            },
          };
        }}
        tabBar={(props) => <CustomBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: "Track/Statistik" }} />
        <Tabs.Screen name="new-catch" options={{ title: "Ny fangst" }} />
        <Tabs.Screen name="catches" options={{ title: "Galleri" }} />

        {/* Skjulte ruter */}
        <Tabs.Screen name="catch/[id]" options={{ href: null }} />
        <Tabs.Screen name="trips/[id]" options={{ href: null }} />
        
        {/* Settings som skjult route */}
        <Tabs.Screen
          name="settings"
          options={{ href: null, headerShown: false }}
        />

        {/* Manuel import som skjult route */}
        <Tabs.Screen
          name="manual-import"
          options={{ href: null, headerShown: false }}
        />
      </Tabs>
    </>
  );
}

// --- Custom tab-bar ---

function CustomBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const isFocused = (name: string) =>
    state.routes[state.index]?.name === name;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        backgroundColor: THEME.barBg,
        borderTopColor: THEME.border,
        borderTopWidth: 1,
        height: 72 + insets.bottom,
        paddingHorizontal: 14,
        paddingBottom: insets.bottom,
      }}
    >
      {/* Fisketur */}
      <Pressable
        onPress={() => navigation.navigate("index")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("index") ? "compass" : "compass-outline"}
          size={26}
          color={isFocused("index") ? THEME.midBtn : THEME.textSec}
        />
        <Text
          style={{
            fontSize: 10,
            fontWeight: isFocused("index") ? "600" : "500",
            color: isFocused("index") ? THEME.text : THEME.textSec,
            marginTop: 4,
            letterSpacing: 0.2,
          }}
        >
          {t("tabTrip")}
        </Text>
      </Pressable>

      {/* Ny fangst (midtknap) */}
      <Pressable
        onPress={() => navigation.navigate("new-catch")}
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: THEME.midBtn,
          alignItems: "center",
          justifyContent: "center",
          marginTop: -20,
          shadowColor: THEME.midBtn,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
          borderWidth: 3,
          borderColor: THEME.barBg,
        }}
      >
        <MaterialCommunityIcons
          name="fish"
          size={28}
          color={THEME.midBtnIcon}
        />
      </Pressable>

      {/* Galleri */}
      <Pressable
        onPress={() => navigation.navigate("catches")}
        style={{ flex: 1, alignItems: "center" }}
      >
        <MaterialCommunityIcons
          name={isFocused("catches") ? "image-multiple" : "image-multiple-outline"}
          size={24}
          color={isFocused("catches") ? THEME.midBtn : THEME.textSec}
        />
        <Text
          style={{
            fontSize: 10,
            fontWeight: isFocused("catches") ? "600" : "500",
            color: isFocused("catches") ? THEME.text : THEME.textSec,
            marginTop: 4,
            letterSpacing: 0.2,
          }}
        >
          {t("tabGallery")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ingen ekstra styles pt.
});
