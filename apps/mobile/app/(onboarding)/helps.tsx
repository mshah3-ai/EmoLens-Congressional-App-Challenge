/** Step 8: What helps? Default strategies (Appendix B.1) + custom ones; picks become onboarding favorites. */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { DEFAULT_STRATEGIES } from '@emolens/shared';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { toggle, useOnboarding } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Input } from '../../src/ui/Field';
import { space } from '../../src/ui/theme';

export default function Helps() {
  const { t } = useTranslation();
  const lang = useOnboarding((s) => s.draft.language);
  const favs = useOnboarding((s) => s.draft.favoriteDefaults);
  const custom = useOnboarding((s) => s.draft.customStrategies);
  const set = useOnboarding((s) => s.set);
  const [text, setText] = useState('');
  const add = () => { const name = text.trim(); if (name && !custom.includes(name)) set({ customStrategies: [...custom, name] }); setText(''); };
  const next = () => router.push('/(onboarding)/meds');
  return (
    <OnboardingFrame step={8} title={t('helps.title')} subtitle={t('helps.subtitle')} onNext={next} onSkip={next}>
      <ChipGroup>
        {DEFAULT_STRATEGIES.map((s, i) => (
          <Chip key={i} label={s.name[lang]} selected={favs.includes(i)} onPress={() => set({ favoriteDefaults: toggle(favs, i) })} />
        ))}
        {custom.map((name) => (
          <Chip key={`c-${name}`} label={name} selected onPress={() => set({ customStrategies: custom.filter((x) => x !== name) })} />
        ))}
      </ChipGroup>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input label={t('helps.addCustom')} placeholder={t('helps.addCustomPlaceholder')} value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Button small variant="secondary" icon={Plus} label={t('common.add')} onPress={add} disabled={!text.trim()} />
      </View>
    </OnboardingFrame>
  );
}
