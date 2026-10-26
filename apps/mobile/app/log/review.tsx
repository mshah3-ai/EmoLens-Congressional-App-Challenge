/**
 * Review screen for voice notes and document import (SPEC 20.1 step 7, MUST): each proposed entry is an editable
 * card with a checkbox. Nothing is saved until "Save selected"; then only the ticked cards are saved, the note is
 * marked accepted (or rejected when nothing was kept), and the forecast is refreshed. A strategy tried during a hard
 * moment has its own card, saved with that hard moment (it can't be ticked while the hard moment isn't).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { fmtTime } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { useReview } from '../../src/store/review';
import { canSave, saveProposals, type Proposal } from '../../src/voice/review';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Field, Input } from '../../src/ui/Field';
import { Scale } from '../../src/ui/Scale';
import { Segmented } from '../../src/ui/Segmented';
import { TimeField } from '../../src/ui/TimeField';
import { goBack, Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

function Tick({ checked, disabled, onPress, label, testID }: { checked: boolean; disabled?: boolean; onPress: () => void; label: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={label} disabled={disabled} onPress={onPress}
      hitSlop={10} style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
        borderColor: disabled ? c.border : c.primary, backgroundColor: checked && !disabled ? c.primary : 'transparent' }}>
      {checked && !disabled ? <Check size={18} color={c.onPrimary} /> : null}
    </Pressable>
  );
}

export default function Review() {
  const { t } = useTranslation();
  const { repo, profile, tz } = useReady();
  const draft = useReview((s) => s.draft);
  const setDraft = useReview((s) => s.set);
  const [items, setItems] = useState<Proposal[]>(draft?.proposals ?? []);
  const [saving, setSaving] = useState(false);
  if (!draft) return <Sheet title={t('review.title')}><T variant="callout" color="muted">{t('ai.err.failed')}</T></Sheet>;

  const update = (key: string, patch: Partial<Proposal>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } as Proposal : x)));

  const save = async () => {
    setSaving(true);
    try {
      const n = await saveProposals(repo, profile, items, draft.noteId, draft.source);
      setDraft(null);
      afterSave(n > 0 ? t('review.saved', { count: n }) : t('review.savedNote'));
      goBack();
    } finally { setSaving(false); }
  };

  const header = draft.via === 'ai' ? t('review.viaAi') : draft.aiError ? t('review.aiFallback') : t('review.viaRules');
  return (
    <Sheet title={t('review.title')} testID="review-sheet"
      footer={<Button testID="review-save" label={items.length ? t('review.saveSelected') : t('common.done')} loading={saving} onPress={() => void save()} />}>
      <T variant="callout">{t('review.intro')}</T>
      <T variant="footnote" color="muted">{header}</T>
      {items.length === 0 ? <Card><T variant="callout" color="muted">{t('review.nothing')}</T></Card> : null}
      {items.map((p) => (
        <Card key={p.key} testID={`review-card-${p.key}`} style={{ gap: space.md, opacity: p.checked && canSave(p, items) ? 1 : 0.6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Tick testID={`review-check-${p.key}`} checked={p.checked} disabled={!canSave(p, items)} label={t('review.select')} onPress={() => update(p.key, { checked: !p.checked })} />
            <T variant="headline" style={{ flex: 1 }}>{t(`review.${p.kind}`)}</T>
          </View>
          <ProposalFields p={p} all={items} tz={tz} update={(patch) => update(p.key, patch)} />
        </Card>
      ))}
    </Sheet>
  );
}

function ProposalFields({ p, all, tz, update }: { p: Proposal; all: Proposal[]; tz: string; update: (patch: Partial<Proposal>) => void }) {
  const { t } = useTranslation();
  switch (p.kind) {
    case 'strategy':
      if (p.strategyId == null) return <T variant="callout" color="muted">{t('review.unknownStrategy', { name: p.name })}</T>;
      return (
        <>
          <T variant="callout">{p.name}</T>
          <Segmented testIDPrefix={`review-outcome-${p.key}`} options={(['helped', 'not_helped', 'unsure'] as const).map((v) => ({ value: v, label: t(`episode.outcome.${v}`) }))}
            value={p.outcome} onChange={(outcome) => update({ outcome })} />
          <T variant="footnote" color="muted">{all.find((x) => x.key === p.episodeKey)?.checked ? t('review.withEpisode') : t('review.needsEpisode')}</T>
        </>
      );
    case 'episode':
      return (
        <>
          <Segmented options={(['meltdown', 'shutdown', 'other'] as const).map((v) => ({ value: v, label: t(`episode.types.${v}`) }))} value={p.type} onChange={(type) => update({ type })} />
          <Field label={t('review.when')}><TimeField label={t('review.when')} value={p.at} onChange={(at) => update({ at })} tz={tz} /></Field>
          <Scale label={t('review.intensity')} labels={[1, 2, 3, 4, 5].map((i) => t(`episode.intensity.${i}`))} value={p.intensity} onChange={(intensity) => update({ intensity })} />
          <Input label={t('review.duration')} keyboardType="number-pad" value={p.durationMin == null ? '' : String(p.durationMin)}
            onChangeText={(s) => update({ durationMin: s.trim() && Number.isFinite(Number(s)) ? Math.max(0, Math.round(Number(s))) : null })} />
          {p.placeLabel ? <T variant="footnote" color="muted">{p.placeLabel}</T> : null}
          {p.note ? <T variant="footnote" color="muted">{p.note}</T> : null}
        </>
      );
    case 'dose':
      return p.medicationId == null ? <T variant="callout" color="muted">{t('review.unknownMed', { name: p.name })}</T> : (
        <>
          <T variant="callout">{p.name}</T>
          <Segmented options={(['taken', 'missed', 'skipped'] as const).map((v) => ({ value: v, label: t(`review.${v}`) }))} value={p.status} onChange={(status) => update({ status })} />
          {p.status === 'taken' ? <Field label={t('review.when')}><TimeField label={t('review.when')} value={p.at} onChange={(at) => update({ at })} tz={tz} /></Field> : null}
        </>
      );
    case 'meal':
      return (
        <>
          <Segmented options={(['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const).map((v) => ({ value: v, label: t(`meal.types.${v}`) }))} value={p.mealType} onChange={(mealType) => update({ mealType })} />
          <Input label={t('review.items')} value={p.items.join(', ')} onChangeText={(s) => update({ items: s.split(',').map((x) => x.trim()) })} />
          <Field label={t('review.when')}><TimeField label={t('review.when')} value={p.at} onChange={(at) => update({ at })} tz={tz} /></Field>
        </>
      );
    case 'sleep':
      return <T variant="callout">{t('review.sleepTimes', { bed: fmtTime(p.start, tz), wake: fmtTime(p.end, tz) })}</T>;
    case 'illness':
      return <T variant="callout">{t(`illness.kinds.${p.illness}`)}</T>;
    case 'routine':
      return <Input label={t('review.description')} value={p.description} onChangeText={(description) => update({ description })} />;
  }
}
