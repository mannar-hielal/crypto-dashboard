/**
 * TradingView's drawing shortcuts: Alt+T trend line, Alt+H horizontal line, Alt+J horizontal ray,
 * Alt+V vertical line, Alt+C cross line, Alt+F Fib retracement, Alt+Shift+R rectangle; Ctrl/Cmd+Z
 * undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+C / V copy / paste. (Delete and Esc are the
 * library's.) Keys are matched by `code`, since Alt on a Mac turns T into †.
 */

interface ToolKey {
  /** KeyboardEvent.code */
  code: string;
  shift?: boolean;
}

export const TOOL_SHORTCUTS: Readonly<Record<string, ToolKey>> = {
  'trend-line': { code: 'KeyT' },
  'horizontal-line': { code: 'KeyH' },
  'horizontal-ray': { code: 'KeyJ' },
  'vertical-line': { code: 'KeyV' },
  'cross-line': { code: 'KeyC' },
  'fib-retracement': { code: 'KeyF' },
  rectangle: { code: 'KeyR', shift: true },
};

export type DrawingShortcut =
  | { type: 'tool'; tool: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'paste' };

type KeyLike = Pick<
  KeyboardEvent,
  'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'target' | 'repeat'
>;

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** Typing in a field: shortcuts stay out of the way */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/** The drawing action a key press asks for, or null */
export function matchDrawingShortcut(e: KeyLike, mac: boolean): DrawingShortcut | null {
  if (isTyping(e.target)) return null;
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (mod && !e.altKey) {
    if (e.code === 'KeyZ') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (e.code === 'KeyY' && !e.shiftKey) return { type: 'redo' };
    if (e.repeat) return null;
    if (e.code === 'KeyC' && !e.shiftKey) return { type: 'copy' };
    if (e.code === 'KeyV' && !e.shiftKey) return { type: 'paste' };
    return null;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat) {
    for (const [tool, key] of Object.entries(TOOL_SHORTCUTS)) {
      if (key.code === e.code && !!key.shift === e.shiftKey) return { type: 'tool', tool };
    }
  }
  return null;
}

/** "⌥T" / "⌥⇧R" on a Mac, "Alt+T" / "Alt+Shift+R" elsewhere; undefined for a tool without one */
export function formatToolShortcut(tool: string, mac: boolean): string | undefined {
  const key = TOOL_SHORTCUTS[tool];
  if (!key) return undefined;
  const letter = key.code.replace('Key', '');
  if (mac) return `⌥${key.shift ? '⇧' : ''}${letter}`;
  return `Alt+${key.shift ? 'Shift+' : ''}${letter}`;
}

/** A Ctrl/Cmd chord for menus: "⌘C" on a Mac, "Ctrl+C" elsewhere */
export function formatModShortcut(letter: string, mac: boolean): string {
  return mac ? `⌘${letter}` : `Ctrl+${letter}`;
}
