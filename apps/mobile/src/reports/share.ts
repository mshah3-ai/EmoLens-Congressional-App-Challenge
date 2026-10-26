/**
 * Turns report HTML into a PDF (expo-print) and hands files to the phone's share sheet (expo-sharing): Mail, Files,
 * AirDrop, Messages... Files are written to the app's cache folder with a readable name and deleted before the next
 * share of the same name. Nothing is uploaded by EmoLens itself; the parent picks where each file goes. Each step is
 * labelled (print / save / write / share) so a failure says where it happened (src/lib/steps.ts).
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { step } from '../lib/steps';
import { PAGE_POINTS, type PageSize } from '@emolens/reports';

export type ShareKind = 'pdf' | 'csv' | 'json';

const TYPES: Record<ShareKind, { mimeType: string; UTI: string }> = {
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
  json: { mimeType: 'application/json', UTI: 'public.json' },
};

/** A file name without characters that file systems or mail apps dislike. */
export const safeFileName = (s: string): string => s.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

function freshCacheFile(name: string): File {
  const f = new File(Paths.cache, safeFileName(name));
  if (f.exists) f.delete();
  return f;
}

async function share(uri: string, kind: ShareKind, dialogTitle: string): Promise<void> {
  await step('share', async () => {
    if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
    await Sharing.shareAsync(uri, { ...TYPES[kind], dialogTitle });
  });
}

/** Writes `text` to the cache as `name` and opens the share sheet. */
export async function shareTextFile(name: string, text: string, kind: 'csv' | 'json', dialogTitle: string): Promise<void> {
  const f = await step('write', () => {
    const file = freshCacheFile(name);
    file.create();
    file.write(text);
    return file;
  });
  await share(f.uri, kind, dialogTitle);
}

/** Prints `html` to a PDF of the given paper size, names it `name`, and opens the share sheet. */
export async function sharePdf(name: string, html: string, size: PageSize, dialogTitle: string): Promise<void> {
  const { uri } = await step('print', () => Print.printToFileAsync({ html, ...PAGE_POINTS[size] }));
  const target = await step('save', () => {
    const file = freshCacheFile(name);
    new File(uri).moveSync(file);
    return file;
  });
  await share(target.uri, 'pdf', dialogTitle);
}
