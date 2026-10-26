/**
 * Strategies (SPEC 9.6, 17): two tabs, "Before a hard moment" (proactive: averted / not averted) and "During a hard
 * moment" (helped / didn't help). Each row: "Helped 6 of 7 times", the Beta(1 + s, 1 + f) posterior mean with its 80%
 * interval (engine math), and when it was last used. "Help me discover what works" switches Today's ideas to Thompson
 * sampling. Strategies can be added, renamed and archived (archived ones keep their history).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, Pencil } from 'lucide-react-native';
import type { StrategyContext } from '@emolens/shared';
import { addStrategy, archiveStrategy, renameStrategy } from '../../../src/db/repo/strategies';
import { useStrategyView } from '../../../src/forecast/useForecast';
import { fmtAgo } from '../../../src/i18n/format';
import { afterSave } from '../../../src/lib/save';
import { useReady, useSession } from '../../../src/store/session';
import { Button } from '../../../src/ui/Button';
import { Card } from '../../../src/ui/Card';
import { IntervalBar } from '../../../src/ui/charts';
import { Input } from '../../../src/ui/Field';
import { Pill, RowGroup, ToggleRow } from '../../../src/ui/bits';
import { Screen } from '../../../src/ui/layout';
import { Segmented } from '../../../src/ui/Segmented';
import { T } from '../../../src/ui/Text';
import { space, useTheme } from '../../../src/ui/theme';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function Strategies() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, profile, settings } = useReady();
  const updateSettings = useSession((s) => s.updateSettings);
  const view = useStrategyView();
  const [ctx, setCtx] = useState<StrategyContext>('proactive');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState('');

  const rows = (view?.rows ?? []).filter((r) => r.active).map((r) => ({ row: r, stat: view?.stats.find((s) => s.strategyId === r.id && s.context === ctx) }))
    .sort((a, b) => (b.stat?.uses ? 1 : 0) - (a.stat?.uses ? 1 : 0) || (b.stat?.mean ?? 0) - (a.stat?.mean ?? 0) || a.row.name.localeCompare(b.row.name));
  const anyUsed = rows.some((r) => r.stat?.uses);

  return (
    <Screen back title={t('strategies.title')} subtitle={t('strategies.subtitle')}>
      <Segmented testIDPrefix="strategies-tab" value={ctx} onChange={setCtx}
        options={[{ value: 'proactive', label: t('strategies.before') }, { value: 'during', label: t('strategies.during') }]} />
      <RowGroup>
        <ToggleRow testID="discover-toggle" title={t('strategies.discover')} subtitle={t('strategies.discoverSub')} value={settings.strategy_discovery}
          onChange={(v) => void updateSettings({ strategy_discovery: v })} />
      </RowGroup>
      {!anyUsed ? <T variant="callout" color="muted" testID="strategies-empty">{t(ctx === 'proactive' ? 'strategies.emptyBefore' : 'strategies.emptyDuring')}</T> : null}
      <View style={{ gap: space.sm }}>
        {rows.map(({ row, stat }) => (
          <Card key={row.id} style={{ gap: space.sm }}>
            {editing === row.id ? (
              <View style={{ gap: space.sm }}>
                <Input label={t('strategies.rename')} value={name} onChangeText={setName} autoFocus />
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Button small icon={Check} label={t('common.save')} disabled={!name.trim()} onPress={async () => { await renameStrategy(repo, row.id, name); setEditing(null); afterSave(); }} />
                  <Button small variant="secondary" label={t('strategies.archive')} onPress={async () => { await archiveStrategy(repo, row.id); setEditing(null); afterSave(t('strategies.archived')); }} />
                  <Button small variant="ghost" label={t('common.cancel')} onPress={() => setEditing(null)} />
                </View>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <T variant="headline" style={{ flex: 1 }}>{row.name}</T>
                  <Button small variant="ghost" icon={Pencil} label={t('strategies.edit')} onPress={() => { setEditing(row.id); setName(row.name); }} />
                </View>
                {row.onboarding_favorite ? <Pill label={t('strategies.favorite')} /> : null}
                {stat && stat.uses > 0 ? (
                  <>
                    <T variant="callout">{t('strategies.helped', { s: stat.successes, count: stat.uses })}</T>
                    <IntervalBar mean={stat.mean} lo={stat.lo80} hi={stat.hi80}
                      label={t('strategies.barLabel', { mean: pct(stat.mean), lo: pct(stat.lo80), hi: pct(stat.hi80) })} />
                    {stat.lastUsed ? <T variant="footnote" color="muted">{t('strategies.lastUsed', { when: fmtAgo(new Date(stat.lastUsed).toISOString()) })}</T> : null}
                  </>
                ) : <T variant="footnote" color="muted">{t('strategies.notTried')}</T>}
              </>
            )}
          </Card>
        ))}
      </View>
      <T variant="footnote" color="muted" style={{ color: c.textMuted }}>{t('strategies.caveat')}</T>
      <Card style={{ gap: space.sm }}>
        <Input label={t('strategies.add')} placeholder={t('strategies.addPlaceholder')} value={adding} onChangeText={setAdding} />
        <Button small label={t('strategies.add')} disabled={!adding.trim()} onPress={async () => { await addStrategy(repo, profile.id, adding); setAdding(''); afterSave(); }} />
      </Card>
    </Screen>
  );
}
