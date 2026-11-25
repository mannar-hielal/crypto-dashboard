import { describe, it, expect } from 'vitest';
import { cleanText, isPlainMailbox, oneLine } from '../lib/cleanText.js';
import { SlidingWindowLimiter } from '../lib/slidingLimiter.js';

describe('cleanText', () => {
  it('should remove control, zero-width and direction characters, and keep tabs, line breaks and joiners', () => {
    expect(cleanText('a\u0000b\u0007c\u200Bd\u202Ee\u2066f\uFEFFg')).toBe('abcdefg');
    expect(cleanText('line one\n\tline two\r\nthree')).toBe('line one\n\tline two\r\nthree');
    expect(cleanText('\u{1F468}‍\u{1F4BB}')).toBe('\u{1F468}‍\u{1F4BB}');
  });
  it('should remove the tag characters, fillers and separators that read as nothing (found in the security review)', () => {
    expect(cleanText(`a${String.fromCodePoint(0xe0041, 0xe0042)}b`)).toBe('ab');
    for (const cp of [
      0x061c, 0x180e, 0x00ad, 0x3164, 0x2028, 0x2029, 0x115f, 0x2800, 0xfff9, 0xffa0, 0x034f,
    ]) {
      expect(cleanText(`x${String.fromCodePoint(cp)}y`), cp.toString(16)).toBe('xy');
    }
  });

  it('should make one line of any text, within the length', () => {
    expect(oneLine('  a \r\n b\tc  ', 100)).toBe('a b c');
    expect(oneLine('abcdef', 3)).toBe('abc');
  });
});

describe('isPlainMailbox', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.com', 'A_B-C%d@x-y.org'])(
    'should accept %s',
    (e) => {
      expect(isPlainMailbox(e)).toBe(true);
    }
  );
  it.each([
    '',
    'a@b',
    'a b@c.com',
    'a@b.com,c@d.com',
    'a@b.com;c@d.com',
    '<a@b.com>',
    '"a"@b.com',
    '.a@b.com',
    'a.@b.com',
    'a..b@c.com',
    'a@b.com\r\nBcc: x@y.z',
    `${'a'.repeat(65)}@b.com`,
    `a@${'b'.repeat(250)}.com`,
  ])('should refuse %j', (e) => {
    expect(isPlainMailbox(e)).toBe(false);
  });
});

describe('SlidingWindowLimiter', () => {
  it('should allow up to the limit within the window, then refuse', () => {
    const l = new SlidingWindowLimiter(2, 1000);
    expect([l.allow('k', 0), l.allow('k', 10), l.allow('k', 20)]).toEqual([true, true, false]);
  });
  it('should let a hit through again once the earlier ones have left the window', () => {
    const l = new SlidingWindowLimiter(2, 1000);
    l.allow('k', 0);
    l.allow('k', 500);
    expect(l.allow('k', 900)).toBe(false);
    expect(l.allow('k', 1001)).toBe(true);
  });
  it('should not count a refused hit', () => {
    const l = new SlidingWindowLimiter(1, 1000);
    l.allow('k', 0);
    for (let t = 1; t < 900; t += 100) l.allow('k', t);
    expect(l.allow('k', 1001)).toBe(true);
  });
  it('should keep each key on its own', () => {
    const l = new SlidingWindowLimiter(1, 1000);
    expect(l.allow('a', 0)).toBe(true);
    expect(l.allow('b', 0)).toBe(true);
    expect(l.allow('a', 1)).toBe(false);
  });
  it('should never hold more keys than its cap, whatever the flood', () => {
    const l = new SlidingWindowLimiter(1, 60_000, 50);
    for (let i = 0; i < 5000; i++) l.allow(`user-${i}`, i);
    expect(l.size).toBeLessThanOrEqual(50);
  });
  it('should forget a key whose hits have all expired when it needs room', () => {
    const l = new SlidingWindowLimiter(1, 100, 2);
    l.allow('a', 0);
    l.allow('b', 1);
    l.allow('c', 1000);
    expect(l.size).toBeLessThanOrEqual(2);
    expect(l.allow('a', 1000)).toBe(true);
  });
  it('should give a hit back, so work that did not happen does not count', () => {
    const l = new SlidingWindowLimiter(2, 1000);
    l.allow('k', 0);
    l.allow('k', 10);
    expect(l.allow('k', 20)).toBe(false);
    l.refund('k');
    expect(l.allow('k', 30)).toBe(true);
    // Refunding a key that holds nothing is harmless, and a key refunded to nothing is forgotten
    l.refund('missing');
    const one = new SlidingWindowLimiter(1, 1000);
    one.allow('x', 0);
    one.refund('x');
    expect(one.size).toBe(0);
  });
});
