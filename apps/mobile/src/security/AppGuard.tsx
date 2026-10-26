/**
 * Privacy protections (SPEC 27.2):
 *  - Privacy cover: when the app goes to the background, a plain EmoLens screen hides content in the app switcher.
 *  - App lock (optional): Face ID / Touch ID / passcode on open and after 5 minutes in the background.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { T } from '../ui/Text';
import { space, useTheme } from '../ui/theme';
import { LensMark } from '../ui/LensMark';

const AUTO_LOCK_MS = 5 * 60_000;

export async function authenticate(prompt: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
  return r.success;
}

export function AppGuard({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  const appLock = useSession((s) => s.settings.app_lock && s.status === 'ready');
  const [covered, setCovered] = useState(false);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  // Lock when the app finishes opening (not when the user switches the setting on).
  useEffect(() => {
    if (status === 'ready' && useSession.getState().settings.app_lock) setLocked(true);
  }, [status]);
  useEffect(() => { if (!appLock) setLocked(false); }, [appLock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCovered(false);
        if (appLock && backgroundedAt.current != null && Date.now() - backgroundedAt.current > AUTO_LOCK_MS) setLocked(true);
        backgroundedAt.current = null;
      } else {
        setCovered(true);
        if (state === 'background' && backgroundedAt.current == null) backgroundedAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [appLock]);

  const unlock = async () => { if (await authenticate(t('lock.prompt'))) setLocked(false); };
  // Ask right away when the lock appears.
  useEffect(() => { if (locked) void unlock(); }, [locked]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.bg }]}>
          <View style={[styles.lockIcon, { backgroundColor: c.primarySoft }]}><Lock size={36} color={c.primary} /></View>
          <T variant="title" center>{t('lock.title')}</T>
          <T variant="callout" color="muted" center>{t('lock.body')}</T>
          <Button label={t('lock.unlock')} onPress={unlock} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : null}
      {covered && !locked ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.bg }]} accessibilityElementsHidden>
          <LensMark size={88} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  lockIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
});
