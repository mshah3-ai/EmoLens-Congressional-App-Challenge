/**
 * Automatic calendar tags (SPEC 11.3). A tag applies when the event title contains one of its keywords as whole words
 * (case-insensitive), so "break" does not match "breakfast" and "OT" does not match "hot". Spanish keywords are added
 * for Spanish-speaking families (DECISIONS #41). The parent can add their own keywords, and re-tag or ignore any event.
 * Every event that isn't all-day is also a `transition`, unless ignored. A `no_school` event is never also a `school_event`.
 */
import type { CalendarTag } from '@emolens/shared';

export const CALENDAR_TAGS: CalendarTag[] = ['transition', 'appointment', 'unusual', 'no_school', 'travel', 'social', 'school_event'];

export const DEFAULT_KEYWORDS: Record<Exclude<CalendarTag, 'transition'>, string[]> = {
  appointment: ['doctor', 'dentist', 'therapy', 'ot', 'speech', 'aba', 'appointment', 'checkup', 'vaccine', 'haircut',
    'médico', 'medico', 'doctora', 'dentista', 'terapia', 'cita', 'consulta', 'vacuna', 'corte de pelo'],
  unusual: ['party', 'trip', 'travel', 'visit', 'guests', 'sub', 'substitute', 'field trip', 'assembly', 'picture day', 'test', 'recital', 'game',
    'fiesta', 'excursión', 'excursion', 'visita', 'invitados', 'suplente', 'examen', 'recital', 'partido'],
  no_school: ['no school', 'holiday', 'break', 'day off', 'teacher institute', 'snow day',
    'sin clases', 'no hay clases', 'feriado', 'festivo', 'vacaciones', 'día libre', 'dia libre'],
  travel: ['flight', 'airport', 'road trip', 'hotel', 'vuelo', 'aeropuerto', 'viaje'],
  social: ['birthday', 'playdate', 'party', 'sleepover', 'cumpleaños', 'cumpleanos', 'fiesta', 'pijamada'],
  school_event: ['school', 'class', 'conference', 'iep', 'escuela', 'clase', 'colegio', 'reunión de padres', 'reunion de padres'],
};

/** Lowercase, split on anything that isn't a letter or digit, rejoin with single spaces. Works with accents. */
function words(s: string): string {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
}

export function hasKeyword(title: string, keyword: string): boolean {
  const kw = words(keyword);
  return kw.length > 0 && ` ${words(title)} `.includes(` ${kw} `);
}

/** Tags for one event from its title, whether it's all-day, and the parent's extra keywords. */
export function autoTags(title: string | null, allDay: boolean, custom: Record<string, string[]> = {}): CalendarTag[] {
  const t = title ?? '';
  const tags = new Set<CalendarTag>();
  for (const [tag, list] of Object.entries(DEFAULT_KEYWORDS) as [CalendarTag, string[]][]) {
    if ([...list, ...(custom[tag] ?? [])].some((k) => hasKeyword(t, k))) tags.add(tag);
  }
  // "No school" contains the word "school": a day without school is not a school event (DECISIONS #41).
  if (tags.has('no_school')) tags.delete('school_event');
  if (!allDay) tags.add('transition');
  return CALENDAR_TAGS.filter((x) => tags.has(x));
}
