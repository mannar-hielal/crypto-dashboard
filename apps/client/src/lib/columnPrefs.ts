/**
 * Saved column choices of the account panel tables (Positions, Orders, …), per browser.
 *
 * A saved column list replaces the table's defaults, so a column added later with `defaultOn`
 * would never appear for a returning user. The layout carries a version; ADDED_COLS inserts each
 * newer default-on column once, and from then on the user's own choice is kept.
 */

const COL_PREFS_KEY = 'cd-paper-col-prefs';
const COL_PREFS_VERSION_KEY = 'cd-paper-col-prefs-version';
const COL_PREFS_VERSION = 3;

/**
 * Default-on columns added in a later version. A saved column list replaces the defaults, so
 * without this a returning user would never see them. Each is inserted once, after `after`;
 * from then on the user's own choice is kept.
 */
const ADDED_COLS: { version: number; tab: string; id: string; after: string }[] = [
  { version: 2, tab: 'positions', id: 'liq', after: 'mark' }, // BP-3
  { version: 2, tab: 'positions', id: 'mmr', after: 'liq' }, // BP-3
  { version: 3, tab: 'positions', id: 'funding', after: 'pnlPct' }, // BP-4
];

/** Bring a saved column layout up to COL_PREFS_VERSION (pure). */
export function migrateColPrefs(
  saved: Record<string, string[]>,
  savedVersion: number
): Record<string, string[]> {
  const out = { ...saved };
  for (const add of ADDED_COLS) {
    const list = out[add.tab];
    if (add.version <= savedVersion || !list || list.includes(add.id)) continue;
    // After its anchor; without it, before the trailing Close / Cancel action column, else last
    const anchor = list.indexOf(add.after);
    const action = list.findIndex((id) => id === 'close' || id === 'cancel');
    const at = anchor !== -1 ? anchor + 1 : action !== -1 ? action : list.length;
    out[add.tab] = [...list.slice(0, at), add.id, ...list.slice(at)];
  }
  return out;
}

export function loadColPrefs(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(COL_PREFS_KEY);
    if (!raw) return {};
    const version = Number(localStorage.getItem(COL_PREFS_VERSION_KEY) ?? '1') || 1;
    return migrateColPrefs(JSON.parse(raw) as Record<string, string[]>, version);
  } catch {
    return {};
  }
}

export function saveColPrefs(prefs: Record<string, string[]>) {
  try {
    localStorage.setItem(COL_PREFS_KEY, JSON.stringify(prefs));
    localStorage.setItem(COL_PREFS_VERSION_KEY, String(COL_PREFS_VERSION));
  } catch {
    // ignore storage errors
  }
}
