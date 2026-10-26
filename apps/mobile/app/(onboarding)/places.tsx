/**
 * Step 10: Places (SPEC 8.10). Tag places by name and type, then "Whose phone tracks where your child is?".
 * Home's map location can be set from the current position or a search with suggestions to tap (DECISIONS #147); the
 * coordinates are saved only on the phone.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Crosshair, MapPin, Plus, Smartphone, Tablet, Hand } from 'lucide-react-native';
import type { PlaceType } from '@emolens/shared';
import { PLACE_TYPES } from '../../src/db/rows';
import { currentCoords, requestForegroundLocation } from '../../src/integrations/location';
import { toast } from '../../src/ui/Toast';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { useOnboarding } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { PlaceSearch } from '../../src/ui/PlaceSearch';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Places() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const places = useOnboarding((s) => s.draft.places);
  const tracking = useOnboarding((s) => s.draft.locationTracking);
  const set = useOnboarding((s) => s.set);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<PlaceType>('other');
  const suggestions: { label: string; type: PlaceType }[] = [
    { label: t('places.suggest.home'), type: 'home' }, { label: t('places.suggest.school'), type: 'school' },
    { label: t('places.suggest.therapy'), type: 'therapy' }, { label: t('places.suggest.grandparents'), type: 'relative' },
  ];
  const has = (l: string) => places.some((p) => p.label === l);
  const togglePlace = (p: { label: string; type: PlaceType }) => set({ places: has(p.label) ? places.filter((x) => x.label !== p.label) : [...places, p] });
  const addCustom = () => { const l = label.trim(); if (l && !has(l)) set({ places: [...places, { label: l, type }] }); setLabel(''); setType('other'); };
  const next = () => router.push('/(onboarding)/connect');
  // SPEC 8.10: Home's location from the current position or an address (only "While Using" permission is asked here).
  const home = places.find((p) => p.type === 'home');
  const [finding, setFinding] = useState(false);
  const setHomeCoords = (c: { latitude: number; longitude: number }) =>
    set({ places: places.map((p) => (p.type === 'home' ? { ...p, latitude: c.latitude, longitude: c.longitude } : p)) });
  const locateHome = async () => {
    setFinding(true);
    try {
      if (!(await requestForegroundLocation())) { toast(t('places.locationDenied')); return; }
      const c = await currentCoords();
      if (c) { setHomeCoords(c); toast(t('places.locationFound')); }
    } catch { toast(t('places.locationFailed')); } finally { setFinding(false); }
  };

  return (
    <OnboardingFrame step={10} title={t('places.title')} subtitle={t('places.subtitle')} onNext={next} onSkip={next}>
      <ChipGroup>
        {suggestions.map((p) => <Chip key={p.type} icon={MapPin} label={p.label} selected={has(p.label)} onPress={() => togglePlace(p)} />)}
        {places.filter((p) => !suggestions.some((s) => s.label === p.label)).map((p) => (
          <Chip key={p.label} label={p.label} selected onPress={() => togglePlace(p)} />
        ))}
      </ChipGroup>
      <Field label={t('places.addOther')}>
        <View style={{ gap: space.sm }}>
          <Input label={t('places.label')} placeholder={t('places.labelPlaceholder')} value={label} onChangeText={setLabel} />
          <ChipGroup>
            {PLACE_TYPES.map((pt) => <Chip key={pt} label={t(`places.types.${pt}`)} selected={type === pt} onPress={() => setType(pt)} />)}
          </ChipGroup>
          <Button small variant="secondary" icon={Plus} label={t('places.add')} onPress={addCustom} disabled={!label.trim()} />
        </View>
      </Field>
      {home ? (
        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <MapPin size={18} color={accent.place} />
            <T variant="headline" style={{ flex: 1 }}>{t('places.homeLocation')}</T>
          </View>
          <T variant="callout" color="muted">{home.latitude != null ? t('places.locationSet') : t('places.homeLocationBody')}</T>
          <Button small variant="secondary" icon={Crosshair} label={t('places.useHere')} loading={finding} onPress={() => void locateHome()} />
          <PlaceSearch testID="home-search" onSelect={(s) => { setHomeCoords(s); toast(t('places.locationFound')); }} />
          <T variant="footnote" color="muted">{t('places.searchNote')}</T>
        </Card>
      ) : null}
      <Card tone="soft"><T variant="callout">{t('places.privacy')}</T></Card>
      <View style={{ gap: space.md }}>
        <T variant="title" accessibilityRole="header">{t('places.whoseTitle')}</T>
        <ChoiceCard icon={Smartphone} color={accent.place} title={t('places.whose.my_phone')} body={t('places.whose.my_phoneBody')}
          selected={tracking === 'my_phone'} onPress={() => set({ locationTracking: 'my_phone' })} />
        <ChoiceCard icon={Tablet} color={accent.strategy} title={t('places.whose.child_device')} body={t('places.whose.child_deviceBody')}
          selected={tracking === 'child_device'} onPress={() => set({ locationTracking: 'child_device' })} />
        <ChoiceCard icon={Hand} color={accent.note} title={t('places.whose.manual')} body={t('places.whose.manualBody')}
          selected={tracking === 'manual'} onPress={() => set({ locationTracking: 'manual' })} />
      </View>
    </OnboardingFrame>
  );
}
