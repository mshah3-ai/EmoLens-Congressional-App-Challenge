/**
 * One Timeline entry: time, icon, title and details. Tap to edit; swipe left (or use the screen-reader
 * "Delete" action) to delete (SPEC 9.3).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Trash } from 'lucide-react-native';
import { DELETABLE, type TimelineItem } from '../db/repo/timeline';
import { loudnessWord } from '../integrations/sound';
import { parseJson, type MealItemJson } from '../db/rows';
import { localMinuteOf } from '@emolens/engine';
import { blockRange, fmtTime } from '../i18n/format';
import { IconCircle } from '../ui/bits';
import { T } from '../ui/Text';
import { space, useTheme } from '../ui/theme';
import { KINDS } from './kinds';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function durationText(t: TFn, minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return t('common.minutes', { count: m });
  return m ? t('common.hoursMinutes', { h, m }) : t('common.hours', { count: h });
}

/** Title + detail line for each kind of entry. */
export function describeItem(item: TimelineItem, t: TFn, tz: string): { title: string; detail: string; flag?: boolean } {
  switch (item.kind) {
    case 'episode': {
      const e = item.row;
      const parts = [
        e.intensity ? t(`episode.intensity.${e.intensity}`) : null,
        e.duration_min ? durationText(t, e.duration_min) : null,
        e.place_type ? t(`places.types.${e.place_type}`) : null,
        !e.details_complete ? t('timeline.detailsToAdd') : null,
      ].filter(Boolean);
      return { title: t(`episode.types.${e.type}`), detail: parts.join(' · '), flag: !!e.safety_concern };
    }
    case 'strategy':
      return { title: t('timeline.tried', { name: item.row.strategy_name }), detail: t(`timeline.outcome.${item.row.outcome}`) };
    case 'dose':
      return { title: item.row.med_name, detail: [t(`timeline.dose.${item.row.status}`), item.row.dose_text].filter(Boolean).join(' · ') };
    case 'meal': {
      const items = parseJson<MealItemJson[]>(item.row.items, []).map((i) => i.name);
      return { title: t(`meal.types.${item.row.meal_type}`), detail: [items.join(', '), item.row.amount ? t(`meal.amounts.${item.row.amount}`) : null].filter(Boolean).join(' · ') };
    }
    case 'sleep': {
      const s = item.row;
      const parts = [`${fmtTime(s.sleep_start, tz)} – ${fmtTime(s.sleep_end, tz)}`, durationText(t, s.duration_min),
        s.night_wakings != null ? t('sleep.wakingsN', { count: s.night_wakings }) : null];
      return { title: t('timeline.sleep'), detail: parts.filter(Boolean).join(' · ') };
    }
    case 'visit':
      return { title: t('timeline.arrived', { place: item.row.place_label ?? t('places.away') }), detail: item.row.departed_at ? t('timeline.left', { time: fmtTime(item.row.departed_at, tz) }) : t('timeline.stillThere') };
    case 'illness':
      return { title: t(`illness.kinds.${item.row.kind}`), detail: [t(`illness.severity.${item.row.severity}`), item.row.ended_at ? null : t('illness.ongoing')].filter(Boolean).join(' · ') };
    case 'routine':
      return { title: t('routine.title'), detail: item.row.description ?? t(`routine.severity.${item.row.severity}`) };
    case 'note':
      return { title: t('timeline.note'), detail: item.row.text };
    case 'calendar': {
      const tags = parseJson<string[]>(item.row.tags, []).map((x) => t(`calendars.tags.${x}`));
      const when = item.row.all_day ? t('calendars.allDay') : `${fmtTime(item.row.start_at, tz)} – ${fmtTime(item.row.end_at, tz)}`;
      return { title: item.row.title || t('calendars.untitled'), detail: [when, ...tags].join(' · ') };
    }
    case 'alert': {
      const r = item.row.response;
      const answer = r === 'happened' ? t('confirm.happened') : r === 'stepped_in' ? t('confirm.steppedIn') : r === 'calm' ? t('confirm.calm') : null;
      const index = Math.floor(localMinuteOf(Date.parse(item.row.block_start), tz) / 120);
      return { title: t('timeline.alert', { range: blockRange(index) }), detail: answer ? t('timeline.alertAnswer', { answer }) : t('timeline.alertUnanswered') };
    }
    case 'sound':
      return { title: t('timeline.sound', { db: Math.round(item.row.level_db) }),
        detail: [t(`sound.words.${loudnessWord(item.row.level_db)}`), item.row.place_label].filter(Boolean).join(' · ') };
  }
}

export function editRoute(item: TimelineItem): { pathname: string; params: Record<string, string> } | null {
  if (item.kind === 'sound') return null;
  if (item.kind === 'alert') return { pathname: '/confirm/[alertId]', params: { alertId: item.id } };
  if (item.kind === 'calendar') return { pathname: '/settings/calendar-events', params: { id: item.id } };
  if (item.kind === 'dose') return { pathname: '/log/med', params: { doseId: item.id } };
  if (item.kind === 'visit') return { pathname: '/log/place', params: { visitId: item.id } };
  return { pathname: KINDS[item.kind].route, params: { id: item.id } };
}

export function TimelineRow({ item, tz, onDelete, showDate }: { item: TimelineItem; tz: string; onDelete: () => void; showDate?: string }) {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const info = KINDS[item.kind];
  const { title, detail, flag } = describeItem(item, t as TFn, tz);
  const time = item.at ? fmtTime(item.at, tz) : '';
  const renderRight = () => (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={onDelete} style={[styles.delete, { backgroundColor: c.danger }]}>
      <Trash size={22} color="#FFFFFF" />
      <T variant="footnote" color="#FFFFFF" weight="600">{t('common.delete')}</T>
    </Pressable>
  );
  const route = editRoute(item);
  const deletable = !!DELETABLE[item.kind];
  const row = (
    <Pressable
      accessibilityRole={route ? 'button' : 'text'}
      accessibilityLabel={`${time}, ${title}. ${detail}`}
      accessibilityHint={route ? t('timeline.editHint') : undefined}
      accessibilityActions={deletable ? [{ name: 'delete', label: t('common.delete') }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') onDelete(); }}
      disabled={!route}
      onPress={() => { if (route) router.push(route as never); }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface }]}>
      <View style={styles.time}>
        {showDate ? <T variant="footnote" color="muted">{showDate}</T> : null}
        <T variant="footnote" color="muted" weight="600">{time}</T>
      </View>
      <IconCircle icon={info.icon} color={accent[info.accent]} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T variant="headline" style={{ flexShrink: 1 }}>{title}</T>
          {flag ? <ShieldAlert size={16} color={c.danger} accessibilityLabel={t('episode.safetyFlag')} /> : null}
        </View>
        {detail ? <T variant="callout" color="muted" numberOfLines={3}>{detail}</T> : null}
      </View>
    </Pressable>
  );
  if (!deletable) return row;
  return (
    <ReanimatedSwipeable renderRightActions={renderRight} rightThreshold={60} friction={2} overshootRight={false}>
      {row}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  time: { width: 64, alignItems: 'flex-start' },
  delete: { width: 96, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
