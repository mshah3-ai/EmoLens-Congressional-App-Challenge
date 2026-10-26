/** Jest setup: fake the native modules the tests touch. */
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));
// Reanimated's test mock (used by expo-router's test renderer) needs react-native-worklets' mock, or it fails to load and
// every entering/exiting animation (FadeIn.duration(...)) is undefined in screen tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn(), isSQLCipher: () => true }));
jest.mock('expo-audio', () => {
  // Like the real hook, the same recorder on every render (a new one each time would restart the sound check forever).
  const recorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), getStatus: () => ({}), uri: null };
  return {
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: jest.fn(() => recorder),
    RecordingPresets: { LOW_QUALITY: {} },
  };
});
// Native health libraries: no native side in Jest. Report "not available", like a phone without Health.
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => false),
  getRequestStatusForAuthorization: jest.fn(async () => 1),
  requestAuthorization: jest.fn(async () => false),
  queryCategorySamples: jest.fn(async () => []),
  queryQuantitySamples: jest.fn(async () => []),
  enableBackgroundDelivery: jest.fn(async () => true),
  subscribeToChanges: jest.fn(() => ({ remove: jest.fn() })),
  AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
  UpdateFrequency: { immediate: 1, hourly: 2, daily: 3, weekly: 4 },
}));
jest.mock('react-native-health-connect', () => ({
  getSdkStatus: jest.fn(async () => 1), initialize: jest.fn(async () => false), getGrantedPermissions: jest.fn(async () => []),
  requestPermission: jest.fn(async () => []), readRecords: jest.fn(async () => ({ records: [] })),
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
}));
// Phase 6: PDF printing, the share sheet, the file picker and files. An in-memory file store stands in for the phone's.
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/Print-1.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'); }
    get exists() { return files.has(this.uri); }
    create() { files.set(this.uri, ''); }
    write(s: string) { files.set(this.uri, s); }
    async text() { return files.get(this.uri) ?? ''; }
    delete() { files.delete(this.uri); }
    moveSync(dest: { uri: string }) { files.set(dest.uri, files.get(this.uri) ?? ''); files.delete(this.uri); this.uri = dest.uri; }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'); }
    get exists() { return [...files.keys()].some((k) => k.startsWith(`${this.uri}/`)); }
    create() { /* folders exist implicitly in this fake */ }
    delete() { for (const k of [...files.keys()]) if (k.startsWith(`${this.uri}/`)) files.delete(k); }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///document' } }, __files: files };
});

// Phase 8 native modules (on-device speech-to-text, text recognition, photo picker): not available in Node.
jest.mock('whisper.rn/index', () => ({
  initWhisper: jest.fn(async () => ({
    transcribe: jest.fn(() => ({ stop: jest.fn(), promise: Promise.resolve({ result: ' Test', segments: [], isAborted: false }) })),
    release: jest.fn(async () => undefined),
  })),
}));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) }));
jest.mock('expo-text-extractor', () => ({ isSupported: true, extractTextFromImage: jest.fn(async () => []) }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
