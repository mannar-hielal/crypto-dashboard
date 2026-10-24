import { describe, expect, it } from 'vitest';
import {
  LESSON_IDS,
  LESSONS,
  cardWords,
  getLesson,
  isLessonId,
  lessonScreens,
} from '@/guide/lessons';
import { daySeconds } from '@/guide/lessonChartData';
import { questionGuide } from '@/guide/lessons';
import { isTourId } from '@/guide/tours';
import { ARTICLE_IDS } from '@/learn/articles';
import { FREE } from '@/learn/access';
import { termIds } from '@/learn/terms';

const isWidgetId = (id: string) =>
  ['suncoin-notebook', 'nora-cheats', 'order-book', 'mailbox-steps'].includes(id);

/** Hype the education reports rule out (reports/: "trust is the product") */
const HYPE = [
  /trade like a pro/i,
  /get rich/i,
  /guaranteed/i,
  /to the moon/i,
  /explode/i,
  /\b\d{3,}%/, // "200–400% a week"
  /easy money/i,
];

describe('lessons', () => {
  it('should define every lesson id once, numbered in order', () => {
    expect(LESSONS.map((l) => l.id)).toEqual([...LESSON_IDS]);
    expect(LESSONS.map((l) => l.number)).toEqual(LESSONS.map((_, i) => i + 1));
    expect(isLessonId('lesson-02')).toBe(true);
    expect(isLessonId('primer')).toBe(false);
  });

  for (const lesson of LESSONS) {
    describe(lesson.id, () => {
      it('should have at most five cards of at most 50 words each', () => {
        expect(lesson.cards.length).toBeGreaterThan(0);
        expect(lesson.cards.length).toBeLessThanOrEqual(5);
        for (const card of lesson.cards) {
          expect(cardWords(card), card.title).toBeLessThanOrEqual(50);
          expect(!!card.text || !!card.lines?.length, card.title).toBe(true);
        }
      });

      it('should ask two or three questions, each with a valid answer and a why', () => {
        expect(lesson.checks.length).toBeGreaterThanOrEqual(2);
        expect(lesson.checks.length).toBeLessThanOrEqual(3);
        for (const q of [lesson.moment, ...lesson.checks]) {
          expect(q.correct, q.question).toBeGreaterThanOrEqual(0);
          expect(q.correct, q.question).toBeLessThan(q.options.length);
          expect(q.explain.trim().length, q.question).toBeGreaterThan(0);
          expect(new Set(q.options).size, q.question).toBe(q.options.length);
        }
      });

      it('should have every card presented by a guide, worried only for a warning', () => {
        for (const card of lesson.cards) {
          expect(['tick', 'tock'], card.title).toContain(card.presenter.who);
          expect(card.presenter.mood, card.title).not.toBe('worried');
        }
        for (const q of [lesson.moment, ...lesson.checks]) {
          if (q.presenter?.mood === 'worried') {
            expect(q.question, 'a worried guide warns').toMatch(/recovery phrase|share|support/i);
          }
        }
      });

      it('should have one "Try it": a tour on the real screen, or a piece inside the sheet', () => {
        expect(!!lesson.tour !== !!lesson.tryWidget).toBe(true);
        if (lesson.tour) expect(isTourId(lesson.tour)).toBe(true);
        if (lesson.tryWidget) expect(isWidgetId(lesson.tryWidget)).toBe(true);
      });

      it('should lead to a real next lesson or tour, and say no hype', () => {
        if (lesson.next?.kind === 'tour') expect(isTourId(lesson.next.id)).toBe(true);
        if (lesson.next?.kind === 'lesson') {
          expect(isLessonId(lesson.next.id)).toBe(true);
          expect(lesson.next.id).not.toBe(lesson.id);
        }
        const all = JSON.stringify(lesson);
        for (const h of HYPE) expect(all, String(h)).not.toMatch(h);
      });

      it('should mark at most two terms a card, and end on two or three things the learner can do', () => {
        for (const card of lesson.cards) {
          expect(termIds(card.text ?? '').length, card.title).toBeLessThanOrEqual(2);
        }
        expect(lesson.canDo.length).toBeGreaterThanOrEqual(2);
        expect(lesson.canDo.length).toBeLessThanOrEqual(3);
        expect(lesson.access).toBe(FREE);
        for (const item of lesson.canDo) expect(ARTICLE_IDS).toContain(item.article);
      });

      it('should give every chart a sane window: markers and the freeze day inside it', () => {
        const scenes = [
          ...lesson.cards.flatMap((c) => (c.chart ? [c.chart] : [])),
          ...[lesson.moment, ...lesson.checks].flatMap((q) => (q.chart ? [q.chart] : [])),
        ];
        for (const scene of scenes) {
          const end = daySeconds(scene.end);
          const start = end - (scene.bars - 1) * 86_400;
          expect(scene.bars, scene.label).toBeGreaterThan(0);
          expect(scene.bars, scene.label).toBeLessThanOrEqual(1000);
          for (const m of scene.markers) {
            expect(daySeconds(m.date), m.text).toBeGreaterThanOrEqual(start);
            expect(daySeconds(m.date), m.text).toBeLessThanOrEqual(end);
          }
          if (scene.freezeAt) {
            expect(daySeconds(scene.freezeAt)).toBeGreaterThanOrEqual(start);
            expect(daySeconds(scene.freezeAt)).toBeLessThan(end);
          }
        }
      });

      it('should walk cards → moment → try → questions → note → close', () => {
        const kinds = lessonScreens(lesson).map((s) => s.kind);
        expect(kinds).toEqual([
          ...lesson.cards.map(() => 'card'),
          'moment',
          'try',
          ...lesson.checks.map(() => 'check'),
          'note',
          'close',
        ]);
      });
    });
  }

  it('should have Lesson 1 explain Bitcoin, try Nora’s notebook, and lead to Lesson 2', () => {
    const l = getLesson('lesson-01');
    expect(l.title).toBe('What is Bitcoin?');
    expect(l.tryWidget).toBe('nora-cheats');
    expect(l.next).toEqual({ kind: 'lesson', id: 'lesson-02' });
    expect(l.cards.map((c) => c.art)).toEqual(['pizza', 'money', 'notebook', 'ledger', 'mailbox']);
    // No trading here, and no price claims to judge in hindsight
    expect(JSON.stringify(l)).not.toMatch(/\$\d/);
  });

  it('should have Lesson 2 wrap the primer and lead to the first buy', () => {
    const l = getLesson('lesson-02');
    expect(l.tour).toBe('primer');
    expect(l.next).toEqual({ kind: 'tour', id: 'buy-first-coin' });
    // Balanced history: a rise, a fall on news, and good news before a fall
    expect(l.cards.map((c) => c.art)).toEqual(['hook', 'queues', 'busy', 'tesla', 'etf']);
    // One bridge back to Lesson 1, and nothing from it repeated
    expect(l.cards[1].text).toContain('Lesson 1’s ledger');
    expect(l.cards.some((c) => /\[\[(ledger|blockchain)/.test(c.text ?? ''))).toBe(false);
  });

  it('should praise the honest answer in Lesson 2’s moment, never a guessed direction', () => {
    const m = getLesson('lesson-02').moment;
    expect(m.options[m.correct]).toMatch(/know/i);
  });

  it('should not give the moment’s answer away on the card before it', () => {
    const l = getLesson('lesson-02');
    const etf = l.cards[4];
    expect(etf.text).not.toMatch(/lower|fell|down|15%/i);
    // The card's chart stops on the day; the question's chart plays on after the answer
    expect(etf.chart?.freezeAt).toBe('2024-01-10');
    expect(l.moment.chart).toBe(etf.chart);
  });

  it('should have the guides react to an answer: a grin when right, calm (never worried) when not', () => {
    const q = getLesson('lesson-01').checks[1]; // the recovery-phrase scam
    expect(questionGuide(q, undefined)).toEqual({ who: 'tock', mood: 'worried' });
    expect(questionGuide(q, q.correct)).toEqual({ who: 'tick', mood: 'grin' });
    expect(questionGuide(q, (q.correct + 1) % q.options.length)).toEqual({
      who: 'tock',
      mood: 'calm',
    });
    // No presenter of its own: Tock thinks it over
    expect(questionGuide(getLesson('lesson-02').checks[0], undefined)).toEqual({
      who: 'tock',
      mood: 'thinking',
    });
  });
});
