import { describe, expect, it } from 'vitest';
import { getLesson, LESSONS, lessonScreens } from '@/guide/lessons';
import { isGuideAnchor } from '@/lib/guideAnchors';
import { canOpen, FREE } from '@/learn/access';
import { ARTICLE_IDS, ARTICLES, getArticle, isArticleId } from '@/learn/articles';
import { CONCEPT_IDS, CONCEPTS, getConcept, isConceptId } from '@/learn/concepts';
import { conceptFor, conceptsOf, lessonPlacesOf, practiceFor } from '@/learn/graph';
import { termIds } from '@/learn/terms';

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

describe('the learning graph', () => {
  it('should define every concept and article once, with a real article behind each concept', () => {
    expect(CONCEPTS.map((c) => c.id)).toEqual([...CONCEPT_IDS]);
    expect(ARTICLES.map((a) => a.id)).toEqual([...ARTICLE_IDS]);
    for (const c of CONCEPTS) expect(isArticleId(c.article), c.id).toBe(true);
    expect(isConceptId('ledger')).toBe(true);
    expect(isConceptId('moon')).toBe(false);
    expect(() => getConcept('moon' as never)).toThrow();
    expect(() => getArticle('moon' as never)).toThrow();
  });

  it('should give every article at least one concept', () => {
    for (const id of ARTICLE_IDS) expect(conceptsOf(id).length, id).toBeGreaterThan(0);
  });

  it('should mark only known concepts in lesson cards, at most two a card', () => {
    for (const lesson of LESSONS) {
      for (const card of lesson.cards) {
        const ids = termIds(card.text ?? '');
        expect(ids.length, card.title).toBeLessThanOrEqual(2);
        for (const id of ids) expect(isConceptId(id), `${card.title}: ${id}`).toBe(true);
      }
    }
  });

  it('should lead every article back to practice, or say where it will be practised', () => {
    for (const article of ARTICLES) {
      const practice = practiceFor(article.id);
      if (practice.length === 0) expect(article.practiceSoon, article.id).toBeTruthy();
    }
  });

  it('should send the lessons’ terms to their articles and the articles back to the cards', () => {
    // Lesson 2's "One record, many copies" marks the ledger (rewritten 2026-11-16)
    expect(lessonPlacesOf('ledger')).toEqual([{ lesson: 'lesson-ownership', screen: 4 }]);
    const labels = (id: Parameters<typeof practiceFor>[0]) => practiceFor(id).map((p) => p.label);
    // The cards moved to later lessons say so instead (practiceSoon)
    for (const id of ['money-101', 'mailboxes-keys', 'getting-bitcoin'] as const) {
      expect(practiceFor(id), id).toEqual([]);
      expect(getArticle(id).practiceSoon, id).toMatch(/later lesson/);
    }
    expect(labels('suncoin')).toEqual(['Lesson 2: One record, many copies']);
    expect(labels('bitcoin-network')).toEqual([
      'Lesson 2: One record, many copies',
      'Lesson 2: Two checks, then a block',
      'Lesson 2: The hash links the chain',
      'Lesson 2: No one in charge',
    ]);
    expect(labels('bitcoin-story')).toEqual([
      'Lesson 2: A paper, then a block',
      'Lesson 2: Two checks, then a block',
      'Lesson 2: Sealed by hard work',
    ]);
    expect(labels('exchange-price')).toEqual([
      'Lesson 2: Liquidity, briefly',
      'Lesson 3: Thin or deep',
      'Lesson 3: Bitcoin is deep',
      'What you’re looking at',
      'Buy your first coin',
    ]);
    expect(labels('price-swings')).toEqual([
      'Lesson 1: The market never sleeps',
      'Lesson 1: Smaller coins swing harder',
      'Lesson 3: Big swings, both ways',
      'Lesson 3: News moves it, fast',
      'Lesson 3: Thousands of deals, one candle',
      'What you’re looking at',
    ]);
    expect(labels('spot-a-scam')).toEqual([
      'Lesson 1: Big swings, big risks',
      'Lesson 3: A rug pull',
      'Lesson 3: Check before you trust',
    ]);
  });

  it('should open every concept on an article that really explains its term (review #278)', () => {
    for (const concept of CONCEPTS) {
      const article = getArticle(concept.article);
      const words = JSON.stringify([article.title, article.summary, article.blocks]).toLowerCase();
      // "Satoshi" may appear as satoshis; "Decentralized" as decentralised; match the stem
      const stem = concept.term.toLowerCase().slice(0, Math.max(5, concept.term.length - 2));
      expect(words, `${concept.id} → ${concept.article}`).toContain(stem);
    }
  });

  it('should keep free things free: a free lesson never links to a paid concept or article', () => {
    for (const lesson of LESSONS) {
      if (lesson.access !== FREE) continue;
      for (const card of lesson.cards) {
        for (const id of termIds(card.text ?? '')) {
          const concept = getConcept(id as never);
          expect(concept.access, id).toBe(FREE);
          expect(getArticle(concept.article).access, concept.article).toBe(FREE);
        }
      }
      for (const item of lesson.canDo) {
        if (item.article) expect(getArticle(item.article).access).toBe(FREE);
      }
      // Every other link a free lesson makes: a card's Read more, the recap and its highlight
      for (const card of lesson.cards) {
        if (card.more) expect(getArticle(card.more.article).access, card.title).toBe(FREE);
        // …and a Read more's section is a real heading of its article
        if (card.more?.section) {
          const ids = getArticle(card.more.article).blocks.flatMap((b) =>
            b.kind === 'h' && b.id ? [b.id] : []
          );
          expect(ids, card.title).toContain(card.more.section);
        }
      }
      for (const item of [...(lesson.recap?.points ?? []), lesson.recap?.highlight]) {
        if (item?.article) expect(getArticle(item.article).access, item.text).toBe(FREE);
      }
    }
    for (const article of ARTICLES) {
      if (article.access !== FREE) continue;
      for (const link of practiceFor(article.id)) {
        if (link.kind === 'lesson') expect(getLesson(link.lesson).access).toBe(FREE);
      }
    }
  });

  it('should link a can-do line to a section its article really has', () => {
    for (const lesson of LESSONS) {
      for (const item of lesson.canDo) {
        if (!item.section || !item.article) continue;
        const ids = getArticle(item.article).blocks.flatMap((b) =>
          b.kind === 'h' && b.id ? [b.id] : []
        );
        expect(ids, item.text).toContain(item.section);
      }
    }
  });

  it('should hold every article to the house rules: sources, a self-test, a checked date, no hype', () => {
    for (const article of ARTICLES) {
      expect(article.sources.length, article.id).toBeGreaterThan(0);
      for (const s of article.sources) expect(s.url, s.label).toMatch(/^https:\/\//);
      expect(article.selfTest.length, article.id).toBeGreaterThanOrEqual(2);
      expect(article.checked, article.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const block of article.blocks) {
        if (block.kind === 'callout' && block.anchor) {
          expect(isGuideAnchor(block.anchor), block.anchor).toBe(true);
        }
      }
      const all = JSON.stringify(article);
      for (const h of HYPE) expect(all, `${article.id}: ${String(h)}`).not.toMatch(h);
      // Never HTML: the drawer renders plain text with **bold** only
      expect(all, article.id).not.toMatch(/<[a-z]/i);
    }
  });

  it('should find a concept for a tapped term, and nothing for an unknown one', () => {
    expect(conceptFor('candle')?.term).toBe('Candle');
    expect(conceptFor('nope')).toBeNull();
  });

  it('should work out every lesson screen it points at', () => {
    for (const article of ARTICLES) {
      for (const link of practiceFor(article.id)) {
        if (link.kind !== 'lesson') continue;
        const screen = lessonScreens(getLesson(link.lesson))[link.screen];
        expect(screen?.kind).toBe('card');
      }
    }
  });
});

describe('access', () => {
  it('should open free content for everyone and paid content only with its key', () => {
    expect(canOpen('learn.core', [])).toBe(true);
    expect(canOpen('drills.events', [])).toBe(false);
    expect(canOpen('drills.events', ['drills.events'])).toBe(true);
  });
});
