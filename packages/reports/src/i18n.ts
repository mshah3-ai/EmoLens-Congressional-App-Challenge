/**
 * A small translator for the report outside the phone app (the portal and share links), reading the same English and
 * Spanish strings as the app (packages/shared/i18n). It does what the report needs from i18next: nested keys,
 * "{{name}}" placeholders, and "_one" / "_other" plural keys chosen by `count` with the same rule as the app
 * (isPluralOne, since the phone's engine has no Intl.PluralRules). Missing keys fall back to English, then the key.
 * A test checks that it gives exactly the same report as the app's i18next.
 */
import { isPluralOne, type Lang } from '@emolens/shared';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';
import type { TFn } from './templates/shell';

type Dict = { [k: string]: string | Dict };
const DICTS: Record<Lang, Dict> = { en: en as Dict, es: es as Dict };

function lookup(d: Dict, key: string): string | Dict | undefined {
  let node: string | Dict | undefined = d;
  for (const part of key.split('.')) {
    if (node == null || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

function find(lang: Lang, key: string, count: unknown): string | undefined {
  for (const d of lang === 'en' ? [DICTS.en] : [DICTS[lang], DICTS.en]) {
    if (typeof count === 'number' || typeof count === 'string') {
      const form = lookup(d, `${key}_${isPluralOne(count, lang) ? 'one' : 'other'}`);
      if (typeof form === 'string') return form;
    }
    const plain = lookup(d, key);
    if (typeof plain === 'string') return plain;
  }
  return undefined;
}

export function translator(lang: Lang): TFn {
  return (key: string, params: Record<string, unknown> = {}) => {
    const s = find(lang, key, params.count) ?? key;
    return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
  };
}
