/**
 * Log a meal, snack or drink (SPEC 10.4): type, time, amount eaten, items. Items come from a barcode scan (Open Food
 * Facts), a name search (USDA), the 12 most-logged foods, or a typed name. Offline or without a USDA key, search is
 * skipped and recent/typed foods still work (SPEC 29). Tags (sugary, caffeine, artificial colors, new food) are added
 * automatically.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, ScanBarcode, X } from 'lucide-react-native';
import { getMeal, logMeal, recentFoods, type MealItemInput } from '../../src/db/repo/logs';
import { parseJson, type MealAmount, type MealItemJson, type MealType } from '../../src/db/rows';
import { nowIso } from '../../src/db/time';
import { FoodTags } from '../../src/features/FoodTags';
import { searchFoods, usdaKey, type FoodPick } from '../../src/integrations/food';
import { localHour } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useFoodPick } from '../../src/store/foodPick';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { TimeField } from '../../src/ui/TimeField';
import { ListRow, RowGroup } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { radius, space, useTheme } from '../../src/ui/theme';

const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
const AMOUNTS: MealAmount[] = ['little', 'some', 'most', 'all'];
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function guessType(hour: number): MealType {
  if (hour < 10) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 20) return 'dinner';
  return 'snack';
}

export default function MealSheet() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const [mealType, setMealType] = useState<MealType>(guessType(localHour(Date.now(), tz)));
  const [eatenAt, setEatenAt] = useState(nowIso());
  const [previousAt, setPreviousAt] = useState<string | undefined>();
  const [amount, setAmount] = useState<MealAmount | null>(null);
  const [items, setItems] = useState<MealItemInput[]>([]);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [recent, setRecent] = useState<MealItemJson[]>([]);
  const [results, setResults] = useState<FoodPick[]>([]);
  const [searchError, setSearchError] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    void recentFoods(repo.db, profile.id).then(setRecent);
    if (!id) return;
    void getMeal(repo.db, id).then((m) => {
      if (!m) return;
      setMealType(m.meal_type); setEatenAt(m.eaten_at); setPreviousAt(m.eaten_at); setAmount(m.amount);
      setItems(parseJson<MealItemJson[]>(m.items, [])); setNotes(m.notes ?? '');
    });
  }, [id, repo, profile.id]);

  const addItem = useCallback((f: MealItemInput) => {
    setItems((list) => (list.some((x) => sameName(x.name, f.name)) ? list : [...list, f]));
  }, []);

  // A food scanned on the barcode screen comes back through a small store.
  useFocusEffect(useCallback(() => { const f = useFoodPick.getState().take(); if (f) addItem(f); }, [addItem]));

  // Name search, 300 ms after typing stops (SPEC 10.3/10.4 debounce).
  useEffect(() => {
    const q = text.trim();
    setSearchError(false);
    if (q.length < 2 || !usdaKey()) { setResults([]); return; }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchFoods(q).then((r) => { if (seq === searchSeq.current) setResults(r.slice(0, 8)); },
        () => { if (seq === searchSeq.current) { setResults([]); setSearchError(true); } });
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const addTyped = () => { const n = text.trim(); if (n) addItem({ name: n, source: 'custom', code: null, tags: [] }); setText(''); setResults([]); };
  const toggleRecent = (r: MealItemJson) => setItems((list) => (list.some((x) => sameName(x.name, r.name)) ? list.filter((x) => !sameName(x.name, r.name)) : [...list, r]));

  const save = async () => {
    const all = text.trim() && !items.some((x) => sameName(x.name, text)) ? [...items, { name: text.trim() }] : items;
    await logMeal(repo, profile.id, { eatenAt, mealType, items: all, amount, notes: notes.trim() || null }, id, previousAt);
    afterSave();
    router.back();
  };

  return (
    <Sheet title={id ? t('meal.editTitle') : t('meal.title')} footer={<Button testID="meal-save" label={t('common.save')} onPress={() => void save()} />}>
      <ChipGroup>
        {TYPES.map((k) => <Chip key={k} label={t(`meal.types.${k}`)} selected={mealType === k} onPress={() => setMealType(k)} />)}
      </ChipGroup>
      <Field label={t('meal.when')}>
        <TimeField label={t('meal.when')} value={eatenAt} onChange={setEatenAt} tz={tz} />
      </Field>
      <Field label={t('meal.items')}>
        <View style={{ gap: space.sm }}>
          {items.length ? (
            <View style={{ gap: space.xs }}>
              {items.map((it) => (
                <View key={it.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.primarySoft, borderRadius: radius.control, paddingLeft: space.md }}>
                  <View style={{ flex: 1, paddingVertical: space.sm }}>
                    <T variant="callout" weight="600">{it.name}</T>
                    <FoodTags tags={it.tags ?? []} />
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('meal.removeItem', { name: it.name })} hitSlop={6}
                    onPress={() => setItems((list) => list.filter((x) => x !== it))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={18} color={c.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Input testID="meal-search" label={t('meal.addItem')} placeholder={t('meal.searchPlaceholder')} value={text} onChangeText={setText}
                onSubmitEditing={addTyped} returnKeyType="done" />
            </View>
            <Button small variant="secondary" icon={Plus} label={t('common.add')} onPress={addTyped} disabled={!text.trim()} />
          </View>
          {results.length ? (
            <RowGroup>
              {results.map((r) => (
                <ListRow key={`${r.source}-${r.code}`} title={r.name} subtitle={r.tags.length ? r.tags.map((x) => t(`meal.tags.${x}`)).join(' · ') : undefined}
                  onPress={() => { addItem(r); setText(''); setResults([]); }} />
              ))}
            </RowGroup>
          ) : null}
          {searchError ? <T variant="footnote" color="muted">{t('meal.searchOffline')}</T> : null}
          <Button variant="secondary" icon={ScanBarcode} label={t('meal.scan')} onPress={() => router.push('/log/scan')} />
        </View>
      </Field>
      {recent.length ? (
        <Field label={t('meal.recent')}>
          <ChipGroup>
            {recent.map((r) => <Chip key={r.name} label={r.name} selected={items.some((x) => sameName(x.name, r.name))} onPress={() => toggleRecent(r)} />)}
          </ChipGroup>
        </Field>
      ) : null}
      <Field label={t('meal.amount')} optional={t('common.optional')}>
        <ChipGroup>
          {AMOUNTS.map((a) => <Chip key={a} label={t(`meal.amounts.${a}`)} selected={amount === a} onPress={() => setAmount(amount === a ? null : a)} />)}
        </ChipGroup>
      </Field>
      <Field label={t('common.notes')} optional={t('common.optional')}>
        <Input label={t('common.notes')} value={notes} onChangeText={setNotes} multiline />
      </Field>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <ScanBarcode size={14} color={accent.meal} />
        <T variant="footnote" color="muted" style={{ flex: 1 }}>{t('meal.sourcesNote')}</T>
      </View>
    </Sheet>
  );
}
