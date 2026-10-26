/**
 * Root of the app. Boots the encrypted database (store/session.ts), then shows onboarding or the main app
 * using expo-router's Stack.Protected guards. Also: theme, notifications deep links, toasts, app lock,
 * and the global error boundary (SPEC 29).
 */
import '../src/i18n';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { router, Stack, ThemeProvider, DarkTheme, DefaultTheme, type ErrorBoundaryProps } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Importing this file also defines the background tasks, which must exist as soon as the JS bundle loads.
import { registerBackgroundTasks } from '../src/background/tasks';
import { refreshMedReminders, refreshNow, watchHealthChanges } from '../src/integrations/appRefresh';
import { configureNotifications, urlFromResponse } from '../src/notifications';
import { handleAlertAction } from '../src/notifications/alertActions';
import { handleMedAction } from '../src/notifications/medActions';
import { BuildingScreen } from '../src/demo/BuildingScreen';
import { AppGuard } from '../src/security/AppGuard';
import { useSession } from '../src/store/session';
import { RemovedScreen } from '../src/features/cloud/RemovedScreen';
import { startSync } from '../src/sync/engine';
import { FatalScreen } from '../src/ui/FatalScreen';
import { ToastHost } from '../src/ui/Toast';
import { useTheme } from '../src/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const modal = { presentation: 'modal' as const, headerShown: false };

export default function RootLayout() {
  const { c, scheme } = useTheme();
  const status = useSession((s) => s.status);
  const boot = useSession((s) => s.boot);
  const childDevice = useSession((s) => s.settings.device_role === 'child_device');
  const removed = useSession((s) => s.settings.removed_from_team && !s.isDemo);
  const removedNotice = useSession((s) => s.removedNotice != null);

  useEffect(() => { void boot(); void configureNotifications().catch(() => undefined); }, [boot]);
  useEffect(() => { if (status !== 'booting') void SplashScreen.hideAsync().catch(() => undefined); }, [status]);

  // Tapping a notification opens its screen (e.g. "add details" -> the episode edit sheet), including on cold start.
  useEffect(() => {
    if (status !== 'ready') return;
    const open = async (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      if (await handleMedAction(r).catch(() => false)) return; // "Given" / "Skip" buttons on a medication reminder
      if (await handleAlertAction(r).catch(() => false)) return; // "All calm" / "We stepped in early" / "A hard moment happened" / "We're on it"
      const url = urlFromResponse(r);
      if (url) router.push(url as never);
    };
    // Notifications must never be able to crash the app (SPEC 29: integrations degrade gracefully).
    try {
      void Notifications.getLastNotificationResponseAsync().then(open, () => undefined);
      const sub = Notifications.addNotificationResponseReceivedListener((r) => { void open(r); });
      return () => sub.remove();
    } catch {
      return undefined;
    }
  }, [status]);

  // Data sources (SPEC 11.8): refresh on start and whenever the app comes back to the foreground (throttled to 5 min),
  // keep medication reminders current, register the background refresh, and let Apple Health wake us for new data.
  useEffect(() => {
    if (status !== 'ready') return;
    startSync(); // Care Team sync (SPEC 23.3): does nothing until Care Team is on
    void refreshNow();
    void refreshMedReminders();
    void registerBackgroundTasks().catch(() => undefined);
    void watchHealthChanges();
    // On return (e.g. from Settings): re-check permissions shown on screen, then refresh (throttled).
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { useSession.getState().bump(); void refreshNow(); } });
    return () => sub.remove();
  }, [status]);

  const navTheme = { ...(scheme === 'dark' ? DarkTheme : DefaultTheme), colors: {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.primary,
  } };

  let body;
  if (status === 'building_demo') {
    body = <BuildingScreen />;
  } else if (status === 'booting' || (status === 'ready' && removed)) {
    // (removed: this phone's copy is about to be deleted, DECISIONS #118)
    body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.primary} /></View>;
  } else if (status === 'migration_failed' || status === 'error') {
    body = <FatalScreen kind={status} />;
  } else if (removedNotice) {
    body = <RemovedScreen />;
  } else {
    body = (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={status === 'onboarding'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'ready' && !childDevice}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="log/episode" options={modal} />
          <Stack.Screen name="log/meal" options={modal} />
          <Stack.Screen name="log/scan" options={modal} />
          <Stack.Screen name="log/med" options={modal} />
          <Stack.Screen name="log/sleep" options={modal} />
          <Stack.Screen name="log/place" options={modal} />
          <Stack.Screen name="log/illness" options={modal} />
          <Stack.Screen name="log/routine" options={modal} />
          <Stack.Screen name="log/note" options={modal} />
          <Stack.Screen name="log/strategy" options={modal} />
          <Stack.Screen name="log/sound" options={modal} />
          <Stack.Screen name="log/voice" options={modal} />
          <Stack.Screen name="log/document" options={modal} />
          <Stack.Screen name="log/review" options={modal} />
          <Stack.Screen name="settings/medication" options={modal} />
          <Stack.Screen name="demo" options={modal} />
          <Stack.Screen name="block/[start]" options={modal} />
          <Stack.Screen name="confirm/[alertId]" options={modal} />
          <Stack.Screen name="end-of-day/[date]" options={modal} />
          <Stack.Screen name="team/invite" options={modal} />
          <Stack.Screen name="team/share" options={modal} />
        </Stack.Protected>
        {/* Child Device mode (SPEC 9.1): only a status screen, plus places and data sources below. */}
        <Stack.Protected guard={status === 'ready' && childDevice}>
          <Stack.Screen name="child-device" />
        </Stack.Protected>
        <Stack.Screen name="settings/place" options={modal} />
      </Stack>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <AppGuard>{body}</AppGuard>
          <ToastHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Global error boundary (SPEC 29): "Something went wrong", "Try again", "Copy details". */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <FatalScreen kind="crash" error={props.error} retry={props.retry} />;
}
