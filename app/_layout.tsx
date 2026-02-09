// app/_layout.tsx
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { auth, onAuthStateChanged, User } from "../lib/firebase";
import { initDB } from "../lib/db";
import SplashScreen from "../components/SplashScreen";
import { LanguageProvider } from "../lib/i18n";
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
  const wasConnectedRef = useRef<boolean | null>(null);
  const syncInProgressRef = useRef(false);

  // Synkroniser offline-ture
  const trySyncOfflineTrips = async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    try {
      const synced = await syncOfflineTrips();
      if (synced > 0) {
        console.log(`[RootLayout] Synced ${synced} offline trips`);
      }
    } catch (e) {
      console.log("[RootLayout] Offline sync error:", e);
    } finally {
      syncInProgressRef.current = false;
    }
  };

  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined;
    let unsubscribeNetInfo: (() => void) | undefined;

    const init = async () => {
      try {
        await initDB();

        unsubscribeAuth = onAuthStateChanged(auth, (u) => {
          // u = User eller null
          setUser(u ?? null);
          setAuthReady(true);

          // Synk offline-ture når bruger logger ind
          if (u) {
            trySyncOfflineTrips();
          }
        });

        // Lyt til netværksændringer
        unsubscribeNetInfo = NetInfo.addEventListener((state) => {
          const isConnected = state.isConnected === true && state.isInternetReachable !== false;

          // Hvis vi lige er gået fra offline -> online, synk offline-ture
          if (isConnected && wasConnectedRef.current === false) {
            console.log("[RootLayout] Network restored, syncing offline trips...");
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

  return (
    <LanguageProvider>
      <Stack
        screenOptions={{ headerShown: false }}
        // Default route – vi redirigerer alligevel ovenfor
        initialRouteName="(auth)"
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {/* Splash screen mens vi finder ud af om brugeren er logget ind */}
      {(user === undefined || !authReady) && <SplashScreen />}
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({});
