/** Default content from spec Appendix B, plus the engine-facing strings (en + es). */

export type Lang = 'en' | 'es';

export const DEFAULT_STRATEGIES: { name: { en: string; es: string }; category: string }[] = [
  { name: { en: 'Quiet space / break area', es: 'Espacio tranquilo / zona de descanso' }, category: 'environment' },
  { name: { en: 'Noise-reducing headphones', es: 'Audífonos que reducen el ruido' }, category: 'sensory' },
  { name: { en: 'Dim lights / reduce visual input', es: 'Bajar la luz / reducir estímulos visuales' }, category: 'sensory' },
  { name: { en: 'Deep pressure / weighted item', es: 'Presión profunda / objeto con peso' }, category: 'sensory' },
  { name: { en: 'Comfort object', es: 'Objeto de consuelo' }, category: 'sensory' },
  { name: { en: 'Allow stimming / movement', es: 'Permitir stimming / movimiento' }, category: 'movement' },
  { name: { en: 'Movement break (walk, swing, jump)', es: 'Pausa de movimiento (caminar, columpio, saltar)' }, category: 'movement' },
  { name: { en: 'Calm, few words / co-regulation', es: 'Calma, pocas palabras / corregulación' }, category: 'connection' },
  { name: { en: 'Give space and time', es: 'Dar espacio y tiempo' }, category: 'connection' },
  { name: { en: 'Visual schedule / first-then', es: 'Horario visual / primero-después' }, category: 'routine' },
  { name: { en: 'Advance warning before a change', es: 'Avisar antes de un cambio' }, category: 'routine' },
  { name: { en: 'Reduce demands', es: 'Reducir exigencias' }, category: 'routine' },
  { name: { en: 'Offer choices', es: 'Ofrecer opciones' }, category: 'routine' },
  { name: { en: 'Snack or water', es: 'Merienda o agua' }, category: 'body_needs' },
  { name: { en: 'Bathroom / check for pain or discomfort', es: 'Baño / revisar dolor o molestias' }, category: 'body_needs' },
  { name: { en: 'Favorite activity or special interest', es: 'Actividad favorita o interés especial' }, category: 'preferred_activity' },
  { name: { en: 'AAC / communication support', es: 'CAA / apoyo a la comunicación' }, category: 'connection' },
];

export const ANTECEDENT_TAGS = ['transition', 'waiting', 'demand_or_task', 'told_no', 'change_in_plans', 'loud_noise', 'crowd',
  'bright_or_visual', 'smell_or_texture', 'hungry', 'tired', 'pain_or_sick', 'new_place', 'new_person', 'screen_ended',
  'sibling_or_peer_conflict', 'unknown'] as const;

export const BEHAVIOR_TAGS = ['crying', 'yelling', 'dropping_to_floor', 'running_or_bolting', 'hitting_or_kicking', 'self_injury',
  'throwing', 'withdrawing', 'not_responding', 'hiding', 'repetitive_movements', 'covering_ears', 'other'] as const;

/** Onboarding step 7 options → feature keys nudged (Appendix B.4). */
export const SUSPECTED_TRIGGERS: { id: string; label: { en: string; es: string }; keys: string[] }[] = [
  { id: 'sleep', label: { en: 'Not enough sleep', es: 'Poco sueño' }, keys: ['sleep_deficit', 'night_wakings'] },
  { id: 'hunger', label: { en: 'Hunger', es: 'Hambre' }, keys: ['hunger_gap'] },
  { id: 'sugar', label: { en: 'Sugary foods', es: 'Comidas azucaradas' }, keys: ['high_sugar_recent'] },
  { id: 'caffeine', label: { en: 'Caffeine', es: 'Cafeína' }, keys: ['caffeine_recent'] },
  { id: 'missed_med', label: { en: 'Missed or late medication', es: 'Medicación olvidada o tarde' }, keys: ['missed_dose', 'late_dose'] },
  { id: 'med_change', label: { en: 'Medication changes', es: 'Cambios de medicación' }, keys: ['med_change_recent'] },
  { id: 'transitions', label: { en: 'Transitions between activities', es: 'Transiciones entre actividades' }, keys: ['planned_transitions', 'arrival_recent'] },
  { id: 'routine', label: { en: 'Changes in routine', es: 'Cambios en la rutina' }, keys: ['unusual_day'] },
  { id: 'appointments', label: { en: 'Appointments', es: 'Citas' }, keys: ['appointment_near'] },
  { id: 'new_places', label: { en: 'New places', es: 'Lugares nuevos' }, keys: ['new_place'] },
  { id: 'school', label: { en: 'School', es: 'La escuela' }, keys: ['place_school'] },
  { id: 'stores', label: { en: 'Stores / crowded places', es: 'Tiendas / lugares concurridos' }, keys: ['place_store_public'] },
  { id: 'loud', label: { en: 'Loud environments', es: 'Ambientes ruidosos' }, keys: ['noise_high'] },
  { id: 'hot', label: { en: 'Hot or stuffy rooms', es: 'Cuartos calurosos o cargados' }, keys: ['temp_uncomfortable'] },
  { id: 'weather', label: { en: 'Weather changes', es: 'Cambios de clima' }, keys: ['pressure_change', 'heat_or_cold'] },
  { id: 'sick', label: { en: 'Being sick or in pain', es: 'Estar enfermo o con dolor' }, keys: ['illness'] },
];

