const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withDisableExtraTranslationLint(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('disable += "ExtraTranslation"')) {
      config.modResults.contents = contents.replace(
        /android\s*\{/,
        `android {\n    lint {\n        disable += "ExtraTranslation"\n    }`
      );
    }
    return config;
  });
};
