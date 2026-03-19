const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Resolve semver and its subpaths for react-native-reanimated
const semverPath = path.resolve(__dirname, "node_modules/semver");
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  semver: semverPath,
  "semver/functions/satisfies": path.resolve(semverPath, "functions/satisfies"),
  "semver/functions/prerelease": path.resolve(semverPath, "functions/prerelease"),
};

module.exports = config;
