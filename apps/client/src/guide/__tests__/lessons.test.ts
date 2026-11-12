import { describe, expect, it } from 'vitest';
import {
  LESSON_IDS,
  LESSONS,
  cardWords,
  getLesson,
  isLessonId,
  lessonScreenOfStep,
  lessonScreens,
  lessonStepId,
  questionGuide,
} from '@/guide/lessons';
import { daySeconds } from '@/guide/lessonChartData';
import { isTourId } from '@/guide/tours';
import { ARTICLE_IDS, getArticle } from '@/learn/articles';
import { FREE } from '@/learn/access';
import { getConcept, type ConceptId } from '@/learn/concepts';
import { termIds } from '@/learn/terms';

const isWidgetId = (id: string) =>
  [
    'suncoin-notebook',
    'nora-cheats',
    'nora-edits',
    'order-book',
    'mailbox-steps',
    'stamp-check',
  ].includes(id);

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
      it('should have at most six teaching cards (plus an opening) of at most 80 words each', () => {
        // The opening (a cold open, "meet your guides") hooks; the rest teach
        const teaching = lesson.cards.filter((c) => !c.beats && !c.meet);
        expect(teaching.length).toBeGreaterThan(0);
        expect(teaching.length).toBeLessThanOrEqual(6);
        for (const card of lesson.cards) {
          expect(cardWords(card), card.title).toBeLessThanOrEqual(80);
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

      it('should have every card presented by a guide or a real photo, worried only for a warning', () => {
        for (const card of lesson.cards) {
          // A photo stands alone (owner 2026-11-08); every other card has its guide
          if (!card.presenter) {
            expect(card.photo, card.title).toBeDefined();
            continue;
          }
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

      it('should walk cards → moment → try → questions → summary → close', () => {
        const kinds = lessonScreens(lesson).map((s) => s.kind);
        expect(kinds).toEqual([
          ...lesson.cards.map(() => 'card'),
          'moment',
          'try',
          ...lesson.checks.map(() => 'check'),
          'summary',
          'close',
        ]);
      });
    });
  }

  it('should number the lessons 1, 2, 3, keeping the stored ids (owner 2026-11-08)', () => {
    expect(LESSONS.map((l) => [l.id, l.number, l.title])).toEqual([
      ['lesson-01', 1, 'What is the problem?'],
      ['lesson-ownership', 2, 'What is Bitcoin?'],
      ['lesson-02', 3, 'Who sets the price?'],
    ]);
  });

  it('should have Lesson 1 set out the problem, try Nora’s notebook, and lead to Lesson 2', () => {
    const l = getLesson('lesson-01');
    expect(l.title).toBe('What is the problem?');
    expect(l.tryWidget).toBe('nora-edits');
    expect(l.next).toEqual({ kind: 'lesson', id: 'lesson-ownership' });
    expect(l.cards.map((c) => c.art)).toEqual([
      undefined,
      undefined,
      'money',
      'notebook',
      'oneNora',
    ]);
    // It ends on the question the next lesson answers
    expect(l.cards.at(-1)!.nextLabel).toBe('Could money work with no Nora?');
    expect(l.recap?.highlight?.text).toMatch(/birth of Bitcoin/);
  });

  it('should have Lesson 2 answer it, then show what makes coins yours', () => {
    const l = getLesson('lesson-ownership');
    expect(l.tryWidget).toBe('stamp-check');
    expect(l.next).toEqual({ kind: 'lesson', id: 'lesson-02' });
    expect(l.cards.map((c) => c.title)).toEqual([
      'A hard drive in the bin',
      'Money that no one controls',
      'One ledger, thousands of copies',
      'A mailbox and a key',
      'A stamp only you hold',
      'Your bitcoin isn’t in your phone',
      'Who holds your key?',
    ]);
    // A true cold open, with no dollar figure anywhere
    expect(l.cards[0].beats?.[0].text).toBe('2013 · Newport, Wales');
    // Owner 2026-11-12: the real photo, with no credit line, no drawing and no guide
    expect(l.cards[0].photo?.alt).toMatch(/James Howells/);
    // An explicit "no credit line" (the owner's rights, no attribution asked), never a forgotten one
    expect(l.cards[0].photo?.credit).toBeNull();
    expect(l.cards[0].art).toBeUndefined();
    expect(l.cards[0].presenter).toBeUndefined();
    // Owner 2026-11-12: no Nora (a learner may come back days later); the buttons walk the
    // process, receive → send (and the check) → where it is → who holds the key
    expect(JSON.stringify(l.cards)).not.toMatch(/Nora/);
    expect(l.cards.slice(1, -1).map((c) => c.nextLabel)).toEqual([
      'So who keeps the ledger?',
      'How do I receive bitcoin?',
      'How do I send it?',
      'So where is my bitcoin?',
      'Can someone hold my key for me?',
    ]);
    // No coins: a balance is the ledger added up
    expect(l.cards[5].text).toMatch(/no coins anywhere/);
    // …and no peek opened from its cards talks of coins either (review 2026-11-12)
    for (const card of l.cards) {
      for (const id of termIds(card.text ?? '')) {
        expect(getConcept(id as ConceptId).peek, id).not.toMatch(/\bcoins?\b/i);
        // …nor leans on Lesson 1's Nora (owner 2026-11-12: the node is a sceptical office worker)
        const concept = getConcept(id as ConceptId);
        expect(`${concept.peek} ${concept.think}`, id).not.toMatch(/Nora/);
      }
    }
    // Owner 2026-11-12: the Bitcoin card, the mark from Lesson 1's end, what sets it apart, and
    // the Read more that Lesson 1's ending no longer has
    const bitcoin = l.cards[1];
    expect(l.title).toBe('What is Bitcoin?');
    expect(bitcoin.art).toBe('bitcoin');
    expect(bitcoin.points?.map((p) => p.label)).toEqual([
      'No one in charge.',
      'A fixed supply.',
      'Open to check.',
      'Yours, with a key.',
    ]);
    expect(bitcoin.more).toEqual({ article: 'bitcoin-story' });
    expect(getLesson('lesson-01').recap?.highlight?.article).toBeUndefined();
    expect(JSON.stringify(l)).not.toMatch(/\$\d/);
  });

  it('should carry the Finelo review’s small wins (owner 2026-11-12)', () => {
    const l1 = getLesson('lesson-01');
    const l2 = getLesson('lesson-ownership');
    // A concrete 2008: Lehman Brothers
    expect(l1.recap?.genesis?.lines[1].text).toMatch(/Lehman Brothers, a 158-year-old bank/);
    // Lesson 2 says what it will teach, with its own length
    expect(l2.cards[0].beats?.at(-1)?.text).toBe(
      `In the next ${l2.minutes} minutes: what Bitcoin is, how you receive and send it, and why that key is everything.`
    );
    // One payment runs through the mechanism: Leo's address, Sofia's stamp, the ledger's line
    const titles = [
      'A mailbox and a key',
      'A stamp only you hold',
      'Your bitcoin isn’t in your phone',
    ];
    for (const title of titles) {
      const card = l2.cards.find((c) => c.title === title)!;
      expect(JSON.stringify(card), title).toMatch(/Sofia/);
      expect(JSON.stringify(card), title).toMatch(/Leo/);
    }
    // A bridge to this app, and a teaser on each close
    expect(l2.cards.at(-1)!.text).toMatch(
      /nothing is real bitcoin: your balance is virtual practice money/
    );
    // A paper-trading app holds no bitcoin: the card must never claim custody of it (review #275)
    expect(l2.cards.at(-1)!.text).not.toMatch(/the app holds/);
    expect(l1.teaser).toMatch(/^You’ve seen the problem\. Next/);
    expect(l2.teaser).toMatch(/^Next: who decides/);
  });

  it('should name block, hash, mining and decentralized in Lesson 2 (the Finelo gaps)', () => {
    const l2 = getLesson('lesson-ownership');
    const card = (title: string) => l2.cards.find((c) => c.title === title)!;
    expect(card('Money that no one controls').text).toContain('[[decentralized]]');
    expect(card('One ledger, thousands of copies').text).toMatch(/called a block.*called a hash/);
    // Owner 2026-11-12: mining sits on the ledger card, its Read more opening the mining section
    expect(card('One ledger, thousands of copies').text).toMatch(/added by miners/);
    expect(card('One ledger, thousands of copies').more).toEqual({
      article: 'bitcoin-story',
      section: 'mining',
    });
  });

  it('should only tease a next lesson that the close really offers', () => {
    // A teaser promises the next lesson, so it needs a lesson to go on to (review #275)
    for (const l of LESSONS) {
      if (l.teaser) expect(l.next?.kind, l.id).toBe('lesson');
    }
  });

  it('should start every lesson with an "Unlock" button on its first card', () => {
    // Owner 2026-11-12
    for (const l of LESSONS) expect(l.cards[0].nextLabel, l.id).toMatch(/^Unlock /);
  });

  it('should say "Lesson N" wherever a lesson reuses a term an earlier lesson taught', () => {
    const firstTaught = new Map<string, number>();
    for (const l of LESSONS) {
      for (const card of l.cards) {
        const ids = termIds(card.text ?? '');
        for (const id of ids) {
          const earlier = firstTaught.get(id);
          if (earlier !== undefined && earlier < l.number) {
            expect(card.text, `${l.id}: ${card.title}`).toMatch(
              new RegExp(`Lessons? (\\d and )?${earlier}`)
            );
          }
        }
        for (const id of ids) if (!firstTaught.has(id)) firstTaught.set(id, l.number);
      }
    }
    expect(firstTaught.get('ledger')).toBe(1);
  });

  it('should open Lesson 1 on the pizzas, with today’s number only as a lesson in hindsight', () => {
    const l = getLesson('lesson-01');
    const [open, ...rest] = l.cards;
    // The real photo, credited, with no drawing and no guide
    expect(open.photo).toMatchObject({ credit: 'Photo: Laszlo Hanyecz' });
    expect(open.photo?.alt).toMatch(/Laszlo Hanyecz/);
    expect(open.art).toBeUndefined();
    expect(open.presenter).toBeUndefined();
    // Owner 2026-10-25, 2026-10-28: the price then, then the twist: nobody knew it would be a billion
    expect(open.beats?.map((b) => b.kind)).toEqual(['kicker', 'headline', 'fact', 'headline']);
    const last = open.beats!.at(-1)!;
    expect(last.text).toMatch(/nobody in that room knew/i);
    // No other dollar figure anywhere in the lesson: no price claims to judge in hindsight
    expect(JSON.stringify({ ...l, cards: rest })).not.toMatch(/\$\d/);
    // The guides introduce themselves, then say what the lesson answers
    expect(l.cards[1].meet).toMatchObject({ tick: 'Hi, I’m Pulin.', tock: 'Hi, I’m Berwyn.' });
    expect(l.cards[1].meet?.lead).toMatch(/next 5 minutes/);
    expect(l.cards[1].meet?.list).toHaveLength(3);
  });

  it('should set the address and the key out as two points, each term still linked', () => {
    const card = getLesson('lesson-ownership').cards.find(
      (c) => c.title === 'A mailbox and a key'
    )!;
    expect(card.points?.map((p) => p.label)).toEqual(['Address.', 'Private key.']);
    expect(card.text).toContain('[[address]]');
    expect(card.text).toContain('[[private key|private-key]]');
  });

  it('should sum a lesson up in a few lines, each opening a real section of its article', () => {
    for (const lesson of LESSONS) {
      if (!lesson.recap) continue;
      expect(lesson.recap.points.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.recap.points.length, lesson.id).toBeLessThanOrEqual(4);
      // A highlight may have no article: Lesson 1's ending has no Read more (owner 2026-11-12)
      const lines = [
        ...lesson.recap.points,
        ...(lesson.recap.highlight?.article
          ? [{ ...lesson.recap.highlight, article: lesson.recap.highlight.article }]
          : []),
      ];
      for (const point of lines) {
        const ids = getArticle(point.article).blocks.flatMap((b) =>
          b.kind === 'h' && b.id ? [b.id] : []
        );
        if (point.section) expect(ids, point.text).toContain(point.section);
      }
    }
    // Lesson 1 names Satoshi only in its recap's story, once the problem is clear (owner
    // 2026-11-12): however → 2008 → banks failed → Satoshi, then the birth of Bitcoin
    const l = getLesson('lesson-01');
    const story = (l.recap?.genesis?.lines ?? []).map((line) => line.text);
    expect(story).toHaveLength(4);
    expect(story[0]).toMatch(/^However/);
    expect(story[1]).toMatch(/2008/);
    expect(story[2]).toMatch(/Banks failed/);
    expect(story[3]).toMatch(/Satoshi Nakamoto proposed money that no one holds or controls/);
    expect(l.recap?.highlight?.text).toBe('That was the birth of Bitcoin.');
    expect(l.recap?.points.map((p) => p.text).join(' ')).toMatch(/government or central bank/);
    expect(JSON.stringify(l.cards)).not.toMatch(/satoshi/i);
  });

  it('should show what goes wrong with someone in charge before Lesson 1 names Satoshi', () => {
    const trust = getLesson('lesson-01').cards[2];
    expect(trust.title).toBe('Money runs on trust');
    expect(trust.text).toMatch(/print more|change the rules/);
    expect(trust.text).not.toMatch(/satoshi/i);
    // Tock says it straight, looking at the learner
    expect(trust.presenter).toMatchObject({ who: 'tock', mood: 'frank' });
  });

  it('should end Lesson 1 on Nora’s problem, and leave Bitcoin’s answer to Lesson 2', () => {
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
    // Lesson 2 answers it: many copies
    expect(risks.nextLabel).toBe('Could money work with no Nora?');
    expect(getLesson('lesson-ownership').cards[2].title).toBe('One ledger, thousands of copies');
  });

  it('should have Lesson 3 wrap the primer and lead to the first buy', () => {
    const l = getLesson('lesson-02');
    expect(l.tour).toBe('primer');
    expect(l.next).toEqual({ kind: 'tour', id: 'buy-first-coin' });
    // Balanced history: a rise, a fall on news, and good news before a fall
    expect(l.cards.map((c) => c.art)).toEqual(['hook', 'queues', 'busy', 'tesla', 'etf']);
    // One bridge back to Lessons 1 and 2, and nothing from them repeated
    expect(l.cards[1].text).toContain('The ledger from Lessons 1 and 2');
    expect(l.cards.some((c) => /\[\[(ledger|blockchain)/.test(c.text ?? ''))).toBe(false);
  });

  it('should praise the honest answer in Lesson 3’s moment, never a guessed direction', () => {
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

  it('should keep the guide who asks through the answer: a grin when right, calm (never worried) when not', () => {
    // Owner 2026-11-08: Berwyn asks, so Berwyn reacts, never a switch to Pulin
    const q = getLesson('lesson-ownership').checks[0]; // the recovery-phrase scam
    expect(questionGuide(q, undefined)).toEqual({ who: 'tock', mood: 'worried' });
    expect(questionGuide(q, q.correct)).toEqual({ who: 'tock', mood: 'grin' });
    expect(questionGuide(q, (q.correct + 1) % q.options.length)).toEqual({
      who: 'tock',
      mood: 'calm',
    });
    // And Pulin, asking, stays Pulin
    const pulin = { ...q, presenter: { who: 'tick', mood: 'curious' } } as const;
    expect(questionGuide(pulin, q.correct)).toEqual({ who: 'tick', mood: 'grin' });
    expect(questionGuide(pulin, (q.correct + 1) % q.options.length)).toEqual({
      who: 'tick',
      mood: 'calm',
    });
    // No presenter of its own: Berwyn thinks it over
    expect(questionGuide(getLesson('lesson-02').checks[0], undefined)).toEqual({
      who: 'tock',
      mood: 'thinking',
    });
  });

  it('should keep every funnel step id within the server’s pattern, past each earlier version', () => {
    for (const lesson of LESSONS) {
      const ids = lessonScreens(lesson).map((_, i) => lessonStepId(lesson, i));
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\.[0-9]{1,2}$/);
      // A step names today's screen, and nothing below the base does
      expect(lessonScreenOfStep(lesson, (lesson.stepBase ?? 0) + 1)).toBe(0);
      if (lesson.stepBase) expect(lessonScreenOfStep(lesson, lesson.stepBase)).toBeNull();
    }
    expect(getLesson('lesson-01').stepBase).toBe(20);
    expect(getLesson('lesson-02').stepBase).toBe(20);
  });
});
