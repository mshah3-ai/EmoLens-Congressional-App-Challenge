/**
 * Add / edit a medication (SPEC 10.3): name, strength, form, schedule times (0-6 a day) and days, as-needed,
 * reminders, start date, notes. Used in onboarding step 9 and in More → Medications.
 * The name field suggests RxNorm names as you type; offline, any typed name works (the spec's custom-name fallback).
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { MedicationInput } from '../db/repo/meds';
import { Chip, ChipGroup } from '../ui/Chip';
import { Field, Input } from '../ui/Field';
import { ClockField } from '../ui/TimeField';
import { ListRow, ToggleRow, RowGroup } from '../ui/bits';
import { searchMedications, type RxCandidate } from '../integrations/rxnorm';
import { Button } from '../ui/Button';
import { T } from '../ui/Text';
import { space, useTheme } from '../ui/theme';
import { toggle } from '../store/onboarding';

export const MED_FORMS = ['tablet', 'capsule', 'liquid', 'chewable', 'patch', 'other'] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function emptyMedication(today: string): MedicationInput {
  return { name: '', strength: '', form: null, schedule: { times: ['08:00'], days: [...WEEKDAYS] }, asNeeded: false, remindersEnabled: true, activeFrom: today, notes: null };
}

export function MedicationForm({ value, onChange }: { value: MedicationInput; onChange: (m: MedicationInput) => void }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const set = (patch: Partial<MedicationInput>) => onChange({ ...value, ...patch });
  // RxNorm name search, 300 ms after typing stops (SPEC 10.3). Picking a result stores its RxNorm id (rxcui).
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RxCandidate[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  useEffect(() => {
    setSearchFailed(false);
    if (query.trim().length < 3) { setSuggestions([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      searchMedications(query).then((r) => { if (alive) setSuggestions(r.slice(0, 6)); }, () => { if (alive) { setSuggestions([]); setSearchFailed(true); } });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);
  const times = value.schedule.times;
  const setTimes = (next: string[]) => set({ schedule: { ...value.schedule, times: next } });
  return (
    <View style={{ gap: space.xl }}>
      <Field label={t('meds.name')} hint={t('meds.nameHint')}>
        <View style={{ gap: space.sm }}>
          <Input testID="med-name" label={t('meds.name')} value={value.name} onChangeText={(name) => { set({ name, rxcui: null }); setQuery(name); }}
            placeholder={t('meds.namePlaceholder')} autoCapitalize="words" />
          {suggestions.length ? (
            <RowGroup>
              {suggestions.map((sug) => (
                <ListRow key={sug.rxcui} title={sug.name} onPress={() => { set({ name: sug.name, rxcui: sug.rxcui }); setQuery(''); setSuggestions([]); }} />
              ))}
            </RowGroup>
          ) : null}
          {value.rxcui ? <T variant="footnote" color="muted">{t('meds.fromRxNorm')}</T> : searchFailed ? <T variant="footnote" color="muted">{t('meds.searchOffline')}</T> : null}
        </View>
      </Field>
      <Field label={t('meds.strength')} optional={t('common.optional')}>
        <Input label={t('meds.strength')} value={value.strength ?? ''} onChangeText={(strength) => set({ strength })} placeholder={t('meds.strengthPlaceholder')} />
      </Field>
      <Field label={t('meds.form')} optional={t('common.optional')}>
        <ChipGroup>
          {MED_FORMS.map((f) => <Chip key={f} label={t(`meds.forms.${f}`)} selected={value.form === f} onPress={() => set({ form: value.form === f ? null : f })} />)}
        </ChipGroup>
      </Field>
      <RowGroup>
        <ToggleRow title={t('meds.asNeeded')} subtitle={t('meds.asNeededHint')} value={value.asNeeded} onChange={(asNeeded) => set({ asNeeded })} />
      </RowGroup>
      {!value.asNeeded ? (
        <>
          <Field label={t('meds.times')} hint={t('meds.timesHint')}>
            <View style={{ gap: space.sm }}>
              {times.map((time, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <ClockField label={t('meds.timeN', { n: i + 1 })} value={time} onChange={(v) => setTimes(times.map((x, j) => (j === i ? v : x)))} />
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('meds.removeTime', { n: i + 1 })} onPress={() => setTimes(times.filter((_, j) => j !== i))}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} color={c.textMuted} />
                  </Pressable>
                </View>
              ))}
              {times.length < 6 ? <Button small variant="secondary" icon={Plus} label={t('meds.addTime')} onPress={() => setTimes([...times, '20:00'])} /> : null}
            </View>
          </Field>
          <Field label={t('meds.days')}>
            <ChipGroup>
              {WEEKDAYS.map((d) => (
                <Chip key={d} label={t(`weekdays.short.${d}`)} selected={value.schedule.days.includes(d)}
                  onPress={() => set({ schedule: { ...value.schedule, days: toggle(value.schedule.days, d).sort() } })} />
              ))}
            </ChipGroup>
          </Field>
          <RowGroup>
            <ToggleRow title={t('meds.reminders')} subtitle={t('meds.remindersHint')} value={value.remindersEnabled} onChange={(remindersEnabled) => set({ remindersEnabled })} />
          </RowGroup>
        </>
      ) : null}
      <Field label={t('common.notes')} optional={t('common.optional')}>
        <Input label={t('common.notes')} value={value.notes ?? ''} onChangeText={(notes) => set({ notes: notes || null })} multiline />
      </Field>
      <T variant="footnote" color="muted">{t('meds.prescriberNote')}</T>
    </View>
  );
}

export const medicationValid = (m: MedicationInput) => m.name.trim().length > 0 && (m.asNeeded || m.schedule.days.length > 0);
