/**
 * @jest-environment node
 * plugins/withSceneLifecycle.js must turn the Expo SDK 57 AppDelegate into the scene-based shape that iOS 27
 * requires (DECISIONS #39), be safe to run twice (prebuild runs plugins on every build), and fail loudly if a future
 * template no longer matches instead of producing an app that crashes at launch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is CommonJS, loaded by Expo's config system
const { adoptSceneLifecycle } = require('../plugins/withSceneLifecycle') as { adoptSceneLifecycle: (s: string) => string };

const sdk57 = readFileSync(join(__dirname, 'fixtures/AppDelegate.sdk57.swift'), 'utf8');

test('SDK 57 AppDelegate: conforms to the provider and no longer creates the window', () => {
  const out = adoptSceneLifecycle(sdk57);
  expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  expect(out).not.toContain('UIWindow(frame:');
  expect(out).not.toContain('startReactNative');
  expect(out).toContain('reactNativeFactory = factory'); // the factory is still created for the scene delegate
  expect(out).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
  expect(out).toContain('RCTLinkingManager.application(app, open: url, options: options)'); // link handling kept
});

test('running it twice changes nothing more', () => {
  const once = adoptSceneLifecycle(sdk57);
  expect(adoptSceneLifecycle(once)).toBe(once);
});

test('an AppDelegate in an unexpected shape is rejected', () => {
  expect(() => adoptSceneLifecycle('class AppDelegate: SomethingElse {}')).toThrow(/class declaration not found/);
  const oddWindow = sdk57.replace('#if os(iOS) || os(tvOS)\n', '');
  expect(() => adoptSceneLifecycle(oddWindow)).toThrow(/still creates a window/);
});
