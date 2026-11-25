/**
 * 🔐 Text from a user that ends up in an e-mail to the owner. Control characters, zero-width
 * characters and the characters that flip a line's direction are removed: they can hide where a
 * word ends, or make "evil.exe" read as "exe.live" in a mail client. Tabs and line breaks stay in
 * free text. Emoji joiners (U+200C, U+200D) stay, so emoji still render.
 */

/* eslint-disable no-control-regex -- removing control characters is the whole point of this file */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/* eslint-enable no-control-regex */
// Written as escapes (never the characters themselves): soft hyphen, fillers and invisible letters (Hangul,
// Khmer, Mongolian, braille blank), the Arabic letter mark, zero-width space and the direction marks and
// overrides and isolates, line and paragraph separators, the word joiner and invisible operators, the BOM,
// the interlinear annotation marks, and the "tag" characters (U+E0000 to U+E007F), which can carry
// whole sentences no reader can see
/* eslint-disable no-misleading-character-class, security/detect-unsafe-regex -- one flat class of the characters to remove, combining and joining ones included on purpose; no nested quantifier, so no backtracking */
const HIDDEN =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu;
/* eslint-enable no-misleading-character-class, security/detect-unsafe-regex */

export function cleanText(s: string): string {
  return s.replace(CONTROL, '').replace(HIDDEN, '');
}

/** One line, at most `max` characters: for a subject, a table cell, a name */
export function oneLine(s: string, max: number): string {
  return cleanText(s).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * 🔐 An address safe to put in a Reply-To header: one mailbox, plain characters. The schema's
 * `format: email` is looser (it admits some characters a mail header treats as separators), and a
 * second address in Reply-To would make the owner's reply go to a stranger too.
 */
const LOCAL = /^[A-Za-z0-9._%+-]+$/;
const LABEL = /^[A-Za-z0-9-]+$/;
const TLD = /^[A-Za-z]{2,24}$/;

export function isPlainMailbox(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  const at = email.indexOf('@');
  // Exactly one @, with something on each side
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, at);
  const labels = email.slice(at + 1).split('.');
  if (local.length > 64 || !LOCAL.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  // A domain of at least two labels, each plain, none starting or ending with a hyphen, the last a real-looking TLD
  if (labels.length < 2) return false;
  if (!TLD.test(labels[labels.length - 1])) return false;
  return labels.every(
    (l) =>
      l.length >= 1 && l.length <= 63 && LABEL.test(l) && !l.startsWith('-') && !l.endsWith('-')
  );
}
