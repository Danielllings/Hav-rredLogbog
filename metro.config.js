const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Shims directory for semver subpath imports
const shimsDir = path.resolve(__dirname, "shims");

// Add semver shims to extra node modules for react-native-reanimated
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "semver/functions/satisfies": path.join(shimsDir, "semver/functions/satisfies.js"),
  "semver/functions/prerelease": path.join(shimsDir, "semver/functions/prerelease.js"),
};

module.exports = config;
