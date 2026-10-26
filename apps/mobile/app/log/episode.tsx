/**
 * Log a hard moment (SPEC 10.1).
 * Fast path (2 taps from Today): the FAB opens this sheet with the most-used type and time = now already set;
 * "Save now, add details later" saves right away and schedules a reminder 45 minutes later.
 * The full form below it is optional. If "Someone was hurt or at risk" is on, the Safety Card appears after saving.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Mic, ShieldAlert, Zap } from 'lucide-react-native';
import { ANTECEDENT_TAGS, BEHAVIOR_TAGS, type EpisodeType } from '@emolens/shared';
import { episodeStrategyUses, getEpisode, logEpisode, mostUsedType, updateEpisode, type DuringOutcome, type EpisodeInput } from '../../src/db/repo/episodes';
import { recordError } from '../../src/db/repo/errors';
import { currentVisit, listPlaces } from '../../src/db/repo/logs';
import { listStrategies } from '../../src/db/repo/strategies';
import { parseJson, type PlaceRow, type StrategyRow } from '../../src/db/rows';
import { nowIso } from '../../src/db/time';
import { fmtTime } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { cancelDetailsReminder, scheduleDetailsReminder } from '../../src/notifications';
import { useSoundCheck } from '../../src/integrations/useSoundCheck';
import { useReady } from '../../src/store/session';
import { toggle } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { Scale } from '../../src/ui/Scale';
import { Segmented } from '../../src/ui/Segmented';
import { TimeField } from '../../src/ui/TimeField';
import { toast } from '../../src/ui/Toast';
import { IconCircle, RowGroup, ToggleRow } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

const DURATIONS = [5, 15, 30, 60];
const TYPES: EpisodeType[] = ['meltdown', 'shutdown', 'other'];
const SOMEWHERE_ELSE = '__else__';

export default function EpisodeSheet() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { id, at } = useLocalSearchParams<{ id?: string; at?: string }>();
  const { repo, profile, tz, settings } = useReady();
  const editing = !!id;
  // SPEC 11.6: while logging a new hard moment, measure room sound for 60 s (only if the microphone was already allowed).
  const sound = useSoundCheck();
  const runSound = sound.run;
  useEffect(() => {
    if (!editing && settings.sound_check_on_episode && settings.integration_state.sound?.enabled) void runSound(60, { askPermission: false });
  }, [editing, settings.sound_check_on_episode, settings.integration_state.sound?.enabled, runSound]);

  const [type, setType] = useState<EpisodeType>(profile.modeledEpisodeTypes[0] ?? 'meltdown');
  const [startedAt, setStartedAt] = useState(at ?? nowIso());
  const [previousStart, setPreviousStart] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState('');
  const [intensity, setIntensity] = useState<number | null>(null);
  const [placeKey, setPlaceKey] = useState<string | null>(null);
  const [antecedents, setAntecedents] = useState<string[]>([]);
  const [antecedentNote, setAntecedentNote] = useState('');
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [helped, setHelped] = useState<Record<string, DuringOutcome>>({});
  const [safety, setSafety] = useState(false);
  const [notes, setNotes] = useState('');
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [safetyCard, setSafetyCard] = useState(false);

  useEffect(() => {
    void (async () => {
      const [pl, st] = await Promise.all([listPlaces(repo.db, profile.id), listStrategies(repo.db, profile.id)]);
      setPlaces(pl);
      setStrategies(st);
      if (id) {
        const e = await getEpisode(repo.db, id);
        if (!e) return;
        setType(e.type); setStartedAt(e.started_at); setPreviousStart(e.started_at); setIntensity(e.intensity);
        if (e.duration_min != null) { if (DURATIONS.includes(e.duration_min)) setDuration(e.duration_min); else setCustomDuration(String(e.duration_min)); }
        setPlaceKey(e.place_id ?? (e.place_type ? SOMEWHERE_ELSE : null));
        setAntecedents(parseJson<string[]>(e.antecedent_tags, [])); setAntecedentNote(e.antecedent_note ?? '');
        setBehaviors(parseJson<string[]>(e.behavior_tags, [])); setSafety(!!e.safety_concern); setNotes(e.notes ?? '');
        const uses = await episodeStrategyUses(repo.db, id);
        setHelped(Object.fromEntries(uses.map((u) => [u.strategy_id, u.outcome as DuringOutcome])));
      } else {
        setType(await mostUsedType(repo.db, profile));
        const v = await currentVisit(repo.db, profile.id); // "Where" auto-fills from the current place visit
        if (v) setPlaceKey(v.place_id ?? SOMEWHERE_ELSE);
      }
    })();
  }, [id, repo, profile]);

  const input = (detailsComplete: boolean): EpisodeInput => {
    const place = places.find((p) => p.id === placeKey) ?? null;
    const custom = Number(customDuration);
    return {
      type, startedAt,
      durationMin: duration ?? (customDuration && custom > 0 ? Math.round(custom) : null),
      intensity: detailsComplete ? (intensity ?? 3) : intensity,
      placeId: place?.id ?? null,
      placeType: place?.type ?? (placeKey === SOMEWHERE_ELSE ? 'away_untagged' : null),
      antecedentTags: antecedents, antecedentNote: antecedentNote.trim() || null, behaviorTags: behaviors,
      safetyConcern: safety, notes: notes.trim() || null, detailsComplete, source: 'manual',
      strategies: Object.entries(helped).map(([strategyId, outcome]) => ({ strategyId, outcome })),
    };
  };

  const finish = (message: string) => {
    afterSave(message);
    if (safety) setSafetyCard(true);
    else router.back();
  };

  const saveFast = async () => {
    setSaving(true);
    try {
      const newId = await logEpisode(repo, profile, input(false));
      await scheduleDetailsReminder(newId, fmtTime(startedAt, tz)).catch(() => undefined);
      finish(t('episode.savedFast'));
    } catch (e) { await recordError(repo.db, 'episode', e); toast(t('errors.saveFailed')); setSaving(false); }
  };

  const saveFull = async () => {
    setSaving(true);
    try {
      if (id) {
        await updateEpisode(repo, profile, id, input(true), previousStart ?? startedAt);
        await cancelDetailsReminder(id).catch(() => undefined);
      } else {
        await logEpisode(repo, profile, input(true));
      }
      finish(t('common.savedThanks'));
    } catch (e) { await recordError(repo.db, 'episode', e); toast(t('errors.saveFailed')); setSaving(false); }
  };

  if (safetyCard) {
    return (
      <Sheet title={t('episode.safetyTitle')} footer={<Button label={t('common.done')} onPress={() => router.back()} />}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <IconCircle icon={ShieldAlert} color={c.danger} />
            <T variant="headline" style={{ flex: 1 }}>{t('episode.safetyHeadline')}</T>
          </View>
          <T variant="body">{t('episode.safetyBody')}</T>
        </Card>
        <Button variant="secondary" label={t('episode.followUp')} onPress={() => router.replace('/log/note')} />
      </Sheet>
    );
  }

  const outcomeOptions = [
    { value: 'helped' as const, label: t('episode.outcome.helped') },
    { value: 'not_helped' as const, label: t('episode.outcome.not_helped') },
    { value: 'unsure' as const, label: t('episode.outcome.unsure') },
  ];

  return (
    <Sheet testID="episode-sheet" title={editing ? t('episode.editTitle') : t('episode.title')}
      footer={<Button testID="episode-save" label={editing ? t('common.save') : t('episode.saveWithDetails')} onPress={() => void saveFull()} loading={saving && editing} disabled={saving} />}>
      <Segmented<EpisodeType> testIDPrefix="episode-type" value={type} onChange={setType} options={TYPES.map((k) => ({ value: k, label: t(`episode.types.${k}`) }))} />
      {!editing ? (
        <View style={{ gap: space.sm }}>
          <Button testID="episode-fast-save" icon={Zap} label={t('episode.saveFast')} hint={t('episode.saveFastHint')} onPress={() => void saveFast()} loading={saving} />
          <T variant="footnote" color="muted" center>{t('episode.saveFastHint')}</T>
        </View>
      ) : null}
      {!editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <T variant="footnote" color="muted">{t('episode.orDetails')}</T>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </View>
      ) : null}
      <Field label={t('episode.started')}>
        <TimeField label={t('episode.started')} value={startedAt} onChange={setStartedAt} tz={tz} />
      </Field>
      <Field label={t('episode.duration')} optional={t('common.optional')}>
        <View style={{ gap: space.sm }}>
          <ChipGroup>
            {DURATIONS.map((d) => <Chip key={d} label={t('common.minutes', { count: d })} selected={duration === d} onPress={() => { setDuration(duration === d ? null : d); setCustomDuration(''); }} />)}
          </ChipGroup>
          <Input label={t('episode.customMinutes')} placeholder={t('episode.customMinutes')} keyboardType="number-pad" value={customDuration}
            onChangeText={(s) => { setCustomDuration(s.replace(/\D/g, '')); setDuration(null); }} />
        </View>
      </Field>
      <Field label={t('episode.intensityLabel')} optional={t('common.optional')}>
        <Scale label={t('episode.intensityLabel')} labels={[1, 2, 3, 4, 5].map((n) => t(`episode.intensity.${n}`))} value={intensity} onChange={setIntensity} testIDPrefix="intensity" />
      </Field>
      <Field label={t('episode.where')} optional={t('common.optional')}>
        <ChipGroup>
          {places.map((p) => <Chip key={p.id} label={p.label} selected={placeKey === p.id} onPress={() => setPlaceKey(placeKey === p.id ? null : p.id)} />)}
          <Chip label={t('episode.somewhereElse')} selected={placeKey === SOMEWHERE_ELSE} onPress={() => setPlaceKey(placeKey === SOMEWHERE_ELSE ? null : SOMEWHERE_ELSE)} />
        </ChipGroup>
      </Field>
      <Field label={t('episode.before')} optional={t('common.optional')}>
        <View style={{ gap: space.sm }}>
          <ChipGroup>
            {ANTECEDENT_TAGS.map((k) => <Chip key={k} label={t(`tags.antecedent.${k}`)} selected={antecedents.includes(k)} onPress={() => setAntecedents(toggle(antecedents, k))} />)}
          </ChipGroup>
          <Input label={t('episode.beforeNote')} placeholder={t('episode.beforeNote')} value={antecedentNote} onChangeText={setAntecedentNote} />
        </View>
      </Field>
      <Field label={t('episode.lookedLike')} optional={t('common.optional')}>
        <ChipGroup>
          {BEHAVIOR_TAGS.map((k) => <Chip key={k} label={t(`tags.behavior.${k}`)} selected={behaviors.includes(k)} onPress={() => setBehaviors(toggle(behaviors, k))} />)}
        </ChipGroup>
      </Field>
      <Field label={t('episode.whatHelped')} optional={t('common.optional')}>
        <View style={{ gap: space.md }}>
          <ChipGroup>
            {strategies.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id in helped}
                onPress={() => setHelped((h) => { const n = { ...h }; if (s.id in n) delete n[s.id]; else n[s.id] = 'helped'; return n; })} />
            ))}
          </ChipGroup>
          {strategies.filter((s) => s.id in helped).map((s) => (
            <View key={s.id} style={{ gap: space.xs }}>
              <T variant="callout" weight="600">{s.name}</T>
              <Segmented value={helped[s.id]} onChange={(o) => setHelped((h) => ({ ...h, [s.id]: o }))} options={outcomeOptions} />
            </View>
          ))}
        </View>
      </Field>
      <RowGroup>
        <ToggleRow testID="episode-safety" title={t('episode.safety')} subtitle={t('episode.safetyHint')} value={safety} onChange={setSafety} />
      </RowGroup>
      <Field label={t('common.notes')} optional={t('common.optional')}>
        <Input label={t('common.notes')} value={notes} onChangeText={setNotes} multiline />
      </Field>
      {sound.state.phase === 'measuring' ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Mic size={14} color={accent.meal} />
          <T variant="footnote" color="muted" style={{ flex: 1 }} accessibilityLiveRegion="polite">{t('sound.onEpisode')}</T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Zap size={14} color={accent.episode} />
        <T variant="footnote" color="muted" style={{ flex: 1 }}>{t('episode.noPhotos')}</T>
      </View>
    </Sheet>
  );
}
