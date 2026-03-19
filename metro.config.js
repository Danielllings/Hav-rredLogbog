const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

module.exports = config;
