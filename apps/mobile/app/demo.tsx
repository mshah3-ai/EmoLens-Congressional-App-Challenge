/**
 * Demo mode (SPEC 9.10): a separate, clearly bannered profile in its own database file (emolens-demo.db).
 * Entering or leaving never touches the real profile. The first time, the demo is filled with about 120 simulated days
 * (src/demo/build.ts); after that it opens instantly. "Regenerate demo data" simulates again so the data ends today.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlaskConical, RefreshCw } from 'lucide-react-native';
import { confirmRegenerate } from '../src/features/today/DemoTools';
import { fmtShortDate } from '../src/i18n/format';
import { useSession } from '../src/store/session';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { IconCircle } from '../src/ui/bits';
import { Sheet } from '../src/ui/layout';
import { T } from '../src/ui/Text';
import { space, useTheme } from '../src/ui/theme';

export default function Demo() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const isDemo = useSession((s) => s.isDemo);
  const setDemo = useSession((s) => s.setDemo);
  const regenerate = useSession((s) => s.regenerateDemo);
  const info = useSession((s) => s.settings.demo_info);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    router.back();
    await setDemo(!isDemo);
  };
  return (
    <Sheet title={isDemo ? t('demo.exitTitle') : t('demo.title')} footer={
      <Button testID="demo-toggle" label={isDemo ? t('demo.exit') : t('demo.enter')} loading={busy} onPress={() => void toggle()} />
    }>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={FlaskConical} color={accent.routine} />
          <T variant="headline" style={{ flex: 1 }}>{t('demo.banner')}</T>
        </View>
        <T variant="body">{isDemo ? t('demo.exitBody') : t('demo.body1')}</T>
        {!isDemo ? <T variant="callout" color="muted">{t('demo.body2')}</T> : null}
        {isDemo && info ? <T variant="callout" color="muted">{t('demo.info', { count: info.days, date: fmtShortDate(info.lastDate) })}</T> : null}
        {isDemo && info?.buildMs ? <T variant="footnote" color="muted" testID="demo-build-time">{t('demo.buildTime', { s: Math.round(info.buildMs / 1000) })}</T> : null}
      </Card>
      {isDemo ? (
        <Button testID="demo-regenerate" variant="secondary" icon={RefreshCw} label={t('demo.regenerate')}
          onPress={() => confirmRegenerate(t, () => { router.back(); void regenerate(); })} />
      ) : null}
    </Sheet>
  );
}
