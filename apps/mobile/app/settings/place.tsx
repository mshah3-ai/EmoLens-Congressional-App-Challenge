/**
 * Add, rename or remove a tagged place, and set where it is on the map (SPEC 8.10, 11.4): "Use my current location" or a
 * search with suggestions to tap (DECISIONS #147). Coordinates stay on this phone; for Home, the weather location is set
 * to it rounded to about 1 km.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Crosshair, MapPin } from 'lucide-react-native';
import type { PlaceType } from '@emolens/shared';
import { addPlace, clearPlaceLocation, deletePlace, setPlaceLocation, updatePlace } from '../../src/db/repo/logs';
import { one } from '../../src/db/types';
import { PLACE_TYPES, type PlaceRow } from '../../src/db/rows';
import { refreshNow } from '../../src/integrations/appRefresh';
import { currentCoords, requestLocation } from '../../src/integrations/location';
import type { PlaceSuggestion } from '../../src/integrations/placeSearch';
import { openPhoneSettings } from '../../src/integrations/enable';
import { afterSave } from '../../src/lib/save';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { PlaceSearch } from '../../src/ui/PlaceSearch';
import { Segmented } from '../../src/ui/Segmented';
import { toast } from '../../src/ui/Toast';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

const RADII = [100, 150, 300];

export default function PlaceEdit() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile } = useReady();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<PlaceType>('home');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(150);
  const [finding, setFinding] = useState(false);
  const settings = useSession((s) => s.settings);
  const near = settings.weather_lat != null && settings.weather_lon != null ? { latitude: settings.weather_lat, longitude: settings.weather_lon } : null;

  useEffect(() => {
    if (!id) return;
    void one<PlaceRow>(repo.db, 'SELECT * FROM places WHERE id = ?', [id]).then((p) => {
      if (!p) return;
      setLabel(p.label); setType(p.type);
      if (p.latitude != null && p.longitude != null) setCoords({ latitude: p.latitude, longitude: p.longitude });
      if (p.radius_m) setRadius(p.radius_m);
    });
  }, [id, repo]);

  const useHere = async () => {
    setFinding(true);
    try {
      const perm = await requestLocation();
      if (!perm.foreground) { toast(t('places.locationDenied'), { label: t('sources.openSettings'), onPress: openPhoneSettings }); return; }
      const here = await currentCoords();
      if (here) { setCoords(here); toast(t('places.locationFound')); }
    } catch { toast(t('places.locationFailed')); } finally { setFinding(false); }
  };
  /** A tapped suggestion sets the map location; a new, still unnamed place also takes its name and likely kind. */
  const pick = (s: PlaceSuggestion) => {
    setCoords({ latitude: s.latitude, longitude: s.longitude });
    if (!id && !label.trim()) { setLabel(s.title); if (s.type) setType(s.type); }
    toast(t('places.locationFound'));
  };

  const save = async () => {
    let placeId = id;
    if (id) await updatePlace(repo, id, { label, type });
    else placeId = await addPlace(repo, profile.id, { label, type });
    const row = placeId ? await one<PlaceRow>(repo.db, 'SELECT * FROM places WHERE id = ?', [placeId]) : null;
    if (row && coords) await setPlaceLocation(repo, row, coords.latitude, coords.longitude, radius);
    else if (row && !coords && row.latitude != null) await clearPlaceLocation(repo, row);
    afterSave(t('common.saved'));
    void refreshNow({ only: ['location', 'weather'] });
    router.back();
  };
  const remove = async () => { if (id) { await deletePlace(repo, id); afterSave(t('places.removed')); void refreshNow({ only: ['location'] }); router.back(); } };

  return (
    <Sheet title={id ? t('places.editTitle') : t('places.addTitle')} footer={
      <>
        <Button label={t('common.save')} onPress={() => void save()} disabled={!label.trim()} />
        {id ? <Button variant="ghost" label={t('common.remove')} onPress={() => void remove()} /> : null}
      </>
    }>
      <Field label={t('places.label')}>
        <Input label={t('places.label')} value={label} onChangeText={setLabel} placeholder={t('places.labelPlaceholder')} autoFocus={!id} />
      </Field>
      <Field label={t('places.type')}>
        <ChipGroup>
          {PLACE_TYPES.map((pt) => <Chip key={pt} label={t(`places.types.${pt}`)} selected={type === pt} onPress={() => setType(pt)} />)}
        </ChipGroup>
      </Field>
      <Field label={t('places.mapLocation')} optional={t('common.optional')} hint={t('places.mapHint')}>
        <View style={{ gap: space.sm }}>
          <Card tone="soft" style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <MapPin size={18} color={accent.place} />
            <T variant="callout" style={{ flex: 1 }}>{coords ? t('places.locationSet') : t('places.locationNotSet')}</T>
          </Card>
          <Button variant="secondary" icon={Crosshair} label={t('places.useHere')} loading={finding} onPress={() => void useHere()} />
          <PlaceSearch onSelect={pick} near={near} />
          {coords ? (
            <>
              <T variant="footnote" color="muted">{t('places.radius')}</T>
              <Segmented<number> value={radius} onChange={setRadius} options={RADII.map((r) => ({ value: r, label: t('places.meters', { n: r }) }))} />
              <Button small variant="ghost" label={t('places.clearLocation')} onPress={() => setCoords(null)} />
            </>
          ) : null}
        </View>
      </Field>
      <T variant="footnote" color="muted">{t('places.searchNote')}</T>
      <T variant="footnote" color="muted">{t('places.privacy')}</T>
    </Sheet>
  );
}
