/**
 * Shown after the owner removed this person from the care team (SPEC 23.3, 27.4). By the time it appears, this
 * phone's copy of the family's data has already been deleted and the account signed out: a removed member can't keep
 * the child's data, whatever their role (DECISIONS #118). Only the child's nickname is kept, for this message, until
 * the person taps OK.
 */
import { useTranslation } from 'react-i18next';
import { UserX } from 'lucide-react-native';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/layout';
import { EmptyState } from '../../ui/bits';

export function RemovedScreen() {
  const { t } = useTranslation();
  const name = useSession((s) => s.removedNotice?.name ?? '');
  const dismiss = useSession((s) => s.dismissRemovedNotice);
  return (
    <Screen title={t('removed.title')} testID="removed-screen">
      <EmptyState icon={UserX} title={name ? t('removed.heading', { name }) : t('removed.headingNoName')} body={t('removed.body')} />
      <Button label={t('removed.ok')} testID="removed-ok" onPress={() => void dismiss()} />
    </Screen>
  );
}
