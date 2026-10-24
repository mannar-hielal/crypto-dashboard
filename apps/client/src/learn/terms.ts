/**
 * Tappable terms in lesson text: `[[ledger]]` or `[[last deal|last-price]]` (the label, then the
 * concept id). At most two per card (knowledge-base plan: detours are where learners drop off), so a
 * term stays an offer, never a requirement. Pure: no React.
 */

export type TextSegment = { text: string; concept?: string };

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

/** The text a reader sees, markup removed */
export function plainText(text: string): string {
  return parseTerms(text)
    .map((s) => s.text)
    .join('');
}

/** The concept ids a text links to, in order */
export function termIds(text: string): string[] {
  return parseTerms(text).flatMap((s) => (s.concept ? [s.concept] : []));
}