type Pair = { en: string; es: string };
/** Display name, effect phrase ("{u}" = meaningful change), raising + protective reason templates. */
export interface FeatureCopy { label: Pair; phrase: Pair; raise: Pair; protect: Pair | null; }

export const FEATURE_COPY: Record<string, FeatureCopy> = {
  intercept: { label: { en: 'Baseline', es: 'Base' }, phrase: { en: '', es: '' }, raise: { en: 'Baseline', es: 'Base' }, protect: null },
  tod_midday: { label: { en: 'Midday', es: 'Mediodía' }, phrase: { en: 'around midday', es: 'al mediodía' },
    raise: { en: 'Middays tend to be harder', es: 'Los mediodías suelen ser más difíciles' }, protect: { en: 'Middays tend to be calmer', es: 'Los mediodías suelen ser más tranquilos' } },
  tod_afternoon: { label: { en: 'Afternoon', es: 'Tarde' }, phrase: { en: 'in the afternoon', es: 'por la tarde' },
    raise: { en: 'Afternoons tend to be harder', es: 'Las tardes suelen ser más difíciles' }, protect: { en: 'Afternoons tend to be calmer', es: 'Las tardes suelen ser más tranquilas' } },
  tod_evening: { label: { en: 'Evening', es: 'Noche' }, phrase: { en: 'in the evening', es: 'por la noche' },
    raise: { en: 'Evenings tend to be harder', es: 'Las noches suelen ser más difíciles' }, protect: { en: 'Evenings tend to be calmer', es: 'Las noches suelen ser más tranquilas' } },
  weekend: { label: { en: 'Weekend', es: 'Fin de semana' }, phrase: { en: 'on weekends', es: 'los fines de semana' },
    raise: { en: 'Weekends tend to be harder', es: 'Los fines de semana suelen ser más difíciles' }, protect: { en: 'Weekends tend to be calmer', es: 'Los fines de semana suelen ser más tranquilos' } },
  school_day: { label: { en: 'School day', es: 'Día de escuela' }, phrase: { en: 'on school days', es: 'en días de escuela' },
    raise: { en: 'School days tend to be harder', es: 'Los días de escuela suelen ser más difíciles' }, protect: { en: 'School days tend to be calmer', es: 'Los días de escuela suelen ser más tranquilos' } },
  recent_episode: { label: { en: 'Recent hard moment', es: 'Momento difícil reciente' }, phrase: { en: 'within 4 hours of another hard moment', es: 'dentro de 4 horas de otro momento difícil' },
    raise: { en: 'A hard moment happened recently', es: 'Hubo un momento difícil hace poco' }, protect: null },
  sleep_missing: { label: { en: 'Sleep not logged', es: 'Sueño sin registrar' }, phrase: { en: 'when sleep is not logged', es: 'cuando no se registra el sueño' },
    raise: { en: "Last night's sleep isn't logged yet", es: 'El sueño de anoche aún no está registrado' }, protect: null },
  meal_missing: { label: { en: 'Meals not logged', es: 'Comidas sin registrar' }, phrase: { en: 'when meals are not logged', es: 'cuando no se registran comidas' },
    raise: { en: 'No meals logged recently', es: 'No hay comidas registradas recientemente' }, protect: null },
  noise_missing: { label: { en: 'No sound data', es: 'Sin datos de sonido' }, phrase: { en: 'without sound data', es: 'sin datos de sonido' },
    raise: { en: 'No recent sound data', es: 'Sin datos de sonido recientes' }, protect: null },
  physio_missing: { label: { en: 'No heart-rate data', es: 'Sin datos de ritmo cardíaco' }, phrase: { en: 'without heart-rate data', es: 'sin datos de ritmo cardíaco' },
    raise: { en: 'No recent heart-rate data', es: 'Sin datos recientes de ritmo cardíaco' }, protect: null },
  sleep_deficit: { label: { en: 'Shorter sleep', es: 'Menos sueño' }, phrase: { en: 'after {u} fewer hours of sleep', es: 'después de dormir {u} horas menos' },
    raise: { en: 'Short sleep last night ({h} h less than usual)', es: 'Durmió poco anoche ({h} h menos de lo usual)' }, protect: { en: 'Good sleep last night', es: 'Buen sueño anoche' } },
  night_wakings: { label: { en: 'Night wakings', es: 'Despertares nocturnos' }, phrase: { en: 'after {u} night wakings', es: 'después de {u} despertares nocturnos' },
    raise: { en: 'Woke up during the night', es: 'Se despertó durante la noche' }, protect: { en: 'Slept through the night', es: 'Durmió toda la noche' } },
  hunger_gap: { label: { en: 'Time since eating', es: 'Tiempo sin comer' }, phrase: { en: 'after {u} extra hours without eating', es: 'después de {u} horas extra sin comer' },
    raise: { en: "It's been a while since eating{est}", es: 'Hace rato que no come{est}' }, protect: { en: 'Recently ate', es: 'Comió hace poco' } },
  high_sugar_recent: { label: { en: 'Sugary food', es: 'Comida azucarada' }, phrase: { en: 'within 3 hours after sugary food', es: 'dentro de 3 horas después de comida azucarada' },
    raise: { en: 'Had something sugary recently', es: 'Comió algo azucarado hace poco' }, protect: null },
  caffeine_recent: { label: { en: 'Caffeine', es: 'Cafeína' }, phrase: { en: 'within 6 hours after caffeine', es: 'dentro de 6 horas después de cafeína' },
    raise: { en: 'Had caffeine recently', es: 'Tomó cafeína hace poco' }, protect: null },
  missed_dose: { label: { en: 'Missed medication dose', es: 'Dosis olvidada' }, phrase: { en: 'within a day after a missed dose', es: 'dentro de un día después de una dosis olvidada' },
    raise: { en: 'A missed medication dose', es: 'Una dosis de medicación olvidada' }, protect: null },
  late_dose: { label: { en: 'Late medication dose', es: 'Dosis tardía' }, phrase: { en: 'after a late dose', es: 'después de una dosis tardía' },
    raise: { en: 'A late medication dose', es: 'Una dosis de medicación tardía' }, protect: null },
  med_change_recent: { label: { en: 'Recent medication change', es: 'Cambio reciente de medicación' }, phrase: { en: 'after a medication change', es: 'después de un cambio de medicación' },
    raise: { en: 'A recent medication change', es: 'Un cambio reciente de medicación' }, protect: null },
  planned_transitions: { label: { en: 'Planned transitions', es: 'Transiciones planeadas' }, phrase: { en: 'with each planned transition', es: 'con cada transición planeada' },
    raise: { en: '{n, plural, one {# planned transition} other {# planned transitions}} in this window', es: '{n, plural, one {# transición planeada} other {# transiciones planeadas}} en este horario' }, protect: { en: 'A predictable stretch', es: 'Un rato predecible' } },
  arrival_recent: { label: { en: 'Just arrived somewhere', es: 'Acaba de llegar a un lugar' }, phrase: { en: 'right after arriving somewhere', es: 'justo después de llegar a un lugar' },
    raise: { en: 'Just arrived somewhere', es: 'Acaba de llegar a un lugar' }, protect: null },
  unusual_day: { label: { en: 'Routine changes', es: 'Cambios de rutina' }, phrase: { en: 'on days with a routine change', es: 'en días con cambio de rutina' },
    raise: { en: "Today's routine is different", es: 'La rutina de hoy es diferente' }, protect: { en: 'A normal routine day', es: 'Un día de rutina normal' } },
  appointment_near: { label: { en: 'Appointments', es: 'Citas' }, phrase: { en: 'around appointments', es: 'alrededor de citas' },
    raise: { en: 'An appointment around this time', es: 'Una cita alrededor de esta hora' }, protect: null },
  new_place: { label: { en: 'New places', es: 'Lugares nuevos' }, phrase: { en: 'in new places', es: 'en lugares nuevos' },
    raise: { en: 'Being somewhere new', es: 'Estar en un lugar nuevo' }, protect: null },
  place_school: { label: { en: 'At school', es: 'En la escuela' }, phrase: { en: 'at school', es: 'en la escuela' },
    raise: { en: 'Time at school', es: 'Tiempo en la escuela' }, protect: { en: 'School tends to be calmer', es: 'La escuela suele ser más tranquila' } },
  place_therapy_medical: { label: { en: 'Therapy or medical visits', es: 'Terapia o visitas médicas' }, phrase: { en: 'at therapy or medical visits', es: 'en terapia o visitas médicas' },
    raise: { en: 'At a therapy or medical visit', es: 'En terapia o visita médica' }, protect: null },
  place_store_public: { label: { en: 'Stores and public places', es: 'Tiendas y lugares públicos' }, phrase: { en: 'in stores or public places', es: 'en tiendas o lugares públicos' },
    raise: { en: 'Out in a store or public place', es: 'En una tienda o lugar público' }, protect: null },
  place_other: { label: { en: "Relatives' and other places", es: 'Casa de familiares y otros lugares' }, phrase: { en: "at relatives' or other places", es: 'en casa de familiares u otros lugares' },
    raise: { en: "At a relative's or other place", es: 'En casa de un familiar u otro lugar' }, protect: null },
  noise_high: { label: { en: 'Loud environments', es: 'Ambientes ruidosos' }, phrase: { en: 'after 30 loud minutes', es: 'después de 30 minutos de ruido' },
    raise: { en: 'A loud environment recently', es: 'Un ambiente ruidoso hace poco' }, protect: { en: 'A quiet environment recently', es: 'Un ambiente tranquilo hace poco' } },
  temp_uncomfortable: { label: { en: 'Uncomfortable room temperature', es: 'Temperatura incómoda' }, phrase: { en: 'when the room is too hot or cold', es: 'cuando el cuarto está muy caliente o frío' },
    raise: { en: 'The room was too hot or cold', es: 'El cuarto estaba muy caliente o frío' }, protect: null },
  pressure_change: { label: { en: 'Weather pressure changes', es: 'Cambios de presión atmosférica' }, phrase: { en: 'with a 3 hPa pressure swing', es: 'con un cambio de presión de 3 hPa' },
    raise: { en: 'A shift in the weather', es: 'Un cambio en el clima' }, protect: null },
  heat_or_cold: { label: { en: 'Very hot or cold weather', es: 'Clima muy caluroso o frío' }, phrase: { en: 'in very hot or cold weather', es: 'con clima muy caluroso o frío' },
    raise: { en: 'Very hot or cold outside', es: 'Hace mucho calor o frío afuera' }, protect: null },
  poor_air: { label: { en: 'Poor air quality', es: 'Mala calidad del aire' }, phrase: { en: 'on poor air-quality days', es: 'en días de mala calidad del aire' },
    raise: { en: 'Poor air quality', es: 'Mala calidad del aire' }, protect: null },
  pollen_high: { label: { en: 'High pollen', es: 'Polen alto' }, phrase: { en: 'on high-pollen days', es: 'en días de polen alto' },
    raise: { en: 'High pollen today', es: 'Polen alto hoy' }, protect: null },
  illness: { label: { en: 'Being sick or in pain', es: 'Estar enfermo o con dolor' }, phrase: { en: 'while sick or in pain', es: 'mientras está enfermo o con dolor' },
    raise: { en: 'Feeling unwell', es: 'No se siente bien' }, protect: null },
  low_activity_yesterday: { label: { en: 'Low activity yesterday', es: 'Poca actividad ayer' }, phrase: { en: 'after a low-activity day', es: 'después de un día con poca actividad' },
    raise: { en: 'Less active than usual yesterday', es: 'Menos activo de lo usual ayer' }, protect: null },
  resting_hr_up: { label: { en: 'Higher resting heart rate', es: 'Ritmo cardíaco en reposo más alto' }, phrase: { en: 'with resting heart rate 5 bpm higher', es: 'con ritmo en reposo 5 lpm más alto' },
    raise: { en: 'Body signs of stress (heart rate)', es: 'Señales de estrés del cuerpo (ritmo cardíaco)' }, protect: { en: 'Calm body signals', es: 'Señales corporales tranquilas' } },
  hrv_down: { label: { en: 'Lower heart-rate variability', es: 'Menor variabilidad cardíaca' }, phrase: { en: 'with lower heart-rate variability', es: 'con menor variabilidad cardíaca' },
    raise: { en: 'Body signs of stress (heart rate)', es: 'Señales de estrés del cuerpo (ritmo cardíaco)' }, protect: { en: 'Calm body signals', es: 'Señales corporales tranquilas' } },
  hr_elevated_pre: { label: { en: 'Heart rate up beforehand', es: 'Ritmo cardíaco elevado antes' }, phrase: { en: 'when heart rate was 10 bpm above usual', es: 'cuando el ritmo estaba 10 lpm sobre lo usual' },
    raise: { en: 'Body signs of stress (heart rate)', es: 'Señales de estrés del cuerpo (ritmo cardíaco)' }, protect: { en: 'Calm body signals', es: 'Señales corporales tranquilas' } },
};

