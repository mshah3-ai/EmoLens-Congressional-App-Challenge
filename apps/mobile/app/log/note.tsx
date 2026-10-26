/** A free-text note with a time (SPEC 10.9). Searchable from the Timeline. */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addNote, getNote } from '../../src/db/repo/logs';
import { nowIso } from '../../src/db/time';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Field, Input } from '../../src/ui/Field';
import { TimeField } from '../../src/ui/TimeField';
import { Sheet } from '../../src/ui/layout';

export default function NoteSheet() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const [text, setText] = useState('');
  const [notedAt, setNotedAt] = useState(nowIso());
  useEffect(() => {
    if (!id) return;
    void getNote(repo.db, id).then((n) => { if (n) { setText(n.text); setNotedAt(n.noted_at); } });
  }, [id, repo]);
  const save = async () => {
    await addNote(repo, profile.id, text, notedAt, id);
    afterSave();
    router.back();
  };
  return (
    <Sheet title={id ? t('note.editTitle') : t('note.title')} footer={<Button label={t('common.save')} onPress={() => void save()} disabled={!text.trim()} />}>
      <Input label={t('note.title')} value={text} onChangeText={setText} placeholder={t('note.placeholder')} multiline autoFocus={!id} style={{ minHeight: 160 }} />
      <Field label={t('note.when')}>
        <TimeField label={t('note.when')} value={notedAt} onChange={setNotedAt} tz={tz} />
      </Field>
    </Sheet>
  );
}
