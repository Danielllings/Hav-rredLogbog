const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Web shims for native-only packages (used by LingX preview).
// The platform check is INSIDE the resolver — no env/argv needed.
const webShims = {
  "react-native-maps": path.resolve(__dirname, "web-shims/react-native-maps.js"),
  "expo-sqlite": path.resolve(__dirname, "web-shims/expo-sqlite.js"),
  "expo-sqlite/next": path.resolve(__dirname, "web-shims/expo-sqlite.js"),
  "firebase/firestore": path.resolve(__dirname, "web-shims/firebase-firestore.js"),
  "firebase/storage": path.resolve(__dirname, "web-shims/firebase-storage.js"),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && webShims[moduleName]) {
    return { filePath: webShims[moduleName], type: "sourceFile" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
