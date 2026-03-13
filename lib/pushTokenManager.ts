// lib/pushTokenManager.ts
// FCM push token handling for weather alerts

import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db, auth } from "./firebase";
import {
  PushTokenDocument,
  FIRESTORE_COLLECTIONS,
} from "../types/weatherAlerts";

// ============================================================================
// Constants
// ============================================================================

// Get project ID from Expo config
const EXPO_PROJECT_ID =
  (Constants.expoConfig?.extra as any)?.eas?.projectId ||
  Constants.easConfig?.projectId ||
  "";

// ============================================================================
// Push Token Registration
// ============================================================================

/**
 * Check if we're running on a physical device
 */
function isPhysicalDevice(): boolean {
  // In Expo, Constants.isDevice indicates if running on physical device
  return !__DEV__ || Constants.isDevice === true;
}

/**
 * Get the current Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  // Check if physical device (push notifications don't work in simulators)
  if (!isPhysicalDevice()) {
    console.log("[PushToken] Must use physical device for push notifications");
    return null;
  }

  // Check notification permissions
  const permissions = await Notifications.getPermissionsAsync();
  const existingGranted =
    (permissions as any).granted || (permissions as any).status === "granted";

  let finalGranted = existingGranted;

  if (!existingGranted) {
    const newPermissions = await Notifications.requestPermissionsAsync();
    finalGranted =
      (newPermissions as any).granted || (newPermissions as any).status === "granted";
  }

  if (!finalGranted) {
    console.log("[PushToken] Push notification permissions not granted");
    return null;
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    return tokenData.data;
  } catch (error) {
    console.error("[PushToken] Error getting Expo push token:", error);
    return null;
  }
}

/**
 * Get device ID for token identification
 */
function getDeviceId(): string {
  // Use a combination of platform and device name
  const deviceName = Constants.deviceName || "unknown";
  return `${Platform.OS}-${deviceName}-${Date.now()}`;
}

/**
 * Register push token in Firestore
 */
export async function registerPushToken(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, error: "User not authenticated" };
  }

  const token = await getExpoPushToken();
  if (!token) {
    return { success: false, error: "Could not get push token" };
  }

  try {
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    // Create token document
    const tokenDoc: PushTokenDocument = {
      token,
      platform: Platform.OS as "ios" | "android",
      deviceId,
      deviceName: Constants.deviceName || undefined,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // Save to user's pushTokens collection
    const tokenRef = doc(
      db,
      FIRESTORE_COLLECTIONS.userPushTokens(user.uid),
      token.replace(/[^a-zA-Z0-9]/g, "_") // Sanitize token for document ID
    );
    await setDoc(tokenRef, tokenDoc, { merge: true });

    // Also update the aggregated weatherAlertUsers document
    await updateWeatherAlertUserTokens(user.uid);

    console.log("[PushToken] Token registered successfully");
    return { success: true, token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[PushToken] Error registering token:", error);
    return { success: false, error: message };
  }
}

/**
 * Unregister push token from Firestore
 */
export async function unregisterPushToken(token?: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  try {
    // If no token provided, get current device's token
    const tokenToRemove = token || (await getExpoPushToken());
    if (!tokenToRemove) {
      return false;
    }

    // Delete from user's pushTokens collection
    const tokenRef = doc(
      db,
      FIRESTORE_COLLECTIONS.userPushTokens(user.uid),
      tokenToRemove.replace(/[^a-zA-Z0-9]/g, "_")
    );
    await deleteDoc(tokenRef);

    // Update aggregated document
    await updateWeatherAlertUserTokens(user.uid);

    console.log("[PushToken] Token unregistered successfully");
    return true;
  } catch (error) {
    console.error("[PushToken] Error unregistering token:", error);
    return false;
  }
}

/**
 * Refresh push token (call on app start and when token changes)
 */
export async function refreshPushToken(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  const token = await getExpoPushToken();
  if (!token) {
    return false;
  }

  try {
    const tokenRef = doc(
      db,
      FIRESTORE_COLLECTIONS.userPushTokens(user.uid),
      token.replace(/[^a-zA-Z0-9]/g, "_")
    );

    await setDoc(
      tokenRef,
      {
        token,
        updatedAt: new Date().toISOString(),
        isActive: true,
      },
      { merge: true }
    );

    // Update aggregated document
    await updateWeatherAlertUserTokens(user.uid);

    return true;
  } catch (error) {
    console.error("[PushToken] Error refreshing token:", error);
    return false;
  }
}

/**
 * Get all active push tokens for current user
 */
export async function getActivePushTokens(): Promise<string[]> {
  const user = auth.currentUser;
  if (!user) {
    return [];
  }

  try {
    const tokensRef = collection(db, FIRESTORE_COLLECTIONS.userPushTokens(user.uid));
    const q = query(tokensRef, where("isActive", "==", true));
    const snapshot = await getDocs(q);

    const tokens: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as PushTokenDocument;
      if (data.token) {
        tokens.push(data.token);
      }
    });

    return tokens;
  } catch (error) {
    console.error("[PushToken] Error getting active tokens:", error);
    return [];
  }
}

// ============================================================================
// Aggregated Document Updates
// ============================================================================

/**
 * Update the weatherAlertUsers document with current push tokens
 * This is called when tokens change
 */
async function updateWeatherAlertUserTokens(userId: string): Promise<void> {
  try {
    const tokens = await getActivePushTokensForUser(userId);

    const userDocRef = doc(db, FIRESTORE_COLLECTIONS.weatherAlertUsers, userId);
    await setDoc(
      userDocRef,
      {
        userId,
        pushTokens: tokens,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("[PushToken] Error updating weatherAlertUsers:", error);
  }
}

/**
 * Get active push tokens for a specific user (used internally)
 */
async function getActivePushTokensForUser(userId: string): Promise<string[]> {
  try {
    const tokensRef = collection(db, FIRESTORE_COLLECTIONS.userPushTokens(userId));
    const q = query(tokensRef, where("isActive", "==", true));
    const snapshot = await getDocs(q);

    const tokens: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as PushTokenDocument;
      if (data.token) {
        tokens.push(data.token);
      }
    });

    return tokens;
  } catch (error) {
    console.error("[PushToken] Error getting tokens for user:", error);
    return [];
  }
}

// ============================================================================
// Setup Notification Handlers
// ============================================================================

/**
 * Setup notification handlers for the app
 * Call this in app initialization
 * Returns cleanup function to remove listeners
 */
export function setupNotificationHandlers(): () => void {
  // Handle notifications received while app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Listen for token refresh
  const tokenSubscription = Notifications.addPushTokenListener(async (token) => {
    console.log("[PushToken] Token refreshed:", token.data);
    await refreshPushToken();
  });

  // Return cleanup function
  return () => {
    tokenSubscription.remove();
  };
}

/**
 * Add listener for notification responses (user tapped notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add listener for notifications received while app is open
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}
