import { describe, expect, it } from 'vitest';
import { cardTermIds, LESSONS } from '@/guide/lessons';
import { canOpen, FREE } from '@/learn/access';
import { CONCEPT_IDS, CONCEPTS, getConcept, isConceptId } from '@/learn/concepts';
import { conceptFor, lessonPlacesOf } from '@/learn/graph';

describe('the learning graph', () => {
  it('should define every concept once, with a peek and no article (owner 2026-11-18)', () => {
    expect(CONCEPTS.map((c) => c.id)).toEqual([...CONCEPT_IDS]);
    for (const c of CONCEPTS) {
      expect(c.peek.trim().length, c.id).toBeGreaterThan(0);
      expect(c.think.trim().length, c.id).toBeGreaterThan(0);
      // The Blog's articles stand apart from the lessons: a concept links to none
      expect(Object.keys(c), c.id).not.toContain('article');
    }
    expect(isConceptId('ledger')).toBe(true);
    expect(isConceptId('moon')).toBe(false);
    expect(() => getConcept('moon' as never)).toThrow();
  });

  it('should mark only known concepts in lesson cards (text and lines), at most two a card', () => {
    for (const lesson of LESSONS) {
      for (const card of lesson.cards) {
        const ids = cardTermIds(card);
        expect(ids.length, card.title).toBeLessThanOrEqual(2);
        for (const id of ids) expect(isConceptId(id), `${card.title}: ${id}`).toBe(true);
      }
    }
  });

  it('should send a term to the lesson card that teaches it', () => {
    // Lesson 2's "One record, many copies" marks the ledger (rewritten 2026-11-16)
    expect(lessonPlacesOf('ledger')).toEqual([{ lesson: 'lesson-ownership', screen: 5 }]);
  });

  it('should keep free things free: a free lesson never marks a paid concept', () => {
    for (const lesson of LESSONS) {
      if (lesson.access !== FREE) continue;
      for (const card of lesson.cards) {
        for (const id of cardTermIds(card)) {
          expect(getConcept(id as never).access, id).toBe(FREE);
        }
      }
    }
  });

  it('should find a concept for a tapped term, and nothing for an unknown one', () => {
    expect(conceptFor('candle')?.term).toBe('Candle');
    expect(conceptFor('nope')).toBeNull();
  });
});

describe('access', () => {
  it('should open free content for everyone and paid content only with its key', () => {
    expect(canOpen('learn.core', [])).toBe(true);
    expect(canOpen('drills.events', [])).toBe(false);
    expect(canOpen('drills.events', ['drills.events'])).toBe(true);
  });
});
