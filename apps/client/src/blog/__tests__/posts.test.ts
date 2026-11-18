import { describe, expect, it } from 'vitest';
import { ARTICLE_IDS, ARTICLES, getArticle, isArticleId } from '@/blog/posts';

/** Hype the education reports rule out, as for the lessons (reports/: "trust is the product") */
const HYPE = [
  /trade like a pro/i,
  /get rich/i,
  /guaranteed/i,
  /to the moon/i,
  /explode/i,
  /\b\d{3,}%/,
  /easy money/i,
  /\bedge\b/i,
];

describe('the Blog’s articles', () => {
  it('should define every article once, with a kebab-case id that is its URL', () => {
    expect(ARTICLES.map((a) => a.id)).toEqual([...ARTICLE_IDS]);
    for (const id of ARTICLE_IDS) expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(isArticleId('suncoin')).toBe(true);
    expect(isArticleId('moon')).toBe(false);
    expect(() => getArticle('moon' as never)).toThrow();
  });

  it('should hold every article to the house rules: sources, a self-test, a checked date, no hype', () => {
    for (const article of ARTICLES) {
      expect(article.sources.length, article.id).toBeGreaterThan(0);
      for (const s of article.sources) expect(s.url, s.label).toMatch(/^https:\/\//);
      expect(article.selfTest.length, article.id).toBeGreaterThanOrEqual(2);
      expect(article.checked, article.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const all = JSON.stringify(article);
      for (const h of HYPE) expect(all, `${article.id}: ${String(h)}`).not.toMatch(h);
      // Never HTML: the page renders plain text with **bold** only
      expect(all, article.id).not.toMatch(/<[a-z]/i);
    }
  });

  it('should carry no link to a lesson (owner 2026-11-18: articles stand apart from the lessons)', () => {
    for (const article of ARTICLES) {
      expect(Object.keys(article), article.id).not.toContain('practiceSoon');
      expect(Object.keys(article), article.id).not.toContain('access');
    }
  });
});
