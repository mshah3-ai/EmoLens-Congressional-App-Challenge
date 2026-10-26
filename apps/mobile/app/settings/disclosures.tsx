/**
 * More → AI disclosure: a short, translated note about development debugging assistance and where
 * AI is used inside the app. The centralized project statement is in AIDisclosure.md.
 */
import { useTranslation } from 'react-i18next';
import { Card } from '../../src/ui/Card';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function Disclosures() {
  const { t } = useTranslation();
  return (
    <Screen back title={t('more.disclosure')}>
      <Card style={{ gap: space.sm }}>
        <T variant="headline" accessibilityRole="header">{t('disclosure.builtTitle')}</T>
        <T variant="callout">{t('disclosure.built1')}</T>
        <T variant="callout" color="muted">{t('disclosure.built2')}</T>
      </Card>
      <Card style={{ gap: space.sm }}>
        <T variant="headline" accessibilityRole="header">{t('disclosure.inAppTitle')}</T>
        <T variant="callout">{t('disclosure.inApp1')}</T>
        <T variant="callout" color="muted">{t('disclosure.inApp2')}</T>
      </Card>
    </Screen>
  );
}
