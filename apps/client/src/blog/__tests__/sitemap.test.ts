import { describe, it, expect } from 'vitest';

import sitemap from '../../../public/sitemap.xml?raw';
import { ARTICLE_IDS } from '../posts';

const SITE = 'https://cryptopapertrade.com';
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('sitemap.xml', () => {
  it('should list the Blog and every article, and no other article address', () => {
    const listed = urls.filter((u) => u.startsWith(`${SITE}/blog`)).sort();
    const expected = [`${SITE}/blog`, ...ARTICLE_IDS.map((id) => `${SITE}/blog/${id}`)].sort();
    expect(listed).toEqual(expected);
  });

  it('should list each address once, on the apex host over https', () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith(`${SITE}/`)).toBe(true);
  });
});
