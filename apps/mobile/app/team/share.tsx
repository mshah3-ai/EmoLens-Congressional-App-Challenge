/**
 * Create a read-only report link (SPEC 9.8, 24.3): the date range, who it's for (the same audiences as the PDF report;
 * School leaves out medications, sleep and places outside school), which caregiver notes to include, and 7 or 30 days.
 */
import { useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react-native';
import { addDays, localDateOf } from '@emolens/engine';
import { cloudApi } from '../../src/cloud/current';
import { todayIn } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { AUDIENCES, notesInRange, type Audience } from '../../src/reports/data';
import { dateYearAt, dateYearIn, shortDateIn } from '@emolens/reports';
import { createShareLink, type ShareDays } from '../../src/sync/share';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { RowGroup, Section, ToggleRow } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { Segmented } from '../../src/ui/Segmented';
import { T } from '../../src/ui/Text';
import { toast } from '../../src/ui/Toast';
import { space } from '../../src/ui/theme';

type Preset = '14' | '30' | '90';

export default function NewShareLink() {
  const { t } = useTranslation();
  const { repo, profile } = useReady();
  const lang = useSession((s) => s.settings.language);
  const bump = useSession((s) => s.bump);
  const today = todayIn(profile.homeTz);
  const [preset, setPreset] = useState<Preset>('30');
  const [audience, setAudience] = useState<Audience>('clinician');
  const [days, setDays] = useState<ShareDays>(7);
  const [schoolOnly, setSchoolOnly] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const range = { from: addDays(today, -(Number(preset) - 1)), to: today };
  const { data: notes } = useDbQuery(() => notesInRange(repo.db, profile, range.from, range.to), [range.from, range.to], []);

  const create = async () => {
    const api = cloudApi();
    if (!api) return;
    setBusy(true);
    try {
      const r = await createShareLink(repo.db, api, profile, { ...range, audience, days, noteIds: picked.filter((id) => notes.some((n) => n.id === id)), lang, schoolOnly });
      if ('error' in r) { toast(t('share.createFailed')); return; }
      setMade(r);
      bump();
    } finally { setBusy(false); }
  };

  if (made) {
    return (
      <Sheet title={t('share.readyTitle')} testID="share-ready">
        <Card style={{ gap: space.md }}>
          <T variant="body">{t('share.readyBody', { date: dateYearAt(lang, Date.parse(made.expiresAt), profile.homeTz) })}</T>
          <T variant="callout" selectable testID="share-url">{made.url}</T>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button label={t('share.share')} icon={Link2} onPress={() => void Share.share({ message: made.url })} />
            <Button variant="secondary" label={t('share.copy')} onPress={() => void Clipboard.setStringAsync(made.url).then(() => toast(t('share.copied')))} />
          </View>
        </Card>
        <T variant="footnote" color="muted">{t('share.privacyNote')}</T>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('share.newTitle')} testID="share-new"
      footer={<Button label={t('share.createButton')} icon={Link2} loading={busy} onPress={() => void create()} testID="share-submit" />}>
      <Section title={t('reports.range')}>
        <Segmented<Preset> testIDPrefix="share-range" value={preset} onChange={setPreset} options={[
          { value: '14', label: t('reports.preset14') }, { value: '30', label: t('reports.preset30') }, { value: '90', label: t('reports.preset90') },
        ]} />
        <T variant="footnote" color="muted">{`${dateYearIn(lang, range.from)} – ${dateYearIn(lang, range.to)}`}</T>
      </Section>
      <Section title={t('reports.audience')}>
        <Segmented<Audience> testIDPrefix="share-audience" value={audience} onChange={setAudience}
          options={AUDIENCES.map((a) => ({ value: a, label: t(`report.audience.${a}`) }))} />
        <T variant="callout">{t(`reports.audienceHint.${audience}`)}</T>
        {audience === 'school' ? (
          <RowGroup>
            <ToggleRow testID="share-school-only" title={t('reports.schoolOnly')} subtitle={t('reports.schoolOnlyHint')} value={schoolOnly} onChange={setSchoolOnly} />
          </RowGroup>
        ) : null}
      </Section>
      <Section title={t('share.expiry')}>
        <Segmented<ShareDays> testIDPrefix="share-days" value={days} onChange={setDays}
          options={[{ value: 7, label: t('share.days7') }, { value: 30, label: t('share.days30') }]} />
      </Section>
      <Section title={t('reports.notes')}>
        {notes.length ? (
          <ChipGroup>
            {notes.map((n) => {
              const on = picked.includes(n.id);
              return <Chip key={n.id} selected={on} label={`${shortDateIn(lang, localDateOf(n.at, profile.homeTz))}: ${n.text.length > 40 ? `${n.text.slice(0, 40)}…` : n.text}`}
                onPress={() => setPicked((p) => (on ? p.filter((x) => x !== n.id) : [...p, n.id]))} />;
            })}
          </ChipGroup>
        ) : <T variant="callout" color="muted">{t('reports.notesNone')}</T>}
      </Section>
      <T variant="footnote" color="muted">{t('share.privacyNote')}</T>
    </Sheet>
  );
}
