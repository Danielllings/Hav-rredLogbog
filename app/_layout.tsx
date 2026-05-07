// app/_layout.tsx
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import { DarkTheme, ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, AppState, AppStateStatus, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth, onAuthStateChanged, User } from "../lib/firebase";
import { initDB } from "../lib/db";
import SplashScreen from "../components/SplashScreen";
import Onboarding, { ONBOARDING_COMPLETE_KEY } from "../components/Onboarding";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import { syncOfflineTrips } from "../lib/offlineTrips";

/**
 * Auth-beskyttet routing
 */
function useProtectedRoute(user: User | null | undefined, authReady: boolean) {
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    // Vent til auth er rehydreret
    if (!authReady) return;

    // Vi ved endnu ikke om brugeren er logget ind -> vent
    if (user === undefined) return;

    // Navigationen er ikke klar endnu -> vent
    if (!navState?.key) return;

    // WEB PREVIEW: skip auth gate on web platform
    if (Platform.OS === "web") {
      const inAuthGroup = segments[0] === "(auth)";
      if (inAuthGroup) {
        router.replace("/(tabs)");
      }
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";

    if (user && inAuthGroup) {
      // Logget ind men står på login -> send til appen
      router.replace("/(tabs)");
    } else if (!user && !inAuthGroup) {
      // Ikke logget ind og ikke i (auth) -> send til login
      router.replace("/(auth)");
    }
  }, [user, segments, navState?.key, router]);
}

/**
 * RootLayout
 * VIGTIGT: Skal ALTID renderere en navigator (Stack/Slot) på første render.
 */
export default function RootLayout() {
  // undefined = ved endnu ikke om der er en bruger
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [authReady, setAuthReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const wasConnectedRef = useRef<boolean | null>(null);
  const syncInProgressRef = useRef(false);

  // Synkroniser offline-ture
  const trySyncOfflineTrips = async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    try {
      const synced = await syncOfflineTrips();
      if (synced > 0) {
        // console.log(`[RootLayout] Synced ${synced} offline trips`);
      }
    } catch (e) {
      // console.log("[RootLayout] Offline sync error:", e);
    } finally {
      syncInProgressRef.current = false;
    }
  };

  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined;
    let unsubscribeNetInfo: (() => void) | undefined;

    const init = async () => {
      try {
        // WEB PREVIEW: skip heavy native init, go straight to app
        if (Platform.OS === "web") {
          setOnboardingComplete(true);
          setUser(null);
          setAuthReady(true);
          return;
        }

        await initDB();

        // Check if onboarding has been completed
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
        setOnboardingComplete(onboardingDone === "true");

        unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
          // u = User eller null
          setUser(u ?? null);
          setAuthReady(true);

          if (u) {
            trySyncOfflineTrips();
          }
        });

        // Lyt til netværksændringer
        unsubscribeNetInfo = NetInfo.addEventListener((state) => {
          const isConnected = state.isConnected === true && state.isInternetReachable !== false;

          // Hvis vi lige er gået fra offline -> online, synk offline-ture
          if (isConnected && wasConnectedRef.current === false) {
            // console.log("[RootLayout] Network restored, syncing offline trips...");
            trySyncOfflineTrips();
          }

          wasConnectedRef.current = isConnected;
        });

        // Initial sync ved app-start
        trySyncOfflineTrips();
      } catch (e) {
        console.error("Failed to init DB", e);
        // Ved fejl antager vi bare, at der ikke er nogen bruger
        setUser(null);
        setAuthReady(true);
      }
    };

    init();

    // Synk når app vender tilbage fra baggrund
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        trySyncOfflineTrips();
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeNetInfo) unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, []);

  // Sæt auth-beskyttelse på
  useProtectedRoute(user, authReady);

  // Show splash while checking onboarding + auth state
  const isLoading = onboardingComplete === null || user === undefined || !authReady;

  // Show onboarding if not completed
  if (!isLoading && onboardingComplete === false) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <Onboarding onComplete={() => setOnboardingComplete(true)} />
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: "#121212",
      card: "#1E1E1E",
      border: "#333333",
      text: "#FFFFFF",
    },
  };

  return (
    <ThemeProvider>
      <LanguageProvider>
        <NavThemeProvider value={navTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              contentStyle: { backgroundColor: "#121212" },
            }}
            initialRouteName="(auth)"
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>

          {/* Splash screen mens vi finder ud af om brugeren er logget ind */}
          {isLoading && <SplashScreen />}
        </NavThemeProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({});
