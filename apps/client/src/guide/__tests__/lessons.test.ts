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
      it('should have at most five teaching cards (plus an opening) of at most 50 words each', () => {
        // The opening (a cold open, "meet your guides") hooks; the rest teach
        const teaching = lesson.cards.filter((c) => !c.beats && !c.meet);
        expect(teaching.length).toBeGreaterThan(0);
        expect(teaching.length).toBeLessThanOrEqual(5);
        for (const card of lesson.cards) {
          expect(cardWords(card), card.title).toBeLessThanOrEqual(50);
          expect(
            !!card.text || !!card.lines?.length || !!card.beats?.length || !!card.meet,
            card.title
          ).toBe(true);
          // The Next button's words fit one line on a phone
          if (card.nextLabel) expect(card.nextLabel.length, card.title).toBeLessThanOrEqual(40);
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
    expect(l.cards.map((c) => c.art)).toEqual([
      'pizzaNight',
      undefined,
      'money',
      'notebook',
      'oneNora',
      'ledger',
      'mailbox',
    ]);
  });

  it('should open Lesson 1 on the pizzas, with today’s number only as a lesson in hindsight', () => {
    const l = getLesson('lesson-01');
    const [open, ...rest] = l.cards;
    // Owner 2026-10-25, 2026-10-28: the price then, then the twist: nobody knew it would be a billion
    expect(open.beats?.map((b) => b.kind)).toEqual(['kicker', 'headline', 'fact', 'headline']);
    const last = open.beats!.at(-1)!;
    expect(last.text).toMatch(/nobody in that room knew/i);
    // No other dollar figure anywhere in the lesson: no price claims to judge in hindsight
    expect(JSON.stringify({ ...l, cards: rest })).not.toMatch(/\$\d/);
    // The guides introduce themselves, then say what the lesson answers
    expect(l.cards[1].meet).toMatchObject({ tick: 'Hi, I’m Tick.', tock: 'Hi, I’m Tock.' });
    expect(l.cards[1].meet?.lead).toMatch(/next 7 minutes/);
    expect(l.cards[1].meet?.list).toHaveLength(3);
  });

  it('should show what goes wrong with someone in charge before Lesson 1 names Satoshi', () => {
    const trust = getLesson('lesson-01').cards[2];
    expect(trust.title).toBe('Money runs on trust');
    expect(trust.text).toMatch(/print more|change the rules/);
    expect(trust.text).not.toMatch(/satoshi/i);
    // Tock says it straight, looking at the learner
    expect(trust.presenter).toMatchObject({ who: 'tock', mood: 'frank' });
  });

  it('should lay out Nora’s problem before Lesson 1 brings in Bitcoin’s answer', () => {
    const l = getLesson('lesson-01');
    const notebook = l.cards[3];
    expect(notebook.text).toMatch(/Emi, Leo and Sofia/);
    expect(notebook.text).not.toMatch(/bitcoin/i);
    const risks = l.cards[4];
    expect(risks.title).toBe('What can go wrong with one Nora?');
    expect(risks.points?.map((p) => p.label)).toEqual([
      'Print coins.',
      'Move yours.',
      'Rewrite history.',
      'Lose it all.',
    ]);
    expect(JSON.stringify(risks)).not.toMatch(/bitcoin/i);
    // The next card answers it: many copies, no Nora
    expect(risks.nextLabel).toBe('What if everyone kept a copy?');
    expect(l.cards[5].title).toBe('Many notebooks, no Nora');
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
