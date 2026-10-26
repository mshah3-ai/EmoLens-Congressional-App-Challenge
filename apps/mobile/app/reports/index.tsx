/**
 * More → Reports & export (SPEC 22.1): pick a date range (2 weeks, 30 days, 90 days or custom) and who the report is
 * for (Clinician / School / Family: the list below shows which sections that includes), tick caregiver notes to add,
 * then share:
 *  - a PDF report (SPEC 22.2),
 *  - ABC data as a spreadsheet file (SPEC 22.3), for behavior specialists,
 *  - a FHIR health-record file (SPEC 22.4), with the nickname only if the parent switches it on.
 * Files go to the phone's share sheet; EmoLens uploads nothing itself.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarDays, FileHeart, FileSpreadsheet, FileText } from 'lucide-react-native';
import { addDays, localDateOf, rangeBounds } from '@emolens/engine';
import { recordError } from '../../src/db/repo/errors';
import { failureToastKey } from '../../src/lib/steps';
import { one } from '../../src/db/types';
import { iso } from '../../src/db/time';
import { todayIn } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { shareAbcCsv, shareFhirJson, shareReportPdf } from '../../src/reports/actions';
import { AUDIENCES, notesInRange, type Audience } from '../../src/reports/data';
import { dateYearIn, shortDateIn } from '@emolens/reports';
import { sectionsFor } from '@emolens/reports';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { ListRow, RowGroup, Section, ToggleRow } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { Segmented } from '../../src/ui/Segmented';
import { DateButton } from '../../src/ui/TimeField';
import { T } from '../../src/ui/Text';
import { toast } from '../../src/ui/Toast';
import { space, useTheme } from '../../src/ui/theme';

type Preset = '14' | '30' | '90' | 'custom';
type Busy = null | 'pdf' | 'csv' | 'fhir';

export default function Reports() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, profile } = useReady();
  const lang = useSession((s) => s.settings.language);
  const today = todayIn(profile.homeTz);
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const range = preset === 'custom'
    ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from })
    : { from: addDays(today, -(Number(preset) - 1)), to: today };
  const [audience, setAudience] = useState<Audience>('clinician');
  const [picked, setPicked] = useState<string[]>([]);
  const [withName, setWithName] = useState(false);
  const [schoolOnly, setSchoolOnly] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);

  const { data } = useDbQuery(async () => {
    const [a, b] = rangeBounds(range.from, range.to, profile.homeTz);
    const n = await one<{ n: number }>(repo.db, 'SELECT COUNT(*) AS n FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ?',
      [profile.id, iso(a), iso(b)]);
    return { episodes: n?.n ?? 0, notes: await notesInRange(repo.db, profile, range.from, range.to) };
  }, [range.from, range.to, profile.id], { episodes: 0, notes: [] });
  const noteIds = picked.filter((id) => data.notes.some((n) => n.id === id));

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); } catch (e) {
      await recordError(repo.db, `report.${kind}`, e);
      toast(t(failureToastKey(e)));
    } finally { setBusy(null); }
  };

  return (
    <Screen back title={t('reports.title')} subtitle={t('reports.subtitle', { name: profile.nickname })} testID="reports-screen">
      <Section title={t('reports.range')}>
        <Segmented<Preset> testIDPrefix="report-range" value={preset} onChange={setPreset} options={[
          { value: '14', label: t('reports.preset14') }, { value: '30', label: t('reports.preset30') },
          { value: '90', label: t('reports.preset90') }, { value: 'custom', label: t('reports.presetCustom') },
        ]} />
        {preset === 'custom' ? (
          <RowGroup>
            <ListRow title={t('reports.from')} value={dateYearIn(lang, custom.from)}
              right={<DateButton label={t('reports.from')} value={custom.from} onChange={(from) => setCustom((x) => ({ ...x, from }))} icon={<CalendarDays size={22} color={c.primary} />} />} />
            <ListRow title={t('reports.to')} value={dateYearIn(lang, custom.to)}
              right={<DateButton label={t('reports.to')} value={custom.to} onChange={(to) => setCustom((x) => ({ ...x, to }))} icon={<CalendarDays size={22} color={c.primary} />} />} />
          </RowGroup>
        ) : null}
        <T variant="footnote" color="muted" testID="report-range-text">
          {`${dateYearIn(lang, range.from)} – ${dateYearIn(lang, range.to)} · ${t('reports.episodesInRange', { count: data.episodes })}`}
        </T>
      </Section>

      {data.episodes === 0 ? (
        <Card tone="soft" testID="report-empty" style={{ gap: space.xs }}>
          <T variant="headline">{t('reports.empty')}</T>
          <T variant="callout" color="muted">{t('reports.emptyBody')}</T>
        </Card>
      ) : null}

      <Section title={t('reports.audience')}>
        <Segmented<Audience> testIDPrefix="report-audience" value={audience} onChange={setAudience}
          options={AUDIENCES.map((a) => ({ value: a, label: t(`report.audience.${a}`) }))} />
        <Card style={{ gap: space.xs }}>
          <T variant="callout">{t(`reports.audienceHint.${audience}`)}</T>
          <T variant="footnote" color="muted" testID="report-sections">
            {t('reports.includes', { list: sectionsFor(audience).map((s) => t(`reports.section.${s}`)).join(' · ') })}
          </T>
        </Card>
        {audience === 'school' ? (
          <RowGroup>
            <ToggleRow testID="report-school-only" title={t('reports.schoolOnly')} subtitle={t('reports.schoolOnlyHint')} value={schoolOnly} onChange={setSchoolOnly} />
          </RowGroup>
        ) : null}
      </Section>

      <Section title={t('reports.notes')}>
        {data.notes.length ? (
          <ChipGroup>
            {data.notes.map((n) => {
              const on = picked.includes(n.id);
              return (
                <Chip key={n.id} testID={`report-note-${n.id}`} selected={on}
                  label={`${shortDateIn(lang, localDateOf(n.at, profile.homeTz))}: ${n.text.length > 40 ? `${n.text.slice(0, 40)}…` : n.text}`}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== n.id) : [...p, n.id]))} />
              );
            })}
          </ChipGroup>
        ) : <T variant="callout" color="muted">{t('reports.notesNone')}</T>}
      </Section>

      <View style={{ gap: space.sm }}>
        <Button testID="report-pdf" icon={FileText} label={t('reports.pdf')} loading={busy === 'pdf'} disabled={busy != null}
          onPress={() => void run('pdf', () => shareReportPdf(repo.db, profile, lang, range, audience, noteIds, schoolOnly))} />
        <T variant="footnote" color="muted">{t('reports.pdfHint')}</T>
      </View>

      <Section title={t('reports.dataFiles')}>
        <Card style={{ gap: space.sm }}>
          <T variant="callout" color="muted">{t('reports.csvHint')}</T>
          <Button testID="report-csv" variant="secondary" icon={FileSpreadsheet} label={t('reports.csv')} loading={busy === 'csv'} disabled={busy != null}
            onPress={() => void run('csv', () => shareAbcCsv(repo.db, profile, lang, range))} />
        </Card>
        <Card style={{ gap: space.sm }}>
          <T variant="callout" color="muted">{t('reports.fhirHint')}</T>
          <RowGroup>
            <ToggleRow testID="report-fhir-name" title={t('reports.includeName', { name: profile.nickname })} subtitle={t('reports.includeNameHint')}
              value={withName} onChange={setWithName} />
          </RowGroup>
          <Button testID="report-fhir" variant="secondary" icon={FileHeart} label={t('reports.fhir')} loading={busy === 'fhir'} disabled={busy != null}
            onPress={() => void run('fhir', () => shareFhirJson(repo.db, profile, lang, range, withName))} />
        </Card>
        <T variant="footnote" color="muted">{t('reports.privacy')}</T>
      </Section>
    </Screen>
  );
}
