/**
 * Config plugin: adopt the UIKit scene-based life cycle on iOS.
 *
 * Why: apps built with the iOS 27 SDK (Xcode 27) crash at launch unless they use scenes. UIKit stops them with
 * "Application failed to launch: UIScene life cycle is required for apps built with this SDK."
 * The Expo SDK 57 native template (expo-template-bare-minimum 57.x) still creates its window in the AppDelegate,
 * which is the old, scene-less way. The `expo` package we already have (57.0.25) ships the pieces needed
 * (`ExpoAppSceneDelegate`, `ExpoReactNativeFactoryProvider`); SDK 58's template wires them up. This plugin applies
 * the same three changes to our generated `ios/` folder, so we don't have to upgrade the whole SDK:
 *   1. Info.plist: declare one window scene whose delegate is `SceneDelegate`.
 *   2. SceneDelegate.swift: a subclass of Expo's `ExpoAppSceneDelegate`, which creates the window and starts
 *      React Native when the scene connects, and forwards links and life-cycle events to the AppDelegate.
 *   3. AppDelegate.swift: conform to `ExpoReactNativeFactoryProvider` (so the scene delegate can find the React
 *      Native factory) and stop creating the window itself.
 * The deep-link overrides in the AppDelegate stay: Expo's scene forwarder calls them and makes sure React Native
 * hears about each link only once.
 * Remove this plugin when upgrading to Expo SDK 58 or later (its template already does all of this).
 */
const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppDelegate, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const SCENE_DELEGATE_SWIFT = `internal import Expo

// Added by plugins/withSceneLifecycle.js: the window scene's delegate (iOS 27 requires the scene life cycle).
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

/** The AppDelegate edits, as plain text replacements. Throws if the template changed shape, instead of guessing. */
function adoptSceneLifecycle(source) {
  let out = source;
  const classLine = /class AppDelegate: ExpoAppDelegate \{/;
  if (!out.includes('ExpoReactNativeFactoryProvider')) {
    if (!classLine.test(out)) throw new Error('withSceneLifecycle: AppDelegate class declaration not found');
    out = out.replace(classLine, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  }
  const windowBlock = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
  if (windowBlock.test(out)) {
    out = out.replace(windowBlock,
      '\n    // The window is created and React Native is started by `SceneDelegate` under the\n' +
      '    // scene-based life cycle (required by the iOS 27 SDK). See plugins/withSceneLifecycle.js.\n');
  } else if (/UIWindow\(frame:/.test(out)) {
    throw new Error('withSceneLifecycle: AppDelegate still creates a window, but not in the expected form');
  }
  return out;
}

const withSceneLifecycle = (config) => {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return c;
  });

  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    c.modResults.contents = adoptSceneLifecycle(c.modResults.contents);
    return c;
  });

  // Write SceneDelegate.swift next to AppDelegate.swift and add it to the app target's sources.
  config = withXcodeProject(config, (c) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const file = path.join(c.modRequest.platformProjectRoot, projectName, 'SceneDelegate.swift');
    fs.writeFileSync(file, SCENE_DELEGATE_SWIFT);
    const groupPath = `${projectName}/SceneDelegate.swift`;
    if (!c.modResults.hasFile(groupPath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: groupPath, groupName: projectName, project: c.modResults });
    }
    return c;
  });

  return config;
};

module.exports = withSceneLifecycle;
module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
