import "dotenv/config";
import type { ExpoConfig } from "expo";

/**
 * Reads an environment variable from multiple possible names.
 * EAS Secrets are injected as env vars during build.
 */
function readKey(envNames: string[]): string {
  for (const name of envNames) {
    const val = process.env[name];
    if (val) return val;
  }
  return "";
}

// API Keys - check both direct name and EXPO_PUBLIC_ prefix for flexibility
const mapsApiKey = readKey(["MAPS_API_KEY", "EXPO_PUBLIC_MAPS_API_KEY"]);

// Firebase config
const firebaseApiKey = readKey(["FIREBASE_API_KEY", "EXPO_PUBLIC_FIREBASE_API_KEY"]);
const firebaseAuthDomain = readKey(["FIREBASE_AUTH_DOMAIN", "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"]);
const firebaseProjectId = readKey(["FIREBASE_PROJECT_ID", "EXPO_PUBLIC_FIREBASE_PROJECT_ID"]);
const firebaseStorageBucket = readKey(["FIREBASE_STORAGE_BUCKET", "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"]);
const firebaseMessagingSenderId = readKey(["FIREBASE_MESSAGING_SENDER_ID", "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"]);
const firebaseAppId = readKey(["FIREBASE_APP_ID", "EXPO_PUBLIC_FIREBASE_APP_ID"]);

// DMI/Backend URLs
const dmiClimateUrl = readKey(["DMI_CLIMATE_URL", "EXPO_PUBLIC_DMI_CLIMATE_URL"]);
const dmiEdrUrl = readKey(["DMI_EDR_URL", "EXPO_PUBLIC_DMI_EDR_URL"]);
const dmiOceanUrl = readKey(["DMI_OCEAN_URL", "EXPO_PUBLIC_DMI_OCEAN_URL"]);
const stacUrl = readKey(["STAC_URL", "EXPO_PUBLIC_STAC_URL"]);

const missingFirebaseEnvVars = [
  ["FIREBASE_API_KEY", firebaseApiKey],
  ["FIREBASE_AUTH_DOMAIN", firebaseAuthDomain],
  ["FIREBASE_PROJECT_ID", firebaseProjectId],
  ["FIREBASE_STORAGE_BUCKET", firebaseStorageBucket],
  ["FIREBASE_MESSAGING_SENDER_ID", firebaseMessagingSenderId],
  ["FIREBASE_APP_ID", firebaseAppId],
]
  .filter(([, value]) => value === undefined)
  .map(([name]) => name);

if (missingFirebaseEnvVars.length > 0) {
  console.warn(
    `Missing Firebase environment variables: ${missingFirebaseEnvVars.join(", ")}`
  );
}

const config: ExpoConfig = {
  name: "Logbog",
  slug: "havoerred-logbog",

  scheme: "havoerredlogbog",

  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",

  // GLOBALT APP-IKON (bruges på iOS, Android og web som udgangspunkt)
  icon: "./assets/icon.png",

  // SPLASH-SCREEN (vises ved opstart)
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },

  // NOTIFIKATIONERS UDSEENDE
  notification: {
    // Lille ikon til Android (skal være monokrom/transparent)
    icon: "./assets/android-icon-monochrome.png",
    color: "#121212",
    androidMode: "default",
    androidCollapsedTitle: "Logbog",
  },

  assetBundlePatterns: ["**/*"],

  extra: {
    mapsApiKey,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseStorageBucket,
    firebaseMessagingSenderId,
    firebaseAppId,
    dmiClimateUrl,
    dmiOceanUrl,
    dmiEdrUrl,
    stacUrl,
    eas: {
      projectId: "3addc63f-1548-430b-b623-130dc0217f99",
    },
  },

  updates: {
    url: "https://u.expo.dev/3addc63f-1548-430b-b623-130dc0217f99",
  },

  runtimeVersion: {
    policy: "appVersion",
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: "dk.havoerred.logbog",

    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || "./GoogleService-Info.plist",

    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Appen bruger din position til at tracke dine fisketure og vise ruten.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Appen bruger din position i baggrunden mens en tur er aktiv.",
      NSLocationAlwaysUsageDescription:
         "Appen bruger din position i baggrunden mens en tur er aktiv.",
      UIBackgroundModes: ["location"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: "dk.havoerred.logbog",

    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",

    useNextNotificationsApi: true,

    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],

    // ADAPTIVE ICON TIL ANDROID (runde/kvadratiske ikoner)
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundColor: "#121212",
    },

    // GOOGLE MAPS API KEY TIL ANDROID
    config: {
      googleMaps: {
        apiKey: mapsApiKey,
      },
    },
  },

  web: {
    favicon: "./assets/favicon.png",
  },

  plugins: ["expo-router", "expo-notifications"],
};

export default config;
