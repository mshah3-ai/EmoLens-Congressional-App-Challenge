/** Team → Share links (SPEC 9.8, 24.3): the owner's read-only report links, with copy, share and revoke. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react-native';
import { cloudApi } from '../../cloud/current';
import { dateYearAt, dateYearIn } from '@emolens/reports';
import { listShareLinks, revokeShareLink, type ShareLinkView } from '../../sync/share';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { EmptyState, ListRow, Pill, RowGroup, Section } from '../../ui/bits';
import { T } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { space } from '../../ui/theme';

export function ShareLinks() {
  const { t } = useTranslation();
  const { repo, child, dataVersion } = useSession();
  const lang = useSession((s) => s.settings.language);
  const tz = child?.home_tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [links, setLinks] = useState<ShareLinkView[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const api = cloudApi();
    if (!repo || !child || !api) return;
    const r = await listShareLinks(repo.db, api, child.id);
    if ('error' in r) { setFailed(true); return; }
    setFailed(false);
    setLinks(r);
  }, [repo, child]);
  useEffect(() => { void load(); }, [load, dataVersion]);

  const revoke = (l: ShareLinkView) => Alert.alert(t('share.revokeTitle'), t('share.revokeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('share.revoke'), style: 'destructive', onPress: () => void (async () => {
      const api = cloudApi();
      if (!repo || !api) return;
      const err = await revokeShareLink(repo.db, api, l.id);
      toast(err ? t('share.revokeFailed') : t('share.revoked'));
      await load();
    })() },
  ]);

  return (
    <Section title={t('share.title')} action={<Button small label={t('share.create')} icon={Link2} onPress={() => router.push('/team/share')} testID="share-create" />}>
      {failed ? <T variant="callout" color="muted">{t('share.loadFailed')}</T> : null}
      {links && !links.length ? <EmptyState icon={Link2} title={t('share.none')} body={t('share.noneBody')} /> : null}
      {links?.length ? (
        <RowGroup>
          {links.map((l) => (
            <ListRow key={l.id} testID={`share-${l.id}`}
              title={`${t(`report.audience.${l.audience}`)} · ${dateYearIn(lang, l.range_from)} – ${dateYearIn(lang, l.range_to)}`}
              subtitle={l.active ? t('share.expires', { date: dateYearAt(lang, Date.parse(l.expires_at), tz) }) : t(l.revoked_at ? 'share.revokedLabel' : 'share.expiredLabel')}
              right={l.active ? (
                <View style={{ flexDirection: 'row', gap: space.xs }}>
                  {l.url ? <Button small variant="ghost" label={t('share.copy')} onPress={() => void Clipboard.setStringAsync(l.url as string).then(() => toast(t('share.copied')))} /> : null}
                  {l.url ? <Button small variant="ghost" label={t('share.share')} onPress={() => void Share.share({ message: l.url as string })} /> : null}
                  <Button small variant="ghost" label={t('share.revoke')} onPress={() => revoke(l)} testID={`revoke-${l.id}`} />
                </View>
              ) : <Pill label={t(l.revoked_at ? 'share.revokedLabel' : 'share.expiredLabel')} />} />
          ))}
        </RowGroup>
      ) : null}
    </Section>
  );
}
