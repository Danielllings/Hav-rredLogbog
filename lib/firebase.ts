// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  browserLocalPersistence,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

// React Native persistence — only available on native platforms
let getReactNativePersistence: any;
let ReactNativeAsyncStorage: any;
if (Platform.OS !== "web") {
  // @ts-ignore - React Native specific export
  getReactNativePersistence = require("firebase/auth").getReactNativePersistence;
  ReactNativeAsyncStorage = require("@react-native-async-storage/async-storage").default;
}

const extra = (Constants.expoConfig?.extra as any) || {};

const firebaseApiKey = extra.firebaseApiKey || "";
const firebaseAuthDomain = extra.firebaseAuthDomain;
const firebaseProjectId = extra.firebaseProjectId;
const firebaseStorageBucket = extra.firebaseStorageBucket;
const firebaseMessagingSenderId = extra.firebaseMessagingSenderId;
// Vælg den rigtige App ID baseret på platform
const firebaseAppId = Platform.OS === "ios"
  ? extra.firebaseAppIdIos
  : extra.firebaseAppIdAndroid;

const firebaseConfigPresence = {
  apiKey: !!firebaseApiKey,
  authDomain: !!firebaseAuthDomain,
  projectId: !!firebaseProjectId,
  storageBucket: !!firebaseStorageBucket,
  messagingSenderId: !!firebaseMessagingSenderId,
  appId: !!firebaseAppId,
};

const missingFirebaseConfigFields = Object.entries(firebaseConfigPresence)
  .filter(([, present]) => !present)
  .map(([key]) => key);

if (__DEV__) {
  if (missingFirebaseConfigFields.length > 0) {
    console.warn(
      "[firebase] Missing config fields:",
      missingFirebaseConfigFields.join(", ")
    );
  } else {
    console.info("[firebase] Config fields present:", firebaseConfigPresence);
  }
}

if (!firebaseApiKey) {
  throw new Error("Firebase API noegle mangler (extra.firebaseApiKey)");
}

// Brug dine egne noegler
const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
  ...(extra.firebaseMeasurementId
    ? { measurementId: extra.firebaseMeasurementId }
    : {}),
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = initializeAuth(app, {
  persistence: Platform.OS === "web"
    ? browserLocalPersistence
    : getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = getFirestore(app);
const storage = getStorage(app); // bruger bucket fra storageBucket

export {
  app,
  db,
  storage,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  type User,
};
