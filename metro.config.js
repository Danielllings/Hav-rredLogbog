const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Get the actual semver package path using require.resolve
const semverMainPath = require.resolve("semver");
const semverDir = path.dirname(semverMainPath);

// Add semver and its subpaths to extra node modules
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  semver: semverDir,
  "semver/functions/satisfies": path.join(semverDir, "functions", "satisfies.js"),
  "semver/functions/prerelease": path.join(semverDir, "functions", "prerelease.js"),
};

module.exports = config;