export const STATUS_LABELS: Record<string, Pair> = {
  hidden: { en: 'Not tracked', es: 'No se registra' },
  not_enough_data: { en: 'Not enough data yet', es: 'Aún no hay suficientes datos' },
  strong: { en: 'Strong link', es: 'Relación fuerte' },
  likely: { en: 'Likely link', es: 'Relación probable' },
  possible: { en: 'Possible link', es: 'Relación posible' },
  protective: { en: 'Linked to calmer times', es: 'Asociado a momentos más tranquilos' },
  no_clear_link: { en: 'No clear link', es: 'Sin relación clara' },
  checking: { en: 'Still checking', es: 'Aún revisando' },
};

export const HOW_WE_KNOW: Pair = {
  en: "EmoLens starts with a gentle guess about how much each factor matters, then updates that guess every time you log. When a factor keeps showing up before hard moments (and doesn't show up as much during calm times), EmoLens becomes more confident it's linked. The status (for example “Strong link”) says how sure EmoLens is that a factor raises or lowers the chance. The precision meter says something different: how precisely EmoLens knows the size of the effect, meaning how much of its starting uncertainty about that size {Nickname}'s own data has cleared up. So a link can be strong while its exact size is still fuzzy. A link isn't proof that one thing causes another, but it can point to things worth trying.",
  es: 'EmoLens empieza con una estimación suave de cuánto importa cada factor y la actualiza cada vez que registras algo. Cuando un factor aparece una y otra vez antes de los momentos difíciles (y no tanto en los momentos tranquilos), EmoLens tiene más confianza en que están relacionados. El estado (por ejemplo, «Relación fuerte») dice qué tan seguro está EmoLens de que un factor sube o baja la probabilidad. El medidor de precisión dice otra cosa: con qué precisión conoce EmoLens el tamaño del efecto, es decir, cuánta de su incertidumbre inicial sobre ese tamaño se ha aclarado con los propios datos de {Nickname}. Así, una relación puede ser fuerte aunque su tamaño exacto aún sea impreciso. Una relación no prueba que una cosa cause otra, pero puede señalar cosas que vale la pena probar.',
};

