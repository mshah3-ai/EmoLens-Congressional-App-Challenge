/**
 * Data source chips on Today (SPEC 9.2): "Weather ✓", "Calendar ⚠ needs permission"... Warnings never block logging
 * (SPEC 29). Tap any chip to open Data sources.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Plug, TriangleAlert } from 'lucide-react-native';
import { INTEGRATIONS } from '../../integrations/registry';
import { isWarning } from '../../integrations/status';
import { useIntegrationStatuses } from '../../integrations/useStatuses';
import { T } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';
import { SOURCES } from '../sources';

export function SourceChips() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const statuses = useIntegrationStatuses();
  if (!statuses) return null;
  const shown = INTEGRATIONS.filter((i) => statuses[i.id].health !== 'off' && statuses[i.id].health !== 'unavailable');
  const go = () => router.push('/settings/data-sources');
  if (!shown.length) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('sources.connectCta')} onPress={go} style={[styles.chip, { borderColor: c.border, backgroundColor: c.surface }]}>
        <Plug size={16} color={c.primary} />
        <T variant="footnote" weight="600">{t('sources.connectCta')}</T>
      </Pressable>
    );
  }
  return (
    <View style={styles.row}>
      {shown.map((i) => {
        const st = statuses[i.id];
        const warn = isWarning(st);
        const label = `${t(SOURCES[i.id].titleKey)}${warn ? ` · ${t(`sources.status.${st.health}`)}` : ''}`;
        return (
          <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={label} onPress={go}
            style={[styles.chip, { borderColor: warn ? c.riskModerate : c.border, backgroundColor: c.surface }]}>
            {warn ? <TriangleAlert size={16} color={c.riskModerate} /> : <CircleCheck size={16} color={c.riskLow} />}
            <T variant="footnote" weight="600">{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.chip, borderWidth: 1, alignSelf: 'flex-start' },
});
