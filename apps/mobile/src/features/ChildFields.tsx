/** Child profile fields, shared by onboarding step 4 and More → Child profile. */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { OnboardingDraft } from '../db/repo/onboarding';
import { Chip, ChipGroup } from '../ui/Chip';
import { Field, Input } from '../ui/Field';
import { ClockField } from '../ui/TimeField';
import { Stepper } from '../ui/bits';
import { T } from '../ui/Text';
import { space } from '../ui/theme';

type ChildDraft = OnboardingDraft['child'];
export const COMMUNICATION = ['speaking', 'some_words', 'minimally_speaking', 'aac', 'prefer_not'] as const;

export function ChildFields({ value, onChange }: { value: ChildDraft; onChange: (patch: Partial<ChildDraft>) => void }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const minYear = year - 25;
  // What the parent has typed so far, kept separately from the saved year: "2", "20", "201" are not years yet, but must
  // stay on screen while typing (bug #2 in docs/BUGS.md). Only a complete year in range is saved.
  const [yearText, setYearText] = useState(value.birthYear ? String(value.birthYear) : '');
  const typedYear = Number(yearText);
  const yearOutOfRange = yearText.length === 4 && (typedYear < minYear || typedYear > year);
  const onYearText = (s: string) => {
    const digits = s.replace(/\D/g, '').slice(0, 4);
    setYearText(digits);
    const n = Number(digits);
    onChange({ birthYear: digits.length === 4 && n >= minYear && n <= year ? n : null });
  };
  return (
    <View style={{ gap: space.xl }}>
      <Field label={t('child.nickname')} hint={t('child.nicknameHint')}>
        <Input testID="child-nickname" label={t('child.nickname')} value={value.nickname} onChangeText={(nickname) => onChange({ nickname })}
          placeholder={t('child.nicknamePlaceholder')} autoCapitalize="words" maxLength={30} />
      </Field>
      <Field label={t('child.birthYear')} optional={t('common.optional')} hint={t('child.birthYearHint')}>
        <Input testID="child-birth-year" label={t('child.birthYear')} value={yearText} keyboardType="number-pad" maxLength={4}
          placeholder={String(year - 8)} onChangeText={onYearText} />
        {yearOutOfRange ? <T variant="footnote" color="danger" accessibilityLiveRegion="polite">{t('child.birthYearRange', { min: minYear, max: year })}</T> : null}
      </Field>
      <Field label={t('child.communication')} optional={t('common.optional')}>
        <ChipGroup>
          {COMMUNICATION.map((k) => (
            <Chip key={k} label={t(`child.comm.${k}`)} selected={value.communication === k} onPress={() => onChange({ communication: value.communication === k ? null : k })} />
          ))}
        </ChipGroup>
      </Field>
      <Field label={t('child.wakeTime')}>
        <ClockField label={t('child.wakeTime')} value={value.wakeStart} onChange={(wakeStart) => onChange({ wakeStart })} />
      </Field>
      <Field label={t('child.bedtime')} hint={t('child.wakeHint')}>
        <ClockField label={t('child.bedtime')} value={value.wakeEnd} onChange={(wakeEnd) => onChange({ wakeEnd })} />
      </Field>
      <Field label={t('child.sleepHours')} hint={t('child.sleepHoursHint')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
          <Stepper label={t('child.sleepHours')} value={value.typicalSleepHours} min={6} max={13} onChange={(typicalSleepHours) => onChange({ typicalSleepHours })} />
          <T variant="callout" color="muted">{t('child.hours')}</T>
        </View>
      </Field>
      <Field label={t('child.timeZone')} hint={t('child.timeZoneHint')}>
        <Input label={t('child.timeZone')} value={value.homeTz} onChangeText={(homeTz) => onChange({ homeTz: homeTz.trim() })} autoCapitalize="none" autoCorrect={false} />
      </Field>
    </View>
  );
}

/** True if the IANA time zone name is known to this phone. */
export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
