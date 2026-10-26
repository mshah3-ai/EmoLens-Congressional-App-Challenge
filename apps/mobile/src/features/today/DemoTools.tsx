/** The "Demo tools" card on Today, shown only in demo mode (see src/demo/tools.ts). */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BellRing, FlaskConical, MessageCircleQuestion, RefreshCw } from 'lucide-react-native';
import { localDateOf } from '@emolens/engine';
import { askAboutPastBlock, sendSampleHeadsUp } from '../../demo/tools';
import type { ForecastSnapshot } from '../../forecast/snapshot';
import { fmtShortDate } from '../../i18n/format';
import { useReady, useSession } from '../../store/session';
import { toast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { IconCircle } from '../../ui/bits';
import { T } from '../../ui/Text';
import { space, useTheme } from '../../ui/theme';

export function confirmRegenerate(t: (k: string) => string, run: () => void) {
  Alert.alert(t('demo.regenerate'), t('demo.regenerateConfirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('demo.regenerate'), style: 'destructive', onPress: run },
  ]);
}

export function DemoTools({ snap }: { snap: ForecastSnapshot | null }) {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile, settings, bump, tz } = useReady();
  const regenerate = useSession((s) => s.regenerateDemo);
  const [busy, setBusy] = useState(false);
  const info = settings.demo_info;
  const stale = info != null && info.lastDate < localDateOf(Date.now() - 86_400_000, tz);
  return (
    <Card testID="demo-tools" style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconCircle icon={FlaskConical} color={accent.routine} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{t('demo.toolsTitle')}</T>
          <T variant="footnote" color="muted">{t('demo.toolsBody')}</T>
        </View>
      </View>
      {info ? <T variant="callout" color={stale ? 'text' : 'muted'}>{stale ? t('demo.stale', { date: fmtShortDate(info.lastDate) }) : t('demo.info', { count: info.days, date: fmtShortDate(info.lastDate) })}</T> : null}
      <Button small variant="secondary" icon={BellRing} label={t('demo.sendAlert')} loading={busy} testID="demo-send-alert" onPress={async () => {
        setBusy(true);
        try {
          const r = await sendSampleHeadsUp(repo, profile, snap);
          toast(r.notified ? t('demo.sendAlertDone') : t('demo.sendAlertNoNotif'));
          bump();
        } finally { setBusy(false); }
      }} />
      <Button small variant="secondary" icon={MessageCircleQuestion} label={t('demo.askPast')} testID="demo-ask-past" onPress={async () => {
        const ok = await askAboutPastBlock(repo, profile);
        toast(ok ? t('demo.askPastDone') : t('demo.askPastNone'));
        bump();
      }} />
      <Button small variant="ghost" icon={RefreshCw} label={t('demo.regenerate')} onPress={() => confirmRegenerate(t, () => { void regenerate(); })} />
    </Card>
  );
}
