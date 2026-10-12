import { describe, expect, it } from 'vitest';
import { placeBubble } from '@/guide/bubblePlacement';

const VIEWPORT = { width: 1280, height: 800 };
const BUBBLE = { width: 340, height: 160 };

describe('placeBubble', () => {
  it('should sit below the control, centred on it', () => {
    const p = placeBubble({ top: 100, left: 600, width: 100, height: 30 }, BUBBLE, VIEWPORT);
    expect(p.placement).toBe('below');
    expect(p.top).toBe(100 + 30 + 12);
    expect(p.left).toBe(600 + 50 - 170);
  });

  it('should go above when there is no room below', () => {
    const p = placeBubble({ top: 700, left: 600, width: 100, height: 30 }, BUBBLE, VIEWPORT);
    expect(p.placement).toBe('above');
    expect(p.top).toBe(700 - 12 - 160);
  });

  it('should stay inside the viewport at either edge', () => {
    const left = placeBubble({ top: 100, left: 0, width: 20, height: 20 }, BUBBLE, VIEWPORT);
    expect(left.left).toBe(8);
    const right = placeBubble({ top: 100, left: 1260, width: 20, height: 20 }, BUBBLE, VIEWPORT);
    expect(right.left).toBe(1280 - 340 - 8);
  });

  it('should sit inside a control that fills the screen (the chart)', () => {
    const p = placeBubble({ top: 60, left: 50, width: 1100, height: 600 }, BUBBLE, VIEWPORT);
    expect(p.placement).toBe('inside');
    expect(p.top).toBe(84);
  });

  it('should centre the bubble when there is no control', () => {
    const p = placeBubble(null, BUBBLE, VIEWPORT);
    expect(p).toEqual({ top: 320, left: 470, placement: 'center' });
  });

  it('should keep a tall bubble in a short viewport', () => {
    const p = placeBubble(null, { width: 340, height: 900 }, { width: 400, height: 500 });
    expect(p.top).toBe(8);
  });
});
