/**
 * Food lookup (SPEC 10.4): barcodes through Open Food Facts (free, no key; we identify ourselves in the User-Agent as
 * their terms ask) and name search through USDA FoodData Central (free key). Offline, or without a USDA key, the meal
 * sheet falls back to recent and typed-in foods (SPEC 29).
 * Automatic tags from nutrition data:
 *   high_sugar       sugars >= 15 g per serving or >= 22.5 g per 100 g
 *   caffeine         caffeine in the nutrients, or coffee/cola/tea/energy drink in the name, category or ingredients
 *   artificial_color a synthetic color additive (E-number list below) or a name like "Red 40"
 * (`new_food` is added when the meal is saved, because it depends on what was logged before.)
 */
import Constants from 'expo-constants';
import { autoFoodTags } from '../db/repo/logs';
import { getJson, HttpError } from './http';

export interface FoodPick { name: string; source: 'off' | 'usda' | 'custom'; code: string | null; tags: string[] }

/** Synthetic (artificial) food colors among E100-E199 (natural ones like E100 curcumin or E160 carotenes are left out). */
export const ARTIFICIAL_COLOR_E = ['e102', 'e104', 'e110', 'e122', 'e123', 'e124', 'e127', 'e128', 'e129', 'e131', 'e132', 'e133', 'e142', 'e151', 'e154', 'e155', 'e180'];
const CAFFEINE_CATEGORY_WORDS = ['coffee', 'cola', 'tea', 'energy-drink', 'energy drink', 'caffeine'];

const uniq = (xs: string[]) => [...new Set(xs)];

export function sugarTag(sugarsPer100g: number | null | undefined, sugarsPerServing: number | null | undefined): string[] {
  if ((sugarsPerServing ?? -1) >= 15 || (sugarsPer100g ?? -1) >= 22.5) return ['high_sugar'];
  return [];
}

// ---------- Open Food Facts ----------

export interface OffProduct {
  product_name?: string; brands?: string; categories_tags?: string[]; additives_tags?: string[]; ingredients_text?: string;
  nutriments?: Record<string, number | string | undefined>;
}
export interface OffResponse { status: number; product?: OffProduct }

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

export function offToFood(barcode: string, res: OffResponse): FoodPick | null {
  const p = res.product;
  if (res.status !== 1 || !p) return null;
  const name = [p.product_name?.trim(), p.brands?.split(',')[0]?.trim()].filter(Boolean).join(' · ') || barcode;
  const n = p.nutriments ?? {};
  const tags = [...sugarTag(num(n.sugars_100g), num(n.sugars_serving)), ...autoFoodTags(name)];
  const text = `${(p.categories_tags ?? []).join(' ')} ${p.ingredients_text ?? ''}`.toLowerCase();
  if ((num(n.caffeine_100g) ?? 0) > 0 || CAFFEINE_CATEGORY_WORDS.some((w) => text.includes(w))) tags.push('caffeine');
  if ((p.additives_tags ?? []).some((a) => ARTIFICIAL_COLOR_E.includes(a.replace(/^[a-z]{2}:/, '').toLowerCase()))) tags.push('artificial_color');
  return { name, source: 'off', code: barcode, tags: uniq(tags) };
}

export function offUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories_tags,nutriments,additives_tags,ingredients_text`;
}

export function offUserAgent(): string {
  const contact = process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'no-contact-set';
  return `EmoLens/${Constants.expoConfig?.version ?? '1.0'} (${contact})`;
}

/** Barcode → food, or null if Open Food Facts doesn't know it (the parent can then type a name). */
export async function lookupBarcode(barcode: string): Promise<FoodPick | null> {
  try {
    return offToFood(barcode, await getJson<OffResponse>(offUrl(barcode), { headers: { 'User-Agent': offUserAgent() } }));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

// ---------- USDA FoodData Central ----------

export interface UsdaFood {
  fdcId: number; description: string; brandOwner?: string; brandName?: string; foodCategory?: string; ingredients?: string;
  servingSize?: number; servingSizeUnit?: string;
  foodNutrients?: { nutrientName?: string; nutrientNumber?: string; unitName?: string; value?: number }[];
}
export interface UsdaSearchResponse { foods?: UsdaFood[] }

/** Title-case USDA's ALL-CAPS descriptions: "CHOCOLATE MILK" → "Chocolate milk". */
function tidy(s: string): string {
  const t = s.trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

export function usdaToFood(f: UsdaFood): FoodPick {
  const brand = f.brandName || f.brandOwner;
  const name = [tidy(f.description), brand ? tidy(brand) : null].filter(Boolean).join(' · ');
  const nutrient = (numbers: string[], names: RegExp) => f.foodNutrients?.find((x) => numbers.includes(x.nutrientNumber ?? '') || names.test(x.nutrientName ?? ''))?.value;
  const sugar100 = nutrient(['269', '269.3'], /^(total )?sugars/i) ?? null; // USDA search values are per 100 g
  const servingG = f.servingSizeUnit && /^g|grm$/i.test(f.servingSizeUnit) ? f.servingSize : undefined;
  const sugarServing = sugar100 != null && servingG ? (sugar100 * servingG) / 100 : null;
  const tags = [...sugarTag(sugar100, sugarServing), ...autoFoodTags(name)];
  const caffeine = nutrient(['262'], /^caffeine/i);
  const text = `${f.foodCategory ?? ''} ${f.ingredients ?? ''}`.toLowerCase();
  if ((caffeine ?? 0) > 0 || CAFFEINE_CATEGORY_WORDS.some((w) => text.includes(w))) tags.push('caffeine');
  if (/\b(red|yellow|blue|green)\s*(no\.?\s*)?(40|5|6|1|3)\b/i.test(f.ingredients ?? '')) tags.push('artificial_color');
  return { name, source: 'usda', code: String(f.fdcId), tags: uniq(tags) };
}

export const usdaKey = () => process.env.EXPO_PUBLIC_USDA_FDC_API_KEY || '';

export function usdaUrl(query: string, key: string): string {
  return `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=15&api_key=${encodeURIComponent(key)}`;
}

/** Name search; returns [] when there's no key (the sheet then shows recent and typed foods only). */
export async function searchFoods(query: string): Promise<FoodPick[]> {
  const key = usdaKey();
  if (!key || query.trim().length < 2) return [];
  const res = await getJson<UsdaSearchResponse>(usdaUrl(query.trim(), key));
  const seen = new Set<string>();
  return (res.foods ?? []).map(usdaToFood).filter((f) => (seen.has(f.name.toLowerCase()) ? false : (seen.add(f.name.toLowerCase()), true)));
}
