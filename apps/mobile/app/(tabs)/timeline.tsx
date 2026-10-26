/**
 * Timeline (SPEC 9.3): one day at a time (arrows, swipe on the date bar, or calendar), filter chips,
 * search across all days, tap to edit, swipe to delete with a 5-second Undo.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, ListTree, Search, X } from 'lucide-react-native';
import { addDays, localDateOf } from '@emolens/engine';
import { deleteItem, restoreItem, searchTimeline, timelineForDay, TIMELINE_KINDS, type TimelineItem, type TimelineKind } from '../../src/db/repo/timeline';
import { ms } from '../../src/db/time';
import { TimelineRow } from '../../src/features/TimelineRow';
import { dayBounds, dayLabel, fmtShortDate, todayIn } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady } from '../../src/store/session';
import { Chip } from '../../src/ui/Chip';
import { DemoBanner } from '../../src/ui/DemoBanner';
import { Fab } from '../../src/ui/Fab';
import { Input } from '../../src/ui/Field';
import { DateButton } from '../../src/ui/TimeField';
import { toast } from '../../src/ui/Toast';
import { EmptyState, IconCircle } from '../../src/ui/bits';
import { T } from '../../src/ui/Text';
import { radius, space, useTheme } from '../../src/ui/theme';

export default function Timeline() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, profile, tz, bump } = useReady();
  const today = todayIn(tz);
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<TimelineKind | 'all'>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [start, end] = dayBounds(date, tz);

  const { data: items, loading } = useDbQuery<TimelineItem[]>(
    () => (searching && query.trim().length >= 2 ? searchTimeline(repo.db, profile.id, query) : timelineForDay(repo.db, profile.id, start, end, date)),
    [date, searching, query, profile.id], []);

  const shown = useMemo(() => items.filter((i) => filter === 'all' || i.kind === filter), [items, filter]);
  const go = (n: number) => setDate((d) => { const next = addDays(d, n); return next > today ? d : next; });

  // Swipe left for the next day, right for the previous one. runOnJS(true): the callback runs as normal JS.
  const swipe = Gesture.Pan().runOnJS(true).activeOffsetX([-30, 30]).failOffsetY([-15, 15]).onEnd((e) => {
    if (e.translationX < -60) go(1);
    else if (e.translationX > 60) go(-1);
  });

  const remove = async (item: TimelineItem) => {
    await deleteItem(repo, profile.id, item);
    bump();
    toast(t('timeline.deleted'), { label: t('common.undo'), onPress: () => { void restoreItem(repo, profile.id, item).then(bump); } });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <DemoBanner />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T variant="display" accessibilityRole="header" style={{ flex: 1 }}>{t('timeline.title')}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={searching ? t('timeline.closeSearch') : t('timeline.search')}
            onPress={() => { setSearching(!searching); setQuery(''); }} style={styles.iconBtn}>
            {searching ? <X size={24} color={c.primary} /> : <Search size={24} color={c.primary} />}
          </Pressable>
        </View>
        {searching ? (
          <Input label={t('timeline.search')} placeholder={t('timeline.searchPlaceholder')} value={query} onChangeText={setQuery} autoFocus returnKeyType="search" />
        ) : (
          <GestureDetector gesture={swipe}>
            <View style={[styles.dayBar, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityHint={t('timeline.swipeHint')}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('timeline.prevDay')} onPress={() => go(-1)} style={styles.iconBtn}>
                <ChevronLeft size={24} color={c.primary} />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <T variant="headline" accessibilityRole="header" center>{dayLabel(date, tz)}</T>
                {date !== today && date !== addDays(today, -1) ? null : <T variant="footnote" color="muted">{fmtShortDate(date)}</T>}
              </View>
              <DateButton label={t('timeline.pickDay')} value={date} onChange={(d) => setDate(d > today ? today : d)} icon={<CalendarDays size={22} color={c.primary} />} />
              <Pressable accessibilityRole="button" accessibilityLabel={t('timeline.nextDay')} disabled={date >= today} onPress={() => go(1)}
                style={[styles.iconBtn, { opacity: date >= today ? 0.3 : 1 }]}>
                <ChevronRight size={24} color={c.primary} />
              </Pressable>
            </View>
          </GestureDetector>
        )}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label={t('timeline.filters.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          {TIMELINE_KINDS.map((k) => <Chip key={k} label={t(`timeline.filters.${k}`)} selected={filter === k} onPress={() => setFilter(filter === k ? 'all' : k)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}>
        {shown.length ? (
          <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
            {shown.map((item, i) => (
              <View key={`${item.kind}-${item.id}`} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : null}>
                <TimelineRow item={item} tz={tz} onDelete={() => void remove(item)}
                  showDate={searching && item.at ? fmtShortDate(localDateOf(ms(item.at), tz)) : undefined} />
              </View>
            ))}
          </View>
        ) : loading ? null : searching ? (
          <EmptyState icon={Search} title={query.trim().length < 2 ? t('timeline.searchStart') : t('timeline.noResults')} />
        ) : (
          <EmptyState icon={ListTree} title={t('timeline.emptyTitle')} body={t('timeline.emptyBody')} />
        )}
        {shown.length && !searching ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, justifyContent: 'center' }}>
            <IconCircle icon={ListTree} color={c.textMuted} size={24} />
            <T variant="footnote" color="muted">{t('timeline.swipeTip')}</T>
          </View>
        ) : null}
      </ScrollView>
      <Fab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayBar: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xs, minHeight: 56 },
  filters: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  list: { borderRadius: radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
