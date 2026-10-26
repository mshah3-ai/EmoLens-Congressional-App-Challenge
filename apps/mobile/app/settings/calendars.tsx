/** Choose which calendars EmoLens reads, and add your own keywords for the automatic tags (SPEC 11.3). */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CalendarX, Plus, X } from 'lucide-react-native';
import type { CalendarTag } from '@emolens/shared';
import { calendarIntegration, loadCalendarChoices, type CalendarChoices } from '../../src/integrations/calendar';
import { openPhoneSettings } from '../../src/integrations/enable';
import { useOnAppActive } from '../../src/lib/useOnAppActive';
import { CALENDAR_TAGS } from '../../src/integrations/calendarRules';
import { refreshNow } from '../../src/integrations/appRefresh';
import { toggle } from '../../src/store/onboarding';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { EmptyState, Section } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function Calendars() {
  const { t } = useTranslation();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const [choices, setChoices] = useState<CalendarChoices | null>(null);
  const [tag, setTag] = useState<Exclude<CalendarTag, 'transition'>>('appointment');
  const [word, setWord] = useState('');

  // Load now, and again whenever the parent comes back from Settings (they may have just given access).
  const load = useCallback(() => { void loadCalendarChoices().then(setChoices); }, []);
  useEffect(load, [load]);
  useOnAppActive(load);
  const askAgain = async () => { await calendarIntegration.requestPermission().catch(() => false); load(); };

  const choose = async (id: string) => {
    await update({ calendar_ids: toggle(settings.calendar_ids, id) });
    void refreshNow({ only: ['calendar'] });
  };
  const custom = settings.calendar_keywords;
  const addWord = async () => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    await update({ calendar_keywords: { ...custom, [tag]: [...new Set([...(custom[tag] ?? []), w])] } });
    setWord('');
    void refreshNow({ only: ['calendar'] });
  };
  const removeWord = async (tg: string, w: string) => {
    await update({ calendar_keywords: { ...custom, [tg]: (custom[tg] ?? []).filter((x) => x !== w) } });
    void refreshNow({ only: ['calendar'] });
  };

  return (
    <Screen back title={t('calendars.title')} subtitle={t('calendars.subtitle')}>
      <Section title={t('calendars.which')}>
        {choices == null ? null : choices.kind === 'no_access' ? (
          <Card testID="calendars-no-access">
            <EmptyState icon={CalendarX} title={t('calendars.noAccessTitle')} body={t('calendars.noAccessBody')}
              action={
                <View style={{ gap: space.sm, alignSelf: 'stretch' }}>
                  {choices.canAskAgain ? <Button label={t('sources.allowAccess')} onPress={() => void askAgain()} /> : null}
                  <Button variant={choices.canAskAgain ? 'secondary' : 'primary'} label={t('sources.openSettings')} onPress={openPhoneSettings} />
                </View>
              } />
          </Card>
        ) : choices.kind === 'error' ? (
          <Card testID="calendars-error">
            <EmptyState icon={CalendarX} title={t('calendars.loadFailed')} body={t('calendars.loadFailedBody')}
              action={<Button small variant="secondary" label={t('errors.tryAgain')} onPress={load} />} />
          </Card>
        ) : choices.calendars.length ? (
          <ChipGroup>
            {choices.calendars.map((cal) => <Chip key={cal.id} testID={`calendar-${cal.id}`} label={cal.sourceName && cal.sourceName !== cal.title ? `${cal.title} · ${cal.sourceName}` : cal.title}
              selected={settings.calendar_ids.includes(cal.id)} onPress={() => void choose(cal.id)} />)}
          </ChipGroup>
        ) : <Card><EmptyState icon={CalendarDays} title={t('calendars.none')} /></Card>}
        <T variant="footnote" color="muted">{t('calendars.privacy')}</T>
      </Section>
      <Section title={t('calendars.keywords')}>
        <T variant="callout" color="muted">{t('calendars.keywordsBody')}</T>
        <Field label={t('calendars.tag')}>
          <ChipGroup>
            {CALENDAR_TAGS.filter((x): x is Exclude<CalendarTag, 'transition'> => x !== 'transition').map((x) => (
              <Chip key={x} label={t(`calendars.tags.${x}`)} selected={tag === x} onPress={() => setTag(x)} />
            ))}
          </ChipGroup>
        </Field>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Input label={t('calendars.addWord')} placeholder={t('calendars.addWordPlaceholder')} value={word} onChangeText={setWord} onSubmitEditing={() => void addWord()} autoCapitalize="none" /></View>
          <Button small variant="secondary" icon={Plus} label={t('common.add')} onPress={() => void addWord()} disabled={!word.trim()} />
        </View>
        {Object.entries(custom).flatMap(([tg, list]) => list.map((w) => (
          <View key={`${tg}-${w}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <T variant="callout" style={{ flex: 1 }}>{`${w} → ${t(`calendars.tags.${tg}`)}`}</T>
            <Button small variant="ghost" icon={X} label={t('common.remove')} onPress={() => void removeWord(tg, w)} />
          </View>
        )))}
      </Section>
    </Screen>
  );
}
