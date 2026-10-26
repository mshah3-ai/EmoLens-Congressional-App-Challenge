/**
 * More → Weekly digests (SPEC 9.9, 21): every past digest (newest first) and when a new one is made
 * (`digest_day_time`, default Sunday 18:00). Changing the day or time makes the next digest follow the new schedule;
 * existing digests stay as they are.
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react-native';
import { listDigests } from '../../src/digest/generate';
import { fmtClock } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { shortDateIn } from '@emolens/reports';
import { useReady, useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { EmptyState, ListRow, RowGroup, Section } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { Segmented } from '../../src/ui/Segmented';
import { ClockField } from '../../src/ui/TimeField';
import { space, useTheme } from '../../src/ui/theme';
import { T } from '../../src/ui/Text';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export default function Digests() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile } = useReady();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const lang = settings.language;
  const when = settings.digest_day_time;
  const { data: digests, loading } = useDbQuery(() => listDigests(repo.db, profile.id), [profile.id], []);

  return (
    <Screen back title={t('more.digests')} subtitle={t('digest.listSub', { name: profile.nickname })}>
      {digests.length ? (
        <RowGroup>
          {digests.map((d) => (
            <ListRow key={d.id} testID={`digest-row-${d.weekStart}`} icon={CalendarClock} iconColor={accent.routine}
              title={`${shortDateIn(lang, d.stats.weekStart)} – ${shortDateIn(lang, d.stats.weekEnd)}`}
              subtitle={t('digest.rowSub', { count: d.stats.episodes.total })}
              onPress={() => router.push(`/digest/${d.weekStart}` as never)} />
          ))}
        </RowGroup>
      ) : loading ? null : (
        <EmptyState icon={CalendarClock} title={t('digest.empty')}
          body={t('digest.emptyBody', { day: t(`weekdays.short.${when.weekday}`), time: fmtClock(when.time) })} />
      )}
      <Section title={t('digest.when')}>
        <Card style={{ gap: space.md }}>
          <T variant="callout" color="muted">{t('digest.whenHint')}</T>
          <Segmented<number> testIDPrefix="digest-day" value={when.weekday}
            options={WEEKDAYS.map((d) => ({ value: d, label: t(`weekdays.short.${d}`) }))}
            onChange={(weekday) => void update({ digest_day_time: { ...when, weekday } })} />
          <ClockField testID="digest-time" label={t('digest.time')} value={when.time}
            onChange={(time) => void update({ digest_day_time: { ...when, time } })} />
        </Card>
      </Section>
    </Screen>
  );
}
