import { describe, expect, it } from 'vitest';
import { GUIDE_ANCHORS, guide, guideSelector, isGuideAnchor } from '@/lib/guideAnchors';

describe('guide anchors', () => {
  it('should register every anchor once', () => {
    expect(new Set(GUIDE_ANCHORS).size).toBe(GUIDE_ANCHORS.length);
  });

  it('should name anchors <area>.<control>[.<variant>] in lower kebab-case', () => {
    for (const name of GUIDE_ANCHORS) {
      expect(name, name).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/);
    }
  });

  it('should spread data-guide, plus data-guide-key for a row', () => {
    expect(guide('trade.submit')).toEqual({ 'data-guide': 'trade.submit' });
    expect(guide('positions.row', 'linear:BTCUSDT')).toEqual({
      'data-guide': 'positions.row',
      'data-guide-key': 'linear:BTCUSDT',
    });
  });

  it('should build a selector that finds the element, with the key escaped', () => {
    document.body.innerHTML =
      '<button data-guide="trade.submit">Buy</button>' +
      '<div data-guide="positions.row" data-guide-key="linear:BTCUSDT"></div>';
    expect(document.querySelector(guideSelector('trade.submit'))?.textContent).toBe('Buy');
    expect(document.querySelector(guideSelector('positions.row', 'linear:BTCUSDT'))).not.toBeNull();
    expect(guideSelector('positions.row', 'a"b')).toBe(
      '[data-guide="positions.row"][data-guide-key="a\\"b"]'
    );
  });

  it('should tell registered names from unknown ones', () => {
    expect(isGuideAnchor('trade.submit')).toBe(true);
    expect(isGuideAnchor('trade.green-button')).toBe(false);
  });
});
