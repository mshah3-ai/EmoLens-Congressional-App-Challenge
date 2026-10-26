/**
 * Date + time picker row (SPEC 10: defaults to now, editable back up to 7 days). Also `ClockField` for
 * "HH:MM" settings like bedtime. Android uses the system dialogs; iOS shows the picker in a small sheet.
 * The pickers use the phone's own clock/time zone.
 */
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { fmtClock, fmtDayTime } from '../i18n/format';
import { currentLang } from '../i18n';
import { Button } from './Button';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

const DAY = 86_400_000;

function PickerRow({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: c.surfaceAlt, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
      <Clock size={20} color={c.primary} />
      <T variant="body" style={{ flex: 1 }}>{value}</T>
    </Pressable>
  );
}

function IOSSheet({ visible, value, mode, min, max, onDone, onCancel }: {
  visible: boolean; value: Date; mode: 'datetime' | 'time'; min?: Date; max?: Date; onDone: (d: Date) => void; onCancel: () => void;
}) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  return (
    <Modal visible={visible} transparent animationType="fade" onShow={() => setDraft(value)} onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { backgroundColor: c.surface }]}>
        <DateTimePicker value={draft} mode={mode} display="spinner" minimumDate={min} maximumDate={max}
          locale={currentLang() === 'es' ? 'es-ES' : 'en-US'} onValueChange={(_e, d) => d && setDraft(d)} />
        <Button label={t('common.done')} onPress={() => onDone(draft)} />
      </View>
    </Modal>
  );
}

/** A past instant (ISO string). */
export function TimeField({ label, value, onChange, tz, maxDaysBack = 7, allowFuture = false, testID }: {
  label: string; value: string; onChange: (iso: string) => void; tz: string; maxDaysBack?: number; allowFuture?: boolean; testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const min = new Date(now - maxDaysBack * DAY);
  const max = allowFuture ? undefined : new Date(now);
  const current = new Date(value);
  const commit = (d: Date) => onChange(new Date(Math.max(min.getTime(), max ? Math.min(max.getTime(), d.getTime()) : d.getTime())).toISOString());

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode: 'date', minimumDate: min, maximumDate: max,
        onValueChange: (_e, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({ value: date, mode: 'time', onValueChange: (_e2, time) => time && commit(time) });
        },
      });
    } else setOpen(true);
  };
  return (
    <>
      <PickerRow testID={testID} label={label} value={fmtDayTime(value, tz)} onPress={openPicker} />
      {Platform.OS === 'ios' ? (
        <IOSSheet visible={open} value={current} mode="datetime" min={min} max={max} onCancel={() => setOpen(false)}
          onDone={(d) => { setOpen(false); commit(d); }} />
      ) : null}
    </>
  );
}

/** A local clock time "HH:MM" (bedtime, quiet hours, medication times). */
export function ClockField({ label, value, onChange, testID }: { label: string; value: string; onChange: (hhmm: string) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number);
  const asDate = new Date(2020, 0, 1, h, m);
  const commit = (d: Date) => onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate, mode: 'time', onValueChange: (_e, d) => d && commit(d) });
    } else setOpen(true);
  };
  return (
    <>
      <PickerRow testID={testID} label={label} value={fmtClock(value)} onPress={openPicker} />
      {Platform.OS === 'ios' ? (
        <IOSSheet visible={open} value={asDate} mode="time" onCancel={() => setOpen(false)} onDone={(d) => { setOpen(false); commit(d); }} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { padding: space.lg, paddingBottom: space.xxl, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, gap: space.md },
});

/** Calendar icon button that picks a local date 'YYYY-MM-DD' (Timeline's "jump to day"). */
export function DateButton({ label, value, onChange, icon }: { label: string; value: string; onChange: (date: string) => void; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [y, mo, d] = value.split('-').map(Number);
  const asDate = new Date(y, mo - 1, d, 12);
  const commit = (x: Date) => onChange(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate, mode: 'date', maximumDate: new Date(), onValueChange: (_e, x) => x && commit(x) });
    } else setOpen(true);
  };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={openPicker} hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </Pressable>
      {Platform.OS === 'ios' ? (
        <DateSheet visible={open} value={asDate} onCancel={() => setOpen(false)} onDone={(x) => { setOpen(false); commit(x); }} />
      ) : null}
    </>
  );
}

function DateSheet({ visible, value, onDone, onCancel }: { visible: boolean; value: Date; onDone: (d: Date) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  return (
    <Modal visible={visible} transparent animationType="fade" onShow={() => setDraft(value)} onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { backgroundColor: c.surface }]}>
        <DateTimePicker value={draft} mode="date" display="inline" maximumDate={new Date()} accentColor={c.primary}
          locale={currentLang() === 'es' ? 'es-ES' : 'en-US'} onValueChange={(_e, d) => d && setDraft(d)} />
        <Button label={t('common.done')} onPress={() => onDone(draft)} />
      </View>
    </Modal>
  );
}
