module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "babel-jest",
      {
        presets: ["babel-preset-expo"],
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "app/(tabs)/_utils/**/*.{ts,tsx}",
    "app/(tabs)/_hooks/**/*.{ts,tsx}",
    "!**/__tests__/**",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  // Coverage thresholds - increase these as more tests are added
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};
