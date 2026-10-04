/**
 * TradingView's drawing shortcuts (lib/drawingShortcuts.ts). TRADING_TEST_PLAN 10.7.15.
 */

import { describe, expect, it } from 'vitest';
import {
  formatModShortcut,
  formatToolShortcut,
  matchDrawingShortcut,
} from '@/lib/drawingShortcuts';

function key(code: string, mods: Partial<KeyboardEvent> = {}, target?: HTMLElement) {
  return {
    code,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    target: target ?? document.body,
    ...mods,
  } as KeyboardEvent;
}

describe('matchDrawingShortcut', () => {
  it('[10.7.15] should arm TradingView’s tools on Alt+letter, matched by key code (Mac Alt+T is †)', () => {
    expect(matchDrawingShortcut(key('KeyT', { altKey: true }), true)).toEqual({
      type: 'tool',
      tool: 'trend-line',
    });
    expect(matchDrawingShortcut(key('KeyH', { altKey: true }), false)).toEqual({
      type: 'tool',
      tool: 'horizontal-line',
    });
    expect(matchDrawingShortcut(key('KeyR', { altKey: true, shiftKey: true }), false)).toEqual({
      type: 'tool',
      tool: 'rectangle',
    });
    expect(matchDrawingShortcut(key('KeyR', { altKey: true }), false)).toBeNull();
  });

  it('[10.7.15] should map undo / redo / copy / paste to Cmd on a Mac and Ctrl elsewhere', () => {
    expect(matchDrawingShortcut(key('KeyZ', { metaKey: true }), true)).toEqual({ type: 'undo' });
    expect(matchDrawingShortcut(key('KeyZ', { ctrlKey: true }), true)).toBeNull();
    expect(matchDrawingShortcut(key('KeyZ', { ctrlKey: true }), false)).toEqual({ type: 'undo' });
    expect(matchDrawingShortcut(key('KeyZ', { ctrlKey: true, shiftKey: true }), false)).toEqual({
      type: 'redo',
    });
    expect(matchDrawingShortcut(key('KeyY', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
    expect(matchDrawingShortcut(key('KeyC', { metaKey: true }), true)).toEqual({ type: 'copy' });
    expect(matchDrawingShortcut(key('KeyV', { metaKey: true }), true)).toEqual({ type: 'paste' });
  });

  it('[10.7.15] should stay out of the way while typing in a field', () => {
    const input = document.createElement('input');
    expect(matchDrawingShortcut(key('KeyZ', { ctrlKey: true }, input), false)).toBeNull();
    const area = document.createElement('textarea');
    expect(matchDrawingShortcut(key('KeyT', { altKey: true }, area), false)).toBeNull();
  });

  it('should ignore a held key repeating, except for undo / redo', () => {
    expect(matchDrawingShortcut(key('KeyT', { altKey: true, repeat: true }), false)).toBeNull();
    expect(matchDrawingShortcut(key('KeyV', { ctrlKey: true, repeat: true }), false)).toBeNull();
    expect(matchDrawingShortcut(key('KeyZ', { ctrlKey: true, repeat: true }), false)).toEqual({
      type: 'undo',
    });
  });
});

describe('shortcut labels', () => {
  it('[10.7.15] should read ⌥T / ⌥⇧R on a Mac and Alt+T / Alt+Shift+R elsewhere', () => {
    expect(formatToolShortcut('trend-line', true)).toBe('⌥T');
    expect(formatToolShortcut('rectangle', true)).toBe('⌥⇧R');
    expect(formatToolShortcut('trend-line', false)).toBe('Alt+T');
    expect(formatToolShortcut('rectangle', false)).toBe('Alt+Shift+R');
    expect(formatToolShortcut('ray', false)).toBeUndefined();
    expect(formatModShortcut('C', true)).toBe('⌘C');
    expect(formatModShortcut('C', false)).toBe('Ctrl+C');
  });
});
