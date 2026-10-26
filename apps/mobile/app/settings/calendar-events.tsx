/**
 * Review calendar events (SPEC 11.3): see how each was tagged, re-tag it, or ignore it. Hand changes are kept on the next
 * sync. Titles are shown here but stay on this phone. ?id=… opens one event directly (from the Timeline).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react-native';
import type { CalendarTag } from '@emolens/shared';
import { all } from '../../src/db/types';
import { parseJson } from '../../src/db/rows';
import { iso } from '../../src/db/time';
import { CALENDAR_TAGS } from '../../src/integrations/calendarRules';
import { setEventTags, type CalendarEventRow } from '../../src/integrations/calendarStore';
import { fmtDayTime } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { toggle } from '../../src/store/onboarding';
import { useReady } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { EmptyState, RowGroup, ToggleRow } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

const DAY = 86_400_000;

export default function CalendarEvents() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz, bump } = useReady();
  const [open, setOpen] = useState<string | null>(id ?? null);
  const { data: events } = useDbQuery<CalendarEventRow[]>(() => (id
    ? all<CalendarEventRow>(repo.db, 'SELECT * FROM calendar_events WHERE id = ?', [id])
    : all<CalendarEventRow>(repo.db, 'SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at', [iso(Date.now() - 7 * DAY), iso(Date.now() + 14 * DAY)])),
  [id], []);

  const save = async (e: CalendarEventRow, tags: CalendarTag[], ignored: boolean) => { await setEventTags(repo, profile.id, e.id, tags, ignored); bump(); };

  return (
    <Screen back title={t('calendars.eventsTitle')} subtitle={t('calendars.eventsSubtitle')}>
      {events.length ? events.map((e) => {
        const tags = parseJson<CalendarTag[]>(e.tags, []);
        const expanded = open === e.id;
        return (
          <Card key={e.id} style={{ gap: space.sm, opacity: e.ignored ? 0.6 : 1 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : e.id)} style={{ gap: 2 }}>
              <T variant="headline">{e.title || t('calendars.untitled')}</T>
              <T variant="footnote" color="muted">{e.all_day ? t('calendars.allDay') : fmtDayTime(e.start_at, tz)}</T>
              <T variant="footnote" color={e.ignored ? 'muted' : 'primary'}>
                {e.ignored ? t('calendars.ignored') : tags.length ? tags.map((x) => t(`calendars.tags.${x}`)).join(' · ') : t('calendars.noTags')}
                {e.user_tagged ? ` · ${t('calendars.byYou')}` : ''}
              </T>
            </Pressable>
            {expanded ? (
              <View style={{ gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
                <ChipGroup>
                  {CALENDAR_TAGS.map((x) => <Chip key={x} label={t(`calendars.tags.${x}`)} selected={tags.includes(x)} onPress={() => void save(e, toggle(tags, x), !!e.ignored)} />)}
                </ChipGroup>
                <RowGroup>
                  <ToggleRow title={t('calendars.ignore')} subtitle={t('calendars.ignoreHint')} value={!!e.ignored} onChange={(v) => void save(e, tags, v)} />
                </RowGroup>
              </View>
            ) : null}
          </Card>
        );
      }) : <Card><EmptyState icon={CalendarDays} title={t('calendars.noEvents')} body={t('calendars.noEventsBody')} /></Card>}
    </Screen>
  );
}
