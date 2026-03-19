const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the functions folder from bundling (it's for Cloud Functions, not React Native)
config.resolver.blockList = [
  /functions\/.*/,
];

// Add semver to extra node modules
const semverPath = path.resolve(__dirname, "node_modules/semver");
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  semver: semverPath,
};

// Custom resolver to handle semver subpath imports
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Handle semver subpath imports used by react-native-reanimated
  if (moduleName.startsWith("semver/")) {
    const subpath = moduleName.replace("semver/", "");
    return {
      type: "sourceFile",
      filePath: path.resolve(semverPath, subpath + ".js"),
    };
  }

  // Use default resolver for everything else
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