export const LEARNING_REASON: Pair = {
  en: 'Based mostly on starting estimates. EmoLens is still learning.',
  es: 'Basado sobre todo en estimaciones iniciales. EmoLens todavía está aprendiendo.',
};

const PLURAL = /\{(\w+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g;

/**
 * CLDR's "one" plural category for our two languages: English "one" = the integer 1 written without decimals
 * ("1 transition", but "1.0 hours"); Spanish "one" = the number 1. Everything else is "other" (Spanish's "many" is for
 * numbers like 1,000,000, which our templates never show and would read as "other" anyway).
 */
export function isPluralOne(value: string | number, lang: Lang): boolean {
  const n = Number(value);
  if (lang === 'es') return n === 1;
  return n === 1 && !String(value).includes('.');
}

/**
 * Fill "{name}" placeholders, and choose plural forms written as
 * "{n, plural, one {# planned transition} other {# planned transitions}}" ("#" = the number).
 * The form follows CLDR plural rules (`isPluralOne`), written out here instead of calling `Intl.PluralRules`: the
 * phone's JavaScript engine (Hermes) has no `Intl.PluralRules`, and calling it there threw, which broke forecasts, the
 * PDF report and the ABC export on the phone (BUGS.md #11). i18next falls back to the same one/other rule on Hermes.
 */
export function fmt(template: string, params: Record<string, string | number>, lang: Lang = 'en'): string {
  return template
    .replace(PLURAL, (m, k: string, one: string, other: string) => {
      if (!(k in params)) return m;
      return (isPluralOne(params[k], lang) ? one : other).replace(/#/g, String(params[k]));
    })
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
