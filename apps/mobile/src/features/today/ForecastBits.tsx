/**
 * Pieces of a forecast shown on Today's Now card and in the block sheet (SPEC 9.2):
 *  - the chance ("18% chance"), its 80% range ("likely between 11% and 27%") and "about 2x usual for this time";
 *  - the top reasons (engine-written text; "expected" when an input is estimated) and one calm-side reason;
 *  - "Ideas that have helped" with "We're trying this" (a proactive strategy use, SPEC 10.2).
 */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { HandHeart, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react-native';
import { LEARNING_REASON } from '@emolens/shared';
import type { SnapForecast, SnapReason } from '../../forecast/snapshot';
import type { Idea } from '../../forecast/useForecast';
import { logProactiveUse } from '../../db/repo/strategies';
import { nowIso } from '../../db/time';
import { currentLang } from '../../i18n';
import { afterSave } from '../../lib/save';
import { useReady } from '../../store/session';
import { Button } from '../../ui/Button';
import { T } from '../../ui/Text';
import { space, tint, useTheme } from '../../ui/theme';

/** "18%", "<1%". */
export const pct = (p: number) => (p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

export function ChanceHeadline({ f, name }: { f: SnapForecast; name: string }) {
  const { t } = useTranslation();
  const usual = f.timesUsual >= 1.3 ? Math.round(f.timesUsual * 10) / 10 : null;
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={[t('forecast.chance', { pct: pct(f.p) }), t('forecast.range', { lo: pct(f.pLo), hi: pct(f.pHi) }),
      usual ? t('forecast.timesUsual', { n: usual, name }) : ''].filter(Boolean).join(', ')}>
      <T variant="display" style={{ fontSize: 40, lineHeight: 46 }}>{t('forecast.chance', { pct: pct(f.p) })}</T>
      <T variant="callout" color="muted">{t('forecast.range', { lo: pct(f.pLo), hi: pct(f.pHi) })}</T>
      {usual ? <T variant="callout" weight="600">{t('forecast.timesUsual', { n: usual, name })}</T> : null}
    </View>
  );
}

function ReasonRow({ r, calm }: { r: SnapReason; calm?: boolean }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const color = calm ? c.riskLow : c.primary;
  const Icon = calm ? ShieldCheck : TrendingUp;
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tint(color, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={color} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 3 }}>
        {/* The engine already appends " (expected)" to texts that have an {est} slot; others get a small tag. */}
        <T variant="body">{r.text}</T>
        {r.estimated && !/\((expected|estimado)\)/.test(r.text) ? (
          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 6 }}>
            <T variant="footnote" color="muted">{t('forecast.expected')}</T>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function Reasons({ f }: { f: SnapForecast }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  if (!f.reasons.length && !f.protective) {
    return (
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Sparkles size={18} color={c.learning} />
        <T variant="callout" color="muted" style={{ flex: 1 }}>{LEARNING_REASON[currentLang()]}</T>
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {f.reasons.length ? <T variant="headline">{t('forecast.reasonsTitle')}</T> : null}
      {f.reasons.map((r) => <ReasonRow key={r.key} r={r} />)}
      {f.protective ? (
        <>
          <T variant="footnote" color="muted" weight="600">{t('forecast.protectiveTitle')}</T>
          <ReasonRow r={f.protective} calm />
        </>
      ) : null}
    </View>
  );
}

/** "Ideas that have helped" with their evidence ("Helped 6 of 7 times" / "You said this helps" / "Something new to try"). */
export function IdeasList({ ideas, alertId }: { ideas: Idea[]; alertId?: string | null }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, profile } = useReady();
  const tryIt = async (i: Idea) => {
    await logProactiveUse(repo, profile.id, i.row.id, nowIso(), alertId ?? null);
    afterSave(t('today.tryingSaved', { name: i.row.name }));
  };
  if (!ideas.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <T variant="headline">{t('today.ideasTitle')}</T>
      {ideas.map((i) => {
        const st = i.suggestion.stat;
        const sub = i.suggestion.kind === 'proven' && st ? t('forecast.helpedCount', { s: st.successes, count: st.uses })
          : i.suggestion.kind === 'favorite' ? t('today.youSaidHelps') : t('forecast.somethingNew');
        return (
          <View key={i.row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
            <HandHeart size={20} color={c.primary} />
            <View style={{ flex: 1, minWidth: 140 }}>
              <T variant="body">{i.row.name}</T>
              <T variant="footnote" color="muted">{sub}</T>
            </View>
            <Button small variant="secondary" label={t('today.tryingThis')} onPress={() => void tryIt(i)} />
          </View>
        );
      })}
    </View>
  );
}
