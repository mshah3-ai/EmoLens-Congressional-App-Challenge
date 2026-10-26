/**
 * Sound check (SPEC 11.6): 30 seconds of measuring how loud the room is. Nothing is recorded or kept; only the average
 * "estimated loudness" is saved, with the place the child is at.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Mic, ShieldCheck } from 'lucide-react-native';
import { openPhoneSettings } from '../../src/integrations/enable';
import { loudnessWord } from '../../src/integrations/sound';
import { useSoundCheck } from '../../src/integrations/useSoundCheck';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { IconCircle, ProgressBar } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

const SECONDS = 30;

export default function SoundSheet() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { state, run } = useSoundCheck();
  useEffect(() => { void run(SECONDS, { askPermission: true }); }, [run]);

  return (
    <Sheet title={t('sound.title')} footer={<Button label={t('common.done')} onPress={() => router.back()} />}>
      <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
        <IconCircle icon={Mic} color={accent.meal} size={64} />
        {state.phase === 'measuring' ? (
          <>
            <T variant="display" accessibilityLiveRegion="polite">{state.current != null ? t('sound.db', { db: Math.round(state.current) }) : '…'}</T>
            <T variant="callout" color="muted">{t('sound.listening', { count: state.secondsLeft, s: state.secondsLeft })}</T>
            <View style={{ alignSelf: 'stretch' }}><ProgressBar value={1 - state.secondsLeft / SECONDS} label={t('sound.progress')} /></View>
          </>
        ) : state.phase === 'done' ? (
          <>
            <T variant="display">{t('sound.db', { db: Math.round(state.levelDb) })}</T>
            <T variant="headline">{t(`sound.words.${loudnessWord(state.levelDb)}`)}</T>
            <T variant="callout" color="muted" center>{t('sound.saved')}</T>
          </>
        ) : state.phase === 'no_permission' ? (
          <>
            <T variant="headline" center>{t('sound.noPermission')}</T>
            <Button small variant="secondary" label={t('sources.openSettings')} onPress={openPhoneSettings} />
          </>
        ) : state.phase === 'failed' || state.phase === 'stopped' ? (
          <>
            <T variant="headline" center accessibilityLiveRegion="polite" testID={`sound-${state.phase}`}>{t(`sound.${state.phase}`)}</T>
            <Button small variant="secondary" label={t('sound.again')} onPress={() => void run(SECONDS, { askPermission: true })} testID="sound-again" />
          </>
        ) : <T variant="callout" color="muted">{t('sound.starting')}</T>}
      </Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <ShieldCheck size={16} color={accent.place} />
        <T variant="footnote" color="muted" style={{ flex: 1 }}>{t('sound.privacy')}</T>
      </View>
      <T variant="footnote" color="muted">{t('sound.estimate')}</T>
    </Sheet>
  );
}
