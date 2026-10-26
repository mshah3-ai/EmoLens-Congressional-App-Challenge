/**
 * "Today at school" for a teacher's phone (SPEC 7.1). A teacher's phone has too little data to forecast (no sleep,
 * medications or home data), so it shows the levels the family's forecasting phone shared for today's school hours,
 * without reasons (a reason could mention sleep or medications).
 */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RiskLevel } from '@emolens/shared';
import { fmtTime } from '../../i18n/format';
import { useDbQuery } from '../../lib/useDbQuery';
import { one } from '../../db/types';
import { useReady } from '../../store/session';
import { Card } from '../../ui/Card';
import { RiskBadge } from '../../ui/RiskBadge';
import { T } from '../../ui/Text';
import { space } from '../../ui/theme';

interface SchoolBlock { start: string; end: string; level: RiskLevel; }

export function SchoolCard({ today }: { today: string }) {
  const { t } = useTranslation();
  const { repo, profile, tz } = useReady();
  const { data } = useDbQuery(async () => {
    const r = await one<{ blocks_json: string }>(repo.db, 'SELECT blocks_json FROM school_forecasts WHERE child_id = ? AND local_date = ?', [profile.id, today]);
    return r ? JSON.parse(r.blocks_json) as SchoolBlock[] : null;
  }, [today], null);
  return (
    <Card style={{ gap: space.md }} testID="school-card">
      <T variant="headline" accessibilityRole="header">{t('school.title')}</T>
      {data?.length ? data.map((b) => (
        <View key={b.start} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <T variant="callout" style={{ flex: 1 }}>{`${fmtTime(b.start, tz)} – ${fmtTime(b.end, tz)}`}</T>
          <RiskBadge level={b.level} />
        </View>
      )) : <T variant="callout" color="muted">{t('school.none')}</T>}
      <T variant="footnote" color="muted">{t('school.note', { name: profile.nickname })}</T>
    </Card>
  );
}
