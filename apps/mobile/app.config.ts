/**
 * Expo app configuration (SPEC Section 5). `app.json` holds only the name, slug and the EAS project id
 * (written there by `npx eas-cli init`); everything else lives here so it can have comments.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

// Apple and Google need a unique id for the app. Change it with EMOLENS_BUNDLE_ID if this one is taken.
const BUNDLE_ID = process.env.EMOLENS_BUNDLE_ID ?? 'app.emolens.mobile';

// Permission explanations shown by iOS (SPEC 5). Passed to each plugin too, so no plugin replaces them with its default.
const TEXT = {
  health: 'EmoLens reads sleep, heart rate and steps to spot patterns. Raw readings stay on this phone.',
  locationWhenInUse: 'EmoLens notices which tagged place your child is at. Coordinates never leave this phone.',
  locationAlways: 'EmoLens notices arrivals at tagged places in the background. Coordinates never leave this phone.',
  calendar: 'EmoLens reads the calendars you choose to notice transitions and appointments. Event titles stay on this phone unless you let the AI features see them.',
  microphone: 'EmoLens measures how loud a room is (sound checks are never stored) and records voice notes, which are turned into text on your phone and then deleted unless you keep them.',
  camera: 'EmoLens scans food barcodes and reads the text of school notes on your phone. Photos are deleted right after.',
  photos: 'Choose a photo of a school note: EmoLens reads its text on your phone and never stores the photo.',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'EmoLens',
  slug: config.slug ?? 'emolens',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'emolens',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // SPEC 5: usage descriptions. No Bluetooth: the room sensor is future work (DECISIONS #138, #146).
      NSHealthShareUsageDescription: TEXT.health,
      NSLocationWhenInUseUsageDescription: TEXT.locationWhenInUse,
      NSLocationAlwaysAndWhenInUseUsageDescription: TEXT.locationAlways,
      NSCalendarsFullAccessUsageDescription: TEXT.calendar,
      NSCalendarsUsageDescription: TEXT.calendar,
      NSMicrophoneUsageDescription: TEXT.microphone,
      NSCameraUsageDescription: TEXT.camera,
      NSPhotoLibraryUsageDescription: TEXT.photos,
      NSFaceIDUsageDescription: 'EmoLens can lock with Face ID so only you can open it.',
      UIBackgroundModes: ['location', 'fetch', 'processing'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#4A5FD6',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'READ_CALENDAR', 'RECORD_AUDIO', 'CAMERA',
      'POST_NOTIFICATIONS', 'USE_BIOMETRIC',
      // Health Connect read permissions (SPEC 5, 11.1)
      'android.permission.health.READ_SLEEP', 'android.permission.health.READ_HEART_RATE',
      'android.permission.health.READ_RESTING_HEART_RATE', 'android.permission.health.READ_HEART_RATE_VARIABILITY',
      'android.permission.health.READ_STEPS', 'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ['expo-local-authentication', { faceIDPermission: 'EmoLens can lock with Face ID so only you can open it.' }],
    ['expo-notifications', { color: '#4A5FD6' }],
    '@react-native-community/datetimepicker',
    ['expo-splash-screen', { backgroundColor: '#F6F7FB', image: './assets/images/splash-icon.png', imageWidth: 120,
      dark: { backgroundColor: '#0F1320', image: './assets/images/splash-icon.png' } }],
    // Phase 4 data sources (SPEC 11)
    // Geofencing needs background location but no always-on Android foreground service; motion data isn't used.
    ['expo-location', { locationWhenInUsePermission: TEXT.locationWhenInUse, locationAlwaysAndWhenInUsePermission: TEXT.locationAlways,
      locationAlwaysPermission: TEXT.locationAlways, motionUsagePermission: false,
      isIosBackgroundLocationEnabled: true, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: false }],
    ['expo-calendar', { calendarPermission: TEXT.calendar }],
    ['expo-camera', { cameraPermission: TEXT.camera, microphonePermission: TEXT.microphone, recordAudioAndroid: false }],
    ['expo-audio', { microphonePermission: TEXT.microphone, enableBackgroundPlayback: false }],
    ['expo-image-picker', { photosPermission: TEXT.photos, cameraPermission: TEXT.camera, microphonePermission: false }],
    'expo-background-task',
    ['@kingstinct/react-native-healthkit', { NSHealthShareUsageDescription: TEXT.health, NSHealthUpdateUsageDescription: false, background: true }],
    'react-native-health-connect',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    // iOS 27 SDK requires the UIScene life cycle; Expo SDK 57's template doesn't adopt it yet (DECISIONS #39).
    './plugins/withSceneLifecycle',
  ],
  experiments: { typedRoutes: false },
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    portalUrl: process.env.EXPO_PUBLIC_PORTAL_URL ?? '',
  },
});
