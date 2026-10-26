/**
 * Ask EmoLens (SPEC 19.2 UI): chat bubbles, four suggested questions, copy, "Clear conversation", the disclaimer, and
 * under each answer "Based on N entries" (tap to see them; tapping one opens it). Answers come only from this phone's
 * data, read by the tools while the AI works (src/ai/ask.ts). With AI features off, it explains how to turn them on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Bot, ChevronDown, ChevronRight, Copy, Send, Trash2 } from 'lucide-react-native';
import { askEmoLens, clearConversations, latestConversationId, loadConversation, newConversationId, turnsOf, type ChatTurn } from '../../src/ai/ask';
import { toolEnvNow } from '../../src/ai/env';
import { useAiGate } from '../../src/ai/gate';
import { askErrorNotice, type AskNotice } from '../../src/ai/messages';
import { describeRefs, refRoute, type RefEntry } from '../../src/ai/refs';
import { fmtDayTime } from '../../src/i18n/format';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { plainText } from '../../src/lib/markdown';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { IconCircle } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { RichText } from '../../src/ui/RichText';
import { T } from '../../src/ui/Text';
import { toast } from '../../src/ui/Toast';
import { TOUCH, radius, space, useTheme } from '../../src/ui/theme';

function Sources({ refs }: { refs: string[] }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, tz } = useReady();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RefEntry[] | null>(null);
  useEffect(() => { if (open && !entries) void describeRefs(repo.db, refs).then(setEntries); }, [open, entries, refs, repo]);
  if (refs.length === 0) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={{ gap: space.xs }}>
      <Pressable testID="ask-sources" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
        <Chevron size={16} color={c.primary} />
        <T variant="footnote" color="primary" weight="600">{t('ask.basedOn', { count: refs.length })}</T>
      </Pressable>
      {open ? (entries ?? []).map((e) => (
        <Pressable key={e.ref} accessibilityRole="button" onPress={() => router.push(refRoute(e.kind, e.id) as never)} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
          <T variant="footnote" color="muted">{t(`ask.kind.${e.kind}`)}{e.at ? ` · ${fmtDayTime(e.at.length === 10 ? `${e.at}T12:00:00Z` : e.at, tz)}` : ''}</T>
        </Pressable>
      )) : null}
    </View>
  );
}

export default function Ask() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { profile, tz } = useReady();
  const isDemo = useSession((s) => s.isDemo);
  const gate = useAiGate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<{ question: string; notice: AskNotice | null } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const reload = useCallback(async (id: string) => {
    const env = toolEnvNow();
    if (env) setTurns(turnsOf(await loadConversation(env, id), env.profile.nickname));
  }, []);

  useEffect(() => {
    const env = toolEnvNow();
    if (!env) return;
    void latestConversationId(env).then(async (id) => {
      const conv = id ?? newConversationId();
      setConversationId(conv);
      if (id) await reload(id);
    });
  }, [reload]);

  const ask = async (q: string) => {
    const env = toolEnvNow();
    if (!env || !conversationId || !gate || !q.trim()) return;
    setQuestion('');
    setPending({ question: q.trim(), notice: null });
    const out = await askEmoLens(env, { conversationId, question: q, gate });
    if (out.ok) {
      setPending(null);
      await reload(conversationId);
    } else {
      setPending({ question: q.trim(), notice: askErrorNotice(t, out.error, tz, Date.now()) });
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const clear = async () => {
    const env = toolEnvNow();
    if (!env) return;
    setConversationId(await clearConversations(env));
    setTurns([]);
    setPending(null);
  };

  if (gate && (!gate.enabled || !gate.signedIn)) {
    return (
      <Screen back title={t('ask.title')}>
        <Card style={{ gap: space.md }}>
          <IconCircle icon={Bot} color={accent.strategy} />
          <T variant="headline">{t('ask.turnOnTitle')}</T>
          <T variant="callout" color="muted">{gate.enabled ? t('ai.err.signed_out') : t('ask.turnOnBody')}</T>
          <Button testID="ask-turn-on" label={t('ai.title')} onPress={() => router.push('/settings/ai' as never)} />
        </Card>
      </Screen>
    );
  }

  const bubble = (mine: boolean) => ({
    alignSelf: mine ? 'flex-end' as const : 'flex-start' as const, maxWidth: '88%' as const, padding: space.md, borderRadius: radius.card,
    backgroundColor: mine ? c.primary : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.border, gap: space.sm,
  });

  return (
    <Screen back title={t('ask.title')} scroll={false} testID="ask-screen"
      right={turns.length ? <Pressable testID="ask-clear" accessibilityRole="button" accessibilityLabel={t('ask.clear')} onPress={() => void clear()} hitSlop={10}><Trash2 size={22} color={c.textMuted} /></Pressable> : null}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {turns.length === 0 && !pending ? (
            <>
              <T variant="callout" color="muted">{t('ask.empty', { name: profile.nickname })}</T>
              <ChipGroup>
                {(['q1', 'q2', 'q3', 'q4'] as const).map((k) => <Chip key={k} testID={`ask-chip-${k}`} label={t(`ask.${k}`)} onPress={() => void ask(t(`ask.${k}`))} />)}
              </ChipGroup>
            </>
          ) : null}
          {turns.map((turn) => (
            <View key={turn.id} style={{ gap: space.sm }}>
              <View style={bubble(true)}><T variant="callout" color="onPrimary">{turn.question}</T></View>
              {turn.answer ? (
                <View style={bubble(false)} testID="ask-answer">
                  <RichText text={turn.answer} variant="callout" selectable testID="ask-answer-text" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                    <Sources refs={turn.sources} />
                    <Pressable accessibilityRole="button" accessibilityLabel={t('ask.copy')} hitSlop={10}
                      onPress={() => void Clipboard.setStringAsync(plainText(turn.answer ?? '')).then(() => toast(t('ask.copied')))}>
                      <Copy size={18} color={c.textMuted} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
          {pending ? (
            <View style={{ gap: space.sm }}>
              <View style={bubble(true)}><T variant="callout" color="onPrimary">{pending.question}</T></View>
              <View style={bubble(false)}>
                <T testID="ask-notice" variant="callout" color={pending.notice?.tone === 'error' ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
                  {pending.notice?.text ?? t('ask.thinking')}
                </T>
                {pending.notice?.retry ? <Button testID="ask-retry" small variant="secondary" label={t('ask.retry')} onPress={() => void ask(pending.question)} /> : null}
              </View>
            </View>
          ) : null}
          <T variant="footnote" color="muted">{t('ai.disclaimer')}{isDemo ? ` ${t('ai.demoNote')}` : ''}</T>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg, alignItems: 'flex-end' }}>
          <TextInput testID="ask-input" accessibilityLabel={t('ask.placeholder', { name: profile.nickname })} placeholder={t('ask.placeholder', { name: profile.nickname })}
            placeholderTextColor={c.textMuted} value={question} onChangeText={setQuestion} multiline maxLength={1000}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
              color: c.text, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16 }} />
          <Pressable testID="ask-send" accessibilityRole="button" accessibilityLabel={t('ask.send')} disabled={!question.trim() || (pending != null && !pending.notice)}
            onPress={() => void ask(question)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: question.trim() ? c.primary : c.surfaceAlt }}>
            <Send size={20} color={question.trim() ? c.onPrimary : c.textMuted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
