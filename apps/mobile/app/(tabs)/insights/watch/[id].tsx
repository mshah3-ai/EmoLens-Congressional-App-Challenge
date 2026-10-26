/**
 * "Worth watching" item (SPEC 14.5): a specific food, medicine, place or kind of calendar event after which hard moments
 * were more common, with the rate ratio from the engine's Beta-binomial comparison. Foods are never called "triggers";
 * the screen always says patterns aren't proof.
 */
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from '../../../../src/forecast/useForecast';
import { Card } from '../../../../src/ui/Card';
import { Pill } from '../../../../src/ui/bits';
import { Screen } from '../../../../src/ui/layout';
import { T } from '../../../../src/ui/Text';
import { space } from '../../../../src/ui/theme';
import { watchItemName } from '@emolens/reports';

export default function WatchDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snap } = useSnapshot();
  const item = snap?.worthWatching.find((w) => w.id === decodeURIComponent(id ?? ''));
  if (!item) return <Screen back title={t('insights.worth')}><T variant="body">{t('watch.missing')}</T></Screen>;
  const name = watchItemName(item, t);
  return (
    <Screen back title={name}>
      <Pill label={t(`watch.kind.${item.kind}`)} />
      <Card style={{ gap: space.md }}>
        <T variant="body" weight="600">{t(`watch.${item.kind}`, { item: name, n: item.median.toFixed(1), count: item.nExposed })}</T>
        <T variant="callout" color="muted">{t('watch.range', { lo: item.lo80.toFixed(1), hi: item.hi80.toFixed(1), pct: `${Math.round(item.pAbove * 100)}%` })}</T>
      </Card>
      <Card tone="soft"><T variant="callout">{t('watch.note')}</T></Card>
    </Screen>
  );
}
