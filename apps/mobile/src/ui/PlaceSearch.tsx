/**
 * Search box with suggestions underneath, like a maps app: type an address or a place name, tap a result.
 * Waits until typing pauses (350 ms) before asking, ignores answers to older text, and falls back to the phone's own
 * address lookup when the search service can't be reached (Return key with no suggestions).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MapPin, Search, X } from 'lucide-react-native';
import { geocodeAddress } from '../integrations/location';
import { MIN_QUERY, searchPlaces, type PlaceSuggestion } from '../integrations/placeSearch';
import { Input } from './Field';
import { T } from './Text';
import { radius, space, TOUCH, useTheme } from './theme';

export const SEARCH_DELAY_MS = 350;

type Status = 'idle' | 'searching' | 'done' | 'error';

export function PlaceSearch({ onSelect, near, search = searchPlaces, lookup = geocodeAddress, testID = 'place-search' }: {
  onSelect: (s: PlaceSuggestion) => void;
  /** Home's rounded location, so nearby matches come first. */
  near?: { latitude: number; longitude: number } | null;
  /** Replaceable in tests. */
  search?: typeof searchPlaces;
  lookup?: typeof geocodeAddress;
  testID?: string;
}) {
  const { t, i18n } = useTranslation();
  const { c, accent } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const latest = useRef(0);
  /** The text of the result just picked: don't search for it again. */
  const picked = useRef<string | null>(null);

  // depend on the numbers, not the object: a parent may build a new object on every render
  const nearLat = near?.latitude, nearLon = near?.longitude;
  useEffect(() => {
    const q = query.trim();
    const id = ++latest.current;
    if (q.length < MIN_QUERY || q === picked.current) { setResults([]); setStatus('idle'); return; }
    setStatus('searching');
    const timer = setTimeout(() => {
      const around = nearLat != null && nearLon != null ? { latitude: nearLat, longitude: nearLon } : null;
      search(q, around, i18n.language).then((r) => {
        if (id !== latest.current) return; // an answer to older text
        setResults(r); setStatus('done');
      }, () => {
        if (id !== latest.current) return;
        setResults([]); setStatus('error');
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, nearLat, nearLon, search, i18n.language]);

  const choose = (s: PlaceSuggestion) => {
    picked.current = s.title;
    latest.current++;
    setQuery(s.title); setResults([]); setStatus('idle');
    onSelect(s);
  };
  /** Return key: take the top suggestion, or ask the phone's own address lookup. */
  const submit = async () => {
    if (results[0]) { choose(results[0]); return; }
    const q = query.trim();
    if (!q) return;
    try {
      const found = await lookup(q);
      if (found) choose({ id: 'device', title: q, subtitle: '', latitude: found.latitude, longitude: found.longitude, type: null });
      else setStatus(status === 'error' ? 'error' : 'done');
    } catch { setStatus('error'); }
  };
  const clear = () => { picked.current = null; setQuery(''); };

  return (
    <View style={{ gap: space.xs }} testID={testID}>
      <View style={[styles.box, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Search size={18} color={c.textMuted} />
        <View style={{ flex: 1 }}>
          <Input testID={`${testID}-input`} label={t('places.searchLabel')} placeholder={t('places.searchPlaceholder')} value={query}
            onChangeText={(v) => { picked.current = null; setQuery(v); }} onSubmitEditing={() => void submit()} returnKeyType="search"
            autoCorrect={false} style={styles.input} />
        </View>
        {status === 'searching' ? <ActivityIndicator testID={`${testID}-busy`} color={c.textMuted} /> : null}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('places.searchClear')} onPress={clear} hitSlop={8} style={styles.clear}>
            <X size={18} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {results.length ? (
        <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={t('places.searchResults', { count: results.length })}>
          {results.map((r, i) => (
            <Pressable key={r.id} testID={`${testID}-result-${i}`} accessibilityRole="button"
              accessibilityLabel={r.subtitle ? `${r.title}, ${r.subtitle}` : r.title}
              onPress={() => choose(r)}
              style={({ pressed }) => [styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : null,
                { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
              <MapPin size={18} color={accent.place} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="body" numberOfLines={1}>{r.title}</T>
                {r.subtitle ? <T variant="footnote" color="muted" numberOfLines={1}>{r.subtitle}</T> : null}
              </View>
            </Pressable>
          ))}
          <T variant="footnote" color="muted" style={styles.credit}>{t('places.searchCredit')}</T>
        </View>
      ) : null}
      {status === 'done' && !results.length ? <T variant="footnote" color="muted" testID={`${testID}-none`}>{t('places.searchNone')}</T> : null}
      {status === 'error' ? <T variant="footnote" color="muted" testID={`${testID}-error`}>{t('places.searchOffline')}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.sm, borderRadius: radius.control, borderWidth: 1 },
  input: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  clear: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.control, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: TOUCH + 12, paddingVertical: space.sm },
  credit: { paddingHorizontal: space.md, paddingVertical: space.xs, textAlign: 'right' },
});
