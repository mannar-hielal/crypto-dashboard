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
    // Lesson 1 card 4 marks the ledger, and Lesson 2 card 3 comes back to it; Lesson 3 card 2 the
    // exchange and the last price
    expect(lessonPlacesOf('ledger')).toEqual([
      { lesson: 'lesson-01', screen: 3 },
      { lesson: 'lesson-ownership', screen: 2 },
    ]);
    expect(lessonPlacesOf('last-price')).toEqual([{ lesson: 'lesson-02', screen: 1 }]);

    expect(practiceFor('money-101')).toEqual([
      { kind: 'lesson', lesson: 'lesson-01', screen: 2, label: 'Lesson 1: Money runs on trust' },
    ]);
    // SunCoin lays out the problem; the network article is the answer the next cards give
    expect(practiceFor('suncoin')).toEqual([
      { kind: 'lesson', lesson: 'lesson-01', screen: 3, label: 'Lesson 1: A notebook, not coins' },
      {
        kind: 'lesson',
        lesson: 'lesson-ownership',
        screen: 2,
        label: 'Lesson 2: One ledger, thousands of copies',
      },
    ]);
    expect(practiceFor('bitcoin-network').map((p) => p.label)).toEqual([
      'Lesson 2: Money that no one controls',
      'Lesson 2: One ledger, thousands of copies',
      'Lesson 2: A stamp only you hold',
      'Lesson 2: Your bitcoin isn’t in your phone',
    ]);
    expect(practiceFor('mailboxes-keys')).toEqual([
      {
        kind: 'lesson',
        lesson: 'lesson-ownership',
        screen: 3,
        label: 'Lesson 2: A mailbox and a key',
      },
    ]);
    expect(practiceFor('getting-bitcoin')).toEqual([
      {
        kind: 'lesson',
        lesson: 'lesson-ownership',
        screen: 6,
        label: 'Lesson 2: Who holds your key?',
      },
    ]);
    expect(practiceFor('exchange-price')).toEqual([
      { kind: 'lesson', lesson: 'lesson-02', screen: 1, label: 'Lesson 3: What a price is' },
      {
        kind: 'lesson',
        lesson: 'lesson-02',
        screen: 2,
        label: 'Lesson 3: A market that never closes',
      },
      { kind: 'tour', tour: 'primer', label: 'What you’re looking at' },
      { kind: 'tour', tour: 'buy-first-coin', label: 'Buy your first coin' },
    ]);
    // Owner 2026-11-12: Lesson 2's Bitcoin card opens it with its Read more, so it practises it
    expect(practiceFor('bitcoin-story')).toEqual([
      {
        kind: 'lesson',
        lesson: 'lesson-ownership',
        screen: 1,
        label: 'Lesson 2: Money that no one controls',
      },
      // The ledger card's Read more opens the mining section (owner 2026-11-12)
      {
        kind: 'lesson',
        lesson: 'lesson-ownership',
        screen: 2,
        label: 'Lesson 2: One ledger, thousands of copies',
      },
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
      for (const item of lesson.canDo) expect(getArticle(item.article).access).toBe(FREE);
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
        if (!item.section) continue;
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
