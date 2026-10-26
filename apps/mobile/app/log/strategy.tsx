/**
 * Log a calming strategy tried before a hard moment (SPEC 10.2). Saved as a proactive use with outcome
 * "pending"; the recompute job then checks whether a hard moment followed within 90 minutes (forecast/recompute.ts).
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { addStrategy, getUse, listStrategies, logProactiveUse, updateUse } from '../../src/db/repo/strategies';
import type { StrategyRow } from '../../src/db/rows';
import { nowIso } from '../../src/db/time';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { TimeField } from '../../src/ui/TimeField';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function StrategySheet() {
  const { t } = useTranslation();
  // alertId: opened from "We're on it" on a heads-up notification; the use is linked to that alert (SPEC 15.1).
  const { id, alertId } = useLocalSearchParams<{ id?: string; alertId?: string }>();
  const { repo, profile, tz } = useReady();
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [usedAt, setUsedAt] = useState(nowIso());
  const [text, setText] = useState('');
  useEffect(() => {
    void listStrategies(repo.db, profile.id).then(setStrategies);
    if (!id) return;
    void getUse(repo.db, id).then((u) => { if (u) { setPicked(u.strategy_id); setUsedAt(u.used_at); } });
  }, [id, repo, profile.id]);
  const addNew = async () => {
    const name = text.trim();
    if (!name) return;
    const sid = await addStrategy(repo, profile.id, name);
    setStrategies(await listStrategies(repo.db, profile.id));
    setPicked(sid); setText('');
  };
  const save = async () => {
    if (!picked) return;
    if (id) await updateUse(repo, profile.id, id, picked, usedAt);
    else await logProactiveUse(repo, profile.id, picked, usedAt, alertId ?? null);
    afterSave(t('strategy.saved'));
    router.back();
  };
  return (
    <Sheet title={t('strategy.title')} footer={<Button label={t('common.save')} onPress={() => void save()} disabled={!picked} />}>
      <Card tone="soft"><T variant="callout">{t('strategy.intro')}</T></Card>
      <Field label={t('strategy.which')}>
        <ChipGroup>
          {strategies.map((s) => <Chip key={s.id} label={s.name} selected={picked === s.id} onPress={() => setPicked(s.id)} />)}
        </ChipGroup>
      </Field>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input label={t('strategy.addNew')} placeholder={t('strategy.addNew')} value={text} onChangeText={setText} onSubmitEditing={() => void addNew()} />
        </View>
        <Button small variant="secondary" icon={Plus} label={t('common.add')} onPress={() => void addNew()} disabled={!text.trim()} />
      </View>
      <Field label={t('strategy.when')}>
        <TimeField label={t('strategy.when')} value={usedAt} onChange={setUsedAt} tz={tz} />
      </Field>
    </Sheet>
  );
}
