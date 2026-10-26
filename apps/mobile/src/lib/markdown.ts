/**
 * The small part of Markdown the AI uses in its answers (Ask EmoLens, the digest summary): **bold**, bullet and
 * numbered lists, headings, and the odd table. Parsed into simple blocks so the screens show formatting instead of
 * asterisks (BUGS #29), and turned into plain text for "Copy". Anything else is shown as written.
 */
export interface Span { text: string; bold: boolean; }
export interface Block { kind: 'para' | 'heading' | 'bullet'; marker?: string; spans: Span[]; }

/** "**7** hard *moments*" → [{7, bold}, {" hard moments"}]: bold kept; italics, `code` and [link](url) markers dropped. */
export function parseInline(line: string): Span[] {
  const cleaned = line
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1');
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/gu;
  let last = 0;
  for (let m = re.exec(cleaned); m; m = re.exec(cleaned)) {
    if (m.index > last) out.push({ text: cleaned.slice(last, m.index), bold: false });
    out.push({ text: m[1] ?? m[2], bold: true });
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) out.push({ text: cleaned.slice(last), bold: false });
  return out
    .map((s) => ({ ...s, text: s.text.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=$|[\s.,;:!?)])/gu, '$1$2') }))
    .filter((s) => s.text.length > 0);
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/u.test(line)) continue; // --- rule
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/u.test(line)) continue; // |---|---| table separator
    const heading = /^\s*#{1,6}\s+(.*)$/u.exec(line);
    if (heading) { blocks.push({ kind: 'heading', spans: parseInline(heading[1]).map((s) => ({ ...s, bold: true })) }); continue; }
    const bullet = /^\s*[-*•+]\s+(.*)$/u.exec(line);
    if (bullet) { blocks.push({ kind: 'bullet', marker: '•', spans: parseInline(bullet[1]) }); continue; }
    const numbered = /^\s*(\d{1,3})[.)]\s+(.*)$/u.exec(line);
    if (numbered) { blocks.push({ kind: 'bullet', marker: `${numbered[1]}.`, spans: parseInline(numbered[2]) }); continue; }
    if (/^\s*\|.*\|\s*$/u.test(line)) { // a table row: its cells, separated by " · "
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean);
      blocks.push({ kind: 'para', spans: parseInline(cells.join(' · ')) });
      continue;
    }
    blocks.push({ kind: 'para', spans: parseInline(line.trim()) });
  }
  return blocks;
}

/** The answer without Markdown symbols, for copying. */
export function plainText(text: string): string {
  return parseMarkdown(text).map((b) => `${b.marker ? `${b.marker} ` : ''}${b.spans.map((s) => s.text).join('')}`).join('\n');
}
