/** More → Places. Map pins and automatic arrivals come with Phase 4; coordinates never leave the phone. */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus } from 'lucide-react-native';
import { listPlaces } from '../../src/db/repo/logs';
import type { PlaceRow } from '../../src/db/rows';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState, ListRow, RowGroup } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

export default function Places() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile } = useReady();
  const { data: places } = useDbQuery<PlaceRow[]>(() => listPlaces(repo.db, profile.id), [profile.id], []);
  return (
    <Screen back title={t('more.places')}>
      <Button icon={Plus} label={t('places.add')} onPress={() => router.push('/settings/place')} />
      {places.length ? (
        <RowGroup>
          {places.map((p) => (
            <ListRow key={p.id} icon={MapPin} iconColor={accent.place} title={p.label} subtitle={t(`places.types.${p.type}`)}
              onPress={() => router.push({ pathname: '/settings/place', params: { id: p.id } })} />
          ))}
        </RowGroup>
      ) : <Card><EmptyState icon={MapPin} title={t('places.empty')} body={t('places.emptyBody')} /></Card>}
      <Card tone="soft"><T variant="callout">{t('places.privacy')}</T></Card>
    </Screen>
  );
}
