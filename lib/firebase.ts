// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra as any) || {};

const firebaseApiKey = extra.firebaseApiKey || "";
const firebaseAuthDomain = extra.firebaseAuthDomain;
const firebaseProjectId = extra.firebaseProjectId;
const firebaseStorageBucket = extra.firebaseStorageBucket;
const firebaseMessagingSenderId = extra.firebaseMessagingSenderId;
const firebaseAppId = extra.firebaseAppId;

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

if (missingFirebaseConfigFields.length > 0) {
  console.warn(
    "[firebase] Missing config fields:",
    missingFirebaseConfigFields.join(", ")
  );
} else {
  console.info("[firebase] Config fields present:", firebaseConfigPresence);
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
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
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
  type User,
};
