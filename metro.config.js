const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Ensure semver is resolved from root node_modules for react-native-reanimated
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  semver: path.resolve(__dirname, "node_modules/semver"),
};

module.exports = config;
