/**
 * Translations (SPEC 28.3): every user-facing string lives in en.json / es.json (packages/shared/i18n, shared with the
 * portal) and is looked up by key.
 * Content shared with the engine (strategy names, trigger labels, reason templates) comes from @emolens/shared.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getCalendars, getLocales } from 'expo-localization';
import type { Lang } from '@emolens/shared';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';

export function deviceLanguage(): Lang {
  return getLocales()[0]?.languageCode === 'es' ? 'es' : 'en';
}
export function deviceUnits(): 'imperial' | 'metric' {
  return getLocales()[0]?.measurementSystem === 'us' ? 'imperial' : 'metric';
}
export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes text
  initAsync: false,
  returnNull: false,
});

export function setLanguage(lang: Lang): void {
  void i18n.changeLanguage(lang);
}
export const currentLang = (): Lang => (i18n.language === 'es' ? 'es' : 'en');

export default i18n;
