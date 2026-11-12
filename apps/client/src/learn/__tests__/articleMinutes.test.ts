import { describe, expect, it } from 'vitest';
import { ARTICLES, type ArticleBlock } from '@/learn/articles';

const words = (t: string) => t.split(/\s+/).filter((w) => /\w/.test(w)).length;

function blockWords(b: ArticleBlock): number {
  switch (b.kind) {
    case 'h':
    case 'p':
    case 'callout':
      return words(b.text);
    case 'list':
      return b.items.reduce((n, item) => n + words(item), 0);
    case 'table':
      return [...b.head, ...b.rows.flat()].reduce((n, cell) => n + words(cell), 0);
    case 'widget':
      return 0;
  }
}

describe('article reading times', () => {
  it('should label every article with its real length: about 200 words a minute, half a minute a widget', () => {
    // Owner 2026-11-12: articles run 3–4 minutes, and the label must not overstate them
    for (const a of ARTICLES) {
      const w = a.blocks.reduce((n, b) => n + blockWords(b), words(a.summary ?? ''));
      const widgets = a.blocks.filter((b) => b.kind === 'widget').length;
      const estimate = w / 200 + widgets * 0.5;
      expect(
        Math.abs(a.minutes - estimate),
        `${a.id}: ${w} words, ${widgets} widgets`
      ).toBeLessThanOrEqual(1);
    }
  });

  it('should give Lesson 3’s articles a 3–4 minute read, each with something to do', () => {
    for (const id of ['exchange-price', 'price-swings', 'spot-a-scam']) {
      const a = ARTICLES.find((x) => x.id === id)!;
      expect(a.minutes, id).toBeGreaterThanOrEqual(3);
      expect(a.minutes, id).toBeLessThanOrEqual(4);
      expect(
        a.blocks.some((b) => b.kind === 'widget'),
        id
      ).toBe(true);
    }
  });
});
