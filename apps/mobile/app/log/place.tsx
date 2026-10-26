/** Place check-in (SPEC 10.6): one tap per tagged place, or "Away / somewhere else". ?visitId=… edits a check-in. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation } from 'lucide-react-native';
import { checkIn, currentVisit, getVisit, listPlaces, updateVisit } from '../../src/db/repo/logs';
import type { PlaceRow, VisitRow } from '../../src/db/rows';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field } from '../../src/ui/Field';
import { TimeField } from '../../src/ui/TimeField';
import { EmptyState, ListRow, RowGroup } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function PlaceSheet() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const { visitId } = useLocalSearchParams<{ visitId?: string }>();
  const { repo, profile, tz } = useReady();
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [visit, setVisit] = useState<VisitRow | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [arrivedAt, setArrivedAt] = useState('');

  useEffect(() => {
    void (async () => {
      setPlaces(await listPlaces(repo.db, profile.id));
      const v = await currentVisit(repo.db, profile.id);
      setCurrent(v ? v.place_id : undefined);
      if (visitId) {
        const one = await getVisit(repo.db, visitId);
        if (one) { setVisit(one); setPlaceId(one.place_id); setArrivedAt(one.arrived_at); }
      }
    })();
  }, [repo, profile.id, visitId]);

  const go = async (p: PlaceRow | null) => {
    await checkIn(repo, profile.id, p);
    afterSave(t('places.checkedIn', { place: p?.label ?? t('places.away') }));
    router.back();
  };

  if (visit) {
    return (
      <Sheet title={t('places.editVisit')} footer={<Button label={t('common.save')} onPress={async () => {
        await updateVisit(repo, profile.id, visit.id, places.find((p) => p.id === placeId) ?? null, arrivedAt, visit.arrived_at);
        afterSave(); router.back();
      }} />}>
        <Field label={t('places.where')}>
          <ChipGroup>
            {places.map((p) => <Chip key={p.id} label={p.label} selected={placeId === p.id} onPress={() => setPlaceId(p.id)} />)}
            <Chip label={t('places.away')} selected={placeId == null} onPress={() => setPlaceId(null)} />
          </ChipGroup>
        </Field>
        <Field label={t('places.arrived')}>
          <TimeField label={t('places.arrived')} value={arrivedAt} onChange={setArrivedAt} tz={tz} />
        </Field>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('places.checkInTitle', { name: profile.nickname })}>
      {places.length ? (
        <RowGroup>
          {places.map((p) => (
            <ListRow key={p.id} icon={MapPin} iconColor={accent.place} title={p.label} subtitle={current === p.id ? t('places.here') : t(`places.types.${p.type}`)} onPress={() => void go(p)} />
          ))}
          <ListRow icon={Navigation} iconColor={c.textMuted} title={t('places.away')} subtitle={current === null ? t('places.here') : undefined} onPress={() => void go(null)} />
        </RowGroup>
      ) : (
        <Card><EmptyState icon={MapPin} title={t('places.empty')} body={t('places.emptyBody')}
          action={<Button small label={t('places.add')} onPress={() => router.replace('/settings/place')} />} /></Card>
      )}
      <View style={{ gap: space.sm }}>
        <T variant="footnote" color="muted">{t('places.checkInNote')}</T>
      </View>
    </Sheet>
  );
}
