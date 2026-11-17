/**
 * Tappable terms in lesson text: `[[ledger]]` or `[[last deal|last-price]]` (the label, then the
 * concept id). At most two per card (knowledge-base plan: detours are where learners drop off), so a
 * term stays an offer, never a requirement. Pure: no React.
 *
 * The only other markup (owner 2026-11-17: it showed as literal asterisks): `**bold**` and `*italic*`,
 * read by `parseInline` for the one renderer, `RichText`. Never HTML.
 */

export type TextSegment = { text: string; concept?: string };

/** A run of text as the reader sees it: plain, bold, italic, or a term */
export type InlineSegment = { text: string; concept?: string; bold?: true; em?: true };

/** `**bold**` first, then `*italic*` (a lone `*` with no partner stays as it is) */
const EMPHASIS = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g;

const TERM = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Splits text into plain runs and terms; a term without an explicit id uses its label as the id */
export function parseTerms(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM)) {
    const at = m.index;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: m[1], concept: m[2] ?? m[1] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * Splits text into terms and plain, bold or italic runs. A term's label is never styled, and a term
 * never sits inside `*…*` (the emphasis pass sees the runs around a term apart, so its asterisks
 * would show: LessonSheet's sweep fails any lesson that does). `*` is never a times sign in lesson
 * copy (× is; the lesson rules test checks), or the run between two would turn italic
 */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  for (const seg of parseTerms(text)) {
    if (seg.concept) {
      out.push(seg);
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(EMPHASIS)) {
      if (m.index > last) out.push({ text: seg.text.slice(last, m.index) });
      out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], em: true });
      last = m.index + m[0].length;
    }
    if (last < seg.text.length) out.push({ text: seg.text.slice(last) });
  }
  return out;
}

/** The text a reader sees, markup removed */
export function plainText(text: string): string {
  return parseInline(text)
    .map((s) => s.text)
    .join('');
}

/** The concept ids a text links to, in order */
export function termIds(text: string): string[] {
  return parseTerms(text).flatMap((s) => (s.concept ? [s.concept] : []));
}
