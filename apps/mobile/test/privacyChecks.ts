/**
 * What a School report (and, from Phase 7, a School share-link snapshot) must never contain (SPEC 7.1, 22.1): teachers
 * never see medications, sleep, health information, or where the child is outside school. `findSchoolLeaks` returns
 * every forbidden thing it finds in a piece of output (HTML, JSON...), so a test can show exactly what leaked.
 */
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';

export interface FamilyFacts {
  /** The family's medication names (from the database). */
  medications: string[];
  /** Names of the family's places outside school (home, relatives, therapy, stores...). */
  placesOutsideSchool: string[];
}

const RULES: { what: string; re: RegExp }[] = [
  { what: 'the word "medication"', re: /medicat|medicament|medicaci/i },
  { what: 'a dose', re: /\bdoses?\b|\bdosis\b/i },
  { what: 'sleep', re: /\bsleep|\bslept\b|\basleep\b|\bbedtime\b|\bnaps?\b|sueño|\bdorm[ií]|\bdurmi/i },
  { what: 'the prescriber sentence', re: /prescriber|receta los medicamentos|quien receta/i },
  { what: 'a kind of place outside school', re: new RegExp(`\\b(${[en.places.types.home, en.places.types.relative, en.places.types.therapy, en.places.types.medical,
    es.places.types.home, es.places.types.relative, es.places.types.therapy].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) },
];

/** A name as it can appear in HTML ("Grandma's" is written "Grandma&#39;s") as well as in plain text or JSON. */
const forms = (name: string) => [name, name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  JSON.stringify(name).slice(1, -1)];

export function findSchoolLeaks(output: string, facts: FamilyFacts): string[] {
  const found: string[] = [];
  for (const r of RULES) {
    const m = output.match(r.re);
    if (m) found.push(`${r.what}: "${m[0]}"`);
  }
  for (const name of facts.medications) if (name && forms(name).some((f) => output.includes(f))) found.push(`medication name: "${name}"`);
  for (const name of facts.placesOutsideSchool) if (name && forms(name).some((f) => output.includes(f))) found.push(`place name: "${name}"`);
  return found;
}
