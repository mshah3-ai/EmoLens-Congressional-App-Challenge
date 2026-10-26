/** More → Language (English / Español, SPEC 28.3). */
import { useTranslation } from 'react-i18next';
import type { Lang } from '@emolens/shared';
import { useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { Segmented } from '../../src/ui/Segmented';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';

export default function Language() {
  const { t } = useTranslation();
  const lang = useSession((s) => s.settings.language);
  const update = useSession((s) => s.updateSettings);
  return (
    <Screen back title={t('more.language')}>
      <Segmented<Lang> value={lang} onChange={(language) => void update({ language })} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
      <Card tone="soft"><T variant="callout">{t('settings.languageNote')}</T></Card>
    </Screen>
  );
}
