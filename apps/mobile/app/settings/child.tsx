/** More → Child profile: edit the onboarding step 4-6 answers plus school days. */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { EpisodeType } from '@emolens/shared';
import { updateChild } from '../../src/db/repo/children';
import { ChildFields, validTimeZone } from '../../src/features/ChildFields';
import { WEEKDAYS } from '../../src/features/MedicationForm';
import { afterSave } from '../../src/lib/save';
import { toggle, FREQUENCY_OPTIONS } from '../../src/store/onboarding';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/layout';
import { space } from '../../src/ui/theme';

export default function ChildSettings() {
  const { t } = useTranslation();
  const { repo, child, profile } = useReady();
  const reload = useSession((s) => s.reload);
  const [draft, setDraft] = useState({
    nickname: child.nickname, birthYear: child.birth_year, homeTz: child.home_tz, communication: child.communication,
    wakeStart: child.wake_start, wakeEnd: child.wake_end, typicalSleepHours: child.typical_sleep_hours ?? 10,
  });
  const [types, setTypes] = useState<EpisodeType[]>(profile.modeledEpisodeTypes);
  const [schoolDays, setSchoolDays] = useState<number[]>(profile.schoolDays);
  const [perWeek, setPerWeek] = useState(child.episodes_per_week_estimate);
  const valid = draft.nickname.trim().length > 0 && types.length > 0 && validTimeZone(draft.homeTz);
  const save = async () => {
    const changed = <K,>(a: K, b: K) => (JSON.stringify(a) === JSON.stringify(b) ? undefined : a);
    await updateChild(repo, child.id, {
      ...draft,
      episodesPerWeekEstimate: perWeek,
      modeledEpisodeTypes: changed(types, profile.modeledEpisodeTypes),
      schoolDays: changed(schoolDays, profile.schoolDays),
      wakeStart: changed(draft.wakeStart, child.wake_start),
      wakeEnd: changed(draft.wakeEnd, child.wake_end),
    });
    await reload();
    afterSave(t('common.saved'));
    router.back();
  };
  return (
    <Screen back title={t('more.childProfile')}>
      <ChildFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      <Field label={t('settings.howOften')}>
        <View style={{ gap: space.sm }}>
          {FREQUENCY_OPTIONS.map((o) => <Chip key={o.key} label={t(`frequency.${o.key}`)} selected={perWeek === o.perWeek} onPress={() => setPerWeek(o.perWeek)} />)}
        </View>
      </Field>
      <Field label={t('settings.trackedTypes')}>
        <ChipGroup>
          {(['meltdown', 'shutdown', 'other'] as EpisodeType[]).map((k) => (
            <Chip key={k} label={t(`episode.types.${k}`)} selected={types.includes(k)} onPress={() => setTypes(toggle(types, k))} />
          ))}
        </ChipGroup>
      </Field>
      <Field label={t('settings.schoolDays')} hint={t('settings.schoolDaysHint')}>
        <ChipGroup>
          {WEEKDAYS.map((d) => <Chip key={d} label={t(`weekdays.short.${d}`)} selected={schoolDays.includes(d)} onPress={() => setSchoolDays(toggle(schoolDays, d).sort())} />)}
        </ChipGroup>
      </Field>
      <Button label={t('common.save')} onPress={() => void save()} disabled={!valid} />
    </Screen>
  );
}
