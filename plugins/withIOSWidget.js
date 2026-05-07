// plugins/withIOSWidget.js
// Expo Config Plugin: adds iOS WidgetKit extension + App Groups + fixes code signing

const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WIDGET_TARGET_NAME = "FishingWidgetExtension";
const APP_GROUP_ID = "group.dk.havoerred.logbog";
const WIDGET_BUNDLE_ID_SUFFIX = ".widget";

function withIOSWidget(config) {
  // Step 1: App Groups entitlement on main app
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = [APP_GROUP_ID];
    return config;
  });

  // Step 2: Fix resource bundle code signing in Podfile (Xcode 14+)
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, "utf8");
        if (!podfile.includes("CODE_SIGNING_ALLOWED")) {
          const codeSignFix = `
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"
      target.build_configurations.each do |config|
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      end
    end
  end
end
`;
          // If there's already a post_install, inject into it
          if (podfile.includes("post_install do |installer|")) {
            podfile = podfile.replace(
              /post_install do \|installer\|/,
              `post_install do |installer|
  # Fix resource bundle signing for Xcode 14+
  installer.pods_project.targets.each do |target|
    if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"
      target.build_configurations.each do |c|
        c.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      end
    end
  end`
            );
          } else {
            podfile += codeSignFix;
          }
          fs.writeFileSync(podfilePath, podfile);
        }
      }
      return config;
    },
  ]);

  // Step 3: Add widget extension target to Xcode project
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const mainBundleId = config.ios?.bundleIdentifier || "dk.havoerred.logbog";
    const widgetBundleId = mainBundleId + WIDGET_BUNDLE_ID_SUFFIX;
    const projectRoot = config.modRequest.projectRoot;

    // Skip if already added
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    for (const key of Object.keys(nativeTargets)) {
      if (typeof nativeTargets[key] === "object" &&
          nativeTargets[key].name === `"${WIDGET_TARGET_NAME}"`) {
        return config;
      }
    }

    // Get development team from main target
    let developmentTeam = null;
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      if (typeof entry === "object" && entry.buildSettings?.DEVELOPMENT_TEAM) {
        developmentTeam = entry.buildSettings.DEVELOPMENT_TEAM;
        break;
      }
    }

    // Copy Swift files to build directory
    const widgetSourceDir = path.join(projectRoot, "ios", "widget");
    const widgetBuildDir = path.join(projectRoot, "ios", WIDGET_TARGET_NAME);

    if (!fs.existsSync(widgetBuildDir)) {
      fs.mkdirSync(widgetBuildDir, { recursive: true });
    }

    const swiftFiles = [
      "FishingWidget.swift",
      "FishingTimelineProvider.swift",
      "FishingWidgetView.swift",
    ];

    for (const file of swiftFiles) {
      const src = path.join(widgetSourceDir, file);
      const dst = path.join(widgetBuildDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    // Write entitlements
    fs.writeFileSync(
      path.join(widgetBuildDir, `${WIDGET_TARGET_NAME}.entitlements`),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>`
    );

    // Write Info.plist
    fs.writeFileSync(
      path.join(widgetBuildDir, "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>da</string>
  <key>CFBundleDisplayName</key>
  <string>Havørred Logbog</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>`
    );

    // Add target
    const widgetTarget = xcodeProject.addTarget(
      WIDGET_TARGET_NAME,
      "app_extension",
      WIDGET_TARGET_NAME,
      widgetBundleId
    );

    if (!widgetTarget) {
      console.warn("[withIOSWidget] Failed to add widget target");
      return config;
    }

    // Add file group
    const widgetGroup = xcodeProject.addPbxGroup(
      swiftFiles.map((f) => path.join(WIDGET_TARGET_NAME, f)),
      WIDGET_TARGET_NAME,
      WIDGET_TARGET_NAME
    );

    // Add source files to widget target
    for (const file of swiftFiles) {
      xcodeProject.addSourceFile(
        path.join(WIDGET_TARGET_NAME, file),
        { target: widgetTarget.uuid },
        widgetGroup.uuid
      );
    }

    // Configure build settings for widget target
    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;

      if (
        entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === widgetBundleId ||
        entry.buildSettings.PRODUCT_NAME === `"${WIDGET_TARGET_NAME}"`
      ) {
        entry.buildSettings.SWIFT_VERSION = "5.0";
        entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "17.0";
        entry.buildSettings.TARGETED_DEVICE_FAMILY = `"1"`;
        entry.buildSettings.CODE_SIGN_STYLE = "Automatic";
        entry.buildSettings.CODE_SIGNING_ALLOWED = "YES";
        entry.buildSettings.CODE_SIGN_ENTITLEMENTS = `${WIDGET_TARGET_NAME}/${WIDGET_TARGET_NAME}.entitlements`;
        entry.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        entry.buildSettings.INFOPLIST_FILE = `${WIDGET_TARGET_NAME}/Info.plist`;
        entry.buildSettings.MARKETING_VERSION = "1.1.0";
        entry.buildSettings.CURRENT_PROJECT_VERSION = "1";
        entry.buildSettings.SKIP_INSTALL = "YES";
        if (developmentTeam) {
          entry.buildSettings.DEVELOPMENT_TEAM = developmentTeam;
        }
      }
    }

    // Also fix ALL resource bundle targets in the project
    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;
      // Resource bundles have PRODUCT_BUNDLE_PACKAGE_TYPE = BNDL
      if (entry.buildSettings.WRAPPER_EXTENSION === `"bundle"` ||
          entry.buildSettings.PRODUCT_TYPE === `"com.apple.product-type.bundle"`) {
        entry.buildSettings.CODE_SIGNING_ALLOWED = "NO";
      }
    }

    // Embed widget extension in main app
    const mainTargetUuid = xcodeProject.getFirstTarget().uuid;
    xcodeProject.addBuildPhase(
      [],
      "PBXCopyFilesBuildPhase",
      "Embed App Extensions",
      mainTargetUuid,
      "app_extension"
    );

    return config;
  });

  return config;
}

module.exports = withIOSWidget;
