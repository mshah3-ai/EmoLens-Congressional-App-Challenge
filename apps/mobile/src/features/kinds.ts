/** One icon, accent color and log sheet per kind of entry, shared by Today's quick-add row and the Timeline. */
import type { ComponentType } from 'react';
import { BedDouble, BellRing, CalendarDays, HandHeart, MapPin, Mic, NotebookPen, Pill, Shuffle, Thermometer, Utensils, Zap, type LucideProps } from 'lucide-react-native';
import type { TimelineKind } from '../db/repo/timeline';
import type { AccentKey } from '../ui/theme';

export interface KindInfo { icon: ComponentType<LucideProps>; accent: AccentKey; route: string; }

export const KINDS: Record<TimelineKind, KindInfo> = {
  episode: { icon: Zap, accent: 'episode', route: '/log/episode' },
  strategy: { icon: HandHeart, accent: 'strategy', route: '/log/strategy' },
  dose: { icon: Pill, accent: 'med', route: '/log/med' },
  meal: { icon: Utensils, accent: 'meal', route: '/log/meal' },
  sleep: { icon: BedDouble, accent: 'sleep', route: '/log/sleep' },
  visit: { icon: MapPin, accent: 'place', route: '/log/place' },
  illness: { icon: Thermometer, accent: 'illness', route: '/log/illness' },
  routine: { icon: Shuffle, accent: 'routine', route: '/log/routine' },
  note: { icon: NotebookPen, accent: 'note', route: '/log/note' },
  calendar: { icon: CalendarDays, accent: 'routine', route: '/settings/calendar-events' },
  sound: { icon: Mic, accent: 'meal', route: '/log/sound' },
  alert: { icon: BellRing, accent: 'episode', route: '/confirm' },
};

/** Today's quick-add row (SPEC 9.2). Voice notes and school notes (Phase 8) are added by QuickAdd itself: they aren't Timeline kinds. */
export const QUICK_ADD: TimelineKind[] = ['meal', 'dose', 'sleep', 'visit', 'note', 'sound', 'illness', 'routine', 'strategy'];
/** What a teacher can log (SPEC 7.1: hard moments via the big button, plus meals at school, notes and strategies). */
export const TEACHER_QUICK_ADD: TimelineKind[] = ['meal', 'note', 'strategy'];
