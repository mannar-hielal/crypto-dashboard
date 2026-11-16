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
  BITCOIN_BIRTH,
  type LessonQuestion,
} from '@/guide/lessons';
import { daySeconds } from '@/guide/lessonChartData';
import { isTourId } from '@/guide/tours';
import { ARTICLE_IDS, getArticle } from '@/learn/articles';
import { FREE } from '@/learn/access';
import { termIds } from '@/learn/terms';

const isWidgetId = (id: string) =>
  [
    'suncoin-notebook',
    'nora-cheats',
    'nora-edits',
    'order-book',
    'mailbox-steps',
    'stamp-check',
    'block-chain',
    'gossip',
    'node-jobs',
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
      it('should have at most 16 teaching cards (plus an opening and its quizzes) of at most 80 words each', () => {
        // The opening (a cold open, "meet your guides") hooks and a quiz card checks; the rest
        // teach. Owner 2026-11-16: the caps are raised to the benchmark's length (was 6)
        const teaching = lesson.cards.filter((c) => !c.beats && !c.meet && !c.quiz);
        expect(teaching.length).toBeGreaterThan(0);
        expect(teaching.length).toBeLessThanOrEqual(16);
        for (const card of lesson.cards) {
          expect(cardWords(card), card.title).toBeLessThanOrEqual(80);
          expect(
            !!card.text ||
              !!card.lines?.length ||
              !!card.beats?.length ||
              !!card.meet ||
              !!card.quiz,
            card.title
          ).toBe(true);
          // The Next button's words fit one line on a phone
          if (card.nextLabel) expect(card.nextLabel.length, card.title).toBeLessThanOrEqual(40);
        }
      });

      it('should ask 2 to 6 questions (the moment, the checks, the quizzes between cards), each with a valid answer and a why', () => {
        // Owner 2026-11-16: up to six, and the quizzes may sit between the cards
        const questions = [
          lesson.moment,
          ...lesson.checks,
          ...lesson.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
        ];
        expect(questions.length).toBeGreaterThanOrEqual(2);
        expect(questions.length).toBeLessThanOrEqual(6);
        expect(lesson.checks.length).toBeLessThanOrEqual(3);
        for (const q of questions) {
          expect(q.explain.trim().length, q.question).toBeGreaterThan(0);
          // Drag and drop and Match boxes grade the whole board (checked in their own rule)
          if (q.format === 'order' || q.format === 'match') continue;
          expect(q.correct, q.question).toBeGreaterThanOrEqual(0);
          expect(q.correct, q.question).toBeLessThan(q.options.length);
          expect(new Set(q.options).size, q.question).toBe(q.options.length);
        }
      });

      it('should have every card presented by a guide or a real photo, worried only for a warning', () => {
        for (const card of lesson.cards) {
          // A photo stands alone (owner 2026-11-08), as does a cold open's drawing (Lesson 3's
          // flash crash, 2026-11-12) and a quiz card (its question has its guide); every other
          // card has its guide
          if (!card.presenter) {
            expect(card.photo ?? (card.beats && card.art) ?? card.quiz, card.title).toBeDefined();
            continue;
          }
          expect(['tick', 'tock'], card.title).toContain(card.presenter.who);
          // Worried only for a real warning (owner 2026-10-24): a short's open-ended loss,
          // liquidation, a rug pull or a scam, never sharing a key
          if (card.presenter.mood === 'worried') {
            expect(card.text, card.title).toMatch(/liquidation|scam|rug pull|stop|share|warning/i);
          }
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

      it('should lead to a real next lesson, and say no hype', () => {
        if (lesson.next) {
          expect(isLessonId(lesson.next)).toBe(true);
          expect(lesson.next).not.toBe(lesson.id);
        }
        const all = JSON.stringify(lesson);
        for (const h of HYPE) expect(all, String(h)).not.toMatch(h);
      });

      it('should mark at most two terms a card, and end on two or three things the learner can do', () => {
        for (const card of lesson.cards) {
          expect(termIds(card.text ?? '').length, card.title).toBeLessThanOrEqual(2);
        }
        // A lesson with a recap sums up there (its can-do list may be empty)
        if (!lesson.recap) {
          expect(lesson.canDo.length).toBeGreaterThanOrEqual(2);
          expect(lesson.canDo.length).toBeLessThanOrEqual(3);
        }
        expect(lesson.access).toBe(FREE);
        for (const item of lesson.canDo) {
          if (item.article) expect(ARTICLE_IDS).toContain(item.article);
        }
      });

      it('should give every chart a sane window: markers and the freeze day inside it', () => {
        const scenes = [
          ...lesson.cards.flatMap((c) => (c.chart ? [c.chart] : [])),
          ...[
            lesson.moment,
            ...lesson.checks,
            ...lesson.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
          ].flatMap((q) => (q.chart ? [q.chart] : [])),
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

      it('should walk cards → moment → (cards) → try → questions → summary → close', () => {
        const kinds = lessonScreens(lesson).map((s) => s.kind);
        const split = (lesson.momentAfter ?? lesson.cards.length - 1) + 1;
        expect(kinds).toEqual([
          ...lesson.cards.slice(0, split).map(() => 'card'),
          'moment',
          ...lesson.cards.slice(split).map(() => 'card'),
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
      ['lesson-01', 1, 'Up, down and your first trade'],
      ['lesson-ownership', 2, 'Money nobody controls'],
      ['lesson-02', 3, 'News, swings and traps'],
    ]);
  });

  it('should teach Lesson 1’s trading basics in the approved order, and lead to Lesson 2 (owner 2026-11-16)', () => {
    const l = getLesson('lesson-01');
    expect(l.tour).toBe('buy-first-coin');
    expect(l.tryWidget).toBeUndefined();
    expect(l.next).toBe('lesson-ownership');
    expect(l.cards.map((c) => c.title)).toEqual([
      'Two pizzas',
      'Meet your guides',
      'Up or down, you can win',
      'Buy and Sell',
      'Quick check',
      'Quick check',
      'Going long',
      'A real long',
      'The result',
      'Close it to keep it',
      'Going short',
      'A real short',
      'The catch',
      'Quick check',
      'The market never sleeps',
      'Smaller coins swing harder',
      'Big swings, big risks',
    ]);
    // 22 screens with the close's streak (the benchmark's Lesson 1: about 23)
    expect(lessonScreens(l)).toHaveLength(21);
    // Your call follows the long-short-or-stay-out quiz
    expect(lessonScreens(l)[l.momentAfter! + 1]).toEqual({ kind: 'moment' });
    expect(l.cards[l.momentAfter!].quiz?.options[l.cards[l.momentAfter!].quiz!.correct]).toBe(
      'Stay out for now'
    );
  });

  it('should offer a practice trade from the Buy, long and short cards', () => {
    const l = getLesson('lesson-01');
    const practice = Object.fromEntries(
      l.cards.flatMap((c) => (c.practice ? [[c.title, c.practice.tour]] : []))
    );
    expect(practice).toEqual({
      'Buy and Sell': 'practice-buy',
      'Going long': 'practice-long',
      'Going short': 'practice-short',
    });
  });

  it('should make Lesson 1’s buy-or-sell quizzes follow a stated plan, never a guess', () => {
    const [first, second] = getLesson('lesson-01').cards.flatMap((c) =>
      c.quiz?.format === 'buy-sell' ? [c.quiz] : []
    );
    expect(first.plan).toMatch(/buy if a day closes above \$31,000.*closed at \$33,093/);
    expect(first.options[first.correct]).toBe('Buy');
    expect(first.chart?.planLine?.price).toBe(31_000);
    expect(second.plan).toMatch(/sell if a day closes below \$58,000.*closed at \$53,988/);
    expect(second.options[second.correct]).toBe('Sell');
    expect(second.chart?.planLine?.price).toBe(58_000);
    // The reveal is honest: it recovered, but not to the price paid
    expect(second.explain).toMatch(/about \$64,000.*still below the \$67,500/);
  });

  it('should teach Lesson 2’s why and how of Bitcoin in the approved order (owner 2026-11-16)', () => {
    const l = getLesson('lesson-ownership');
    expect(l.tryWidget).toBe('block-chain');
    expect(l.next).toBe('lesson-02');
    expect(l.cards.map((c) => c.title)).toEqual([
      'A headline in the first block',
      'From the price to the thing',
      '2008: trust broke',
      'A paper, then a block',
      'One record, many copies',
      'Sending bitcoin',
      'Two checks, then a block',
      'Sealed by hard work',
      'The hash links the chain',
      'Quick check',
      'No one in charge',
      'Quick check',
      'No borders',
      'Liquidity, briefly',
      'Money that runs code',
      'NFTs, briefly',
      'Quick check',
    ]);
    // 21 screens: the moment follows the NFT card, then the features quiz, the Try, the summary
    expect(lessonScreens(l)).toHaveLength(21);
    expect(lessonScreens(l)[l.momentAfter! + 1]).toEqual({ kind: 'moment' });
    // The cold open: the genesis block's headline, and the lesson's own length
    expect(l.cards[0].beats?.[0].text).toBe('3 January 2009 · The first block');
    expect(l.cards[0].beats?.at(-1)?.text).toContain(`${l.minutes} minutes`);
    // The quizzes: a payment's journey in order, then two Match boxes
    const quizzes = l.cards.flatMap((c) => (c.quiz ? [c.quiz] : []));
    expect(quizzes.map((q) => q.format)).toEqual(['order', 'match', 'match']);
    expect(quizzes[0].steps?.[0]).toBe('You sign the payment');
    // What the features quiz tests is taught first (fact check 2026-11-16)
    const charge = l.cards.find((c) => c.title === 'No one in charge')!;
    expect(charge.text).toMatch(/never be more than 21 million/);
    expect(charge.text).toMatch(/anyone can read the whole ledger/);
    // The birth story, staged in the summary
    expect(l.recap?.genesis).toBe(BITCOIN_BIRTH);
    expect(l.recap?.highlight?.text).toBe('That was the birth of Bitcoin.');
  });

  it('should tease each next lesson on its close', () => {
    // A concrete 2008: Lehman Brothers (the birth story Lesson 2 tells since the rewrite)
    expect(BITCOIN_BIRTH.lines[1].text).toMatch(/Lehman Brothers, a 158-year-old bank/);
    expect(getLesson('lesson-01').teaser).toMatch(/^Next: where Bitcoin came from/);
    expect(getLesson('lesson-ownership').teaser).toMatch(/^Next: why prices swing/);
    expect(getLesson('lesson-02').teaser).toBeUndefined();
  });

  it('should name the ledger, nodes, mining, the blockchain and decentralized in Lesson 2', () => {
    const l2 = getLesson('lesson-ownership');
    const terms = l2.cards.flatMap((c) => termIds(c.text ?? ''));
    for (const id of ['ledger', 'node', 'mining', 'blockchain', 'decentralized', 'liquidity']) {
      expect(terms, id).toContain(id);
    }
    // Proof of work, not "impossible to fake" (fact check 2026-11-16)
    const sealed = l2.cards.find((c) => c.title === 'Sealed by hard work')!;
    expect(sealed.text).toMatch(/redo that work/);
    expect(sealed.more).toEqual({ article: 'bitcoin-story', section: 'mining' });
  });

  it('should give every Choose buy or sell question Buy and Sell, a plan and a chart to reveal (owner 2026-11-16)', () => {
    // The plan decides the answer, never a guess: the plan is stated, and the chart freezes until
    // the answer, then shows what came next
    for (const l of LESSONS) {
      const questions = [
        l.moment,
        ...l.checks,
        ...l.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
      ];
      for (const q of questions.filter((x) => x.format === 'buy-sell')) {
        expect(q.options, `${l.id}: ${q.question}`).toEqual(['Buy', 'Sell']);
        expect(q.plan?.trim(), `${l.id}: ${q.question}`).toBeTruthy();
        expect(q.chart?.freezeAt, `${l.id}: ${q.question}`).toBeTruthy();
        expect([0, 1]).toContain(q.correct);
      }
    }
  });

  it('should give every Drag and drop or Match boxes question 3+ items, no options and correct 0 (owner 2026-11-16)', () => {
    for (const l of LESSONS) {
      const questions = [
        l.moment,
        ...l.checks,
        ...l.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
      ];
      for (const q of questions.filter((x) => x.format === 'order' || x.format === 'match')) {
        const items = q.format === 'order' ? q.steps : q.pairs?.map((p) => p.term);
        expect(items?.length ?? 0, `${l.id}: ${q.question}`).toBeGreaterThanOrEqual(3);
        expect(new Set(items).size, `${l.id}: ${q.question}`).toBe(items?.length);
        expect([q.options, q.correct], `${l.id}: ${q.question}`).toEqual([[], 0]);
      }
    }
  });

  it('should keep a card that is a quiz to its question alone (no text, lines, beats or meeting)', () => {
    for (const l of LESSONS) {
      for (const c of l.cards.filter((x) => x.quiz)) {
        expect([c.text, c.lines, c.beats, c.meet], `${l.id}: ${c.title}`).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
      }
    }
  });

  it('should only tease a next lesson that the close really offers', () => {
    // A teaser names what the close really offers (review #275): the next lesson. A close with no
    // way on has no teaser (Lesson 3 since the rewrite)
    for (const l of LESSONS) expect(!!l.teaser, l.id).toBe(!!l.next);
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
    expect(firstTaught.get('ledger')).toBe(2);
  });

  it('should open Lesson 1 on the pizzas: prices move, a lot', () => {
    const l = getLesson('lesson-01');
    const open = l.cards[0];
    // The real photo, credited, with no drawing and no guide
    expect(open.photo).toMatchObject({ credit: 'Photo: Laszlo Hanyecz' });
    expect(open.photo?.alt).toMatch(/Laszlo Hanyecz/);
    expect(open.art).toBeUndefined();
    expect(open.presenter).toBeUndefined();
    expect(open.beats?.map((b) => b.kind)).toEqual(['kicker', 'headline', 'fact', 'headline']);
    // The fact check (2026-11-16): the coins, not the pizzas, were worth about $41
    expect(open.beats![2].text).toBe('Back then, those coins were worth about $41.');
    expect(open.beats!.at(-1)!.text).toMatch(/Prices move\. A lot\./);
    // The guides introduce themselves, then say what the lesson teaches, in its own length
    expect(l.cards[1].meet?.tick).toMatch(/^Hi, I’m Pulin\./);
    expect(l.cards[1].meet?.tock).toMatch(/I’m Berwyn\./);
    expect(l.cards[1].meet?.lead).toBe(`In the next ${l.minutes} minutes you’ll learn:`);
    expect(l.cards[1].meet?.list).toHaveLength(3);
  });

  it('should sum a lesson up in a few lines, each opening a real section of its article', () => {
    for (const lesson of LESSONS) {
      if (!lesson.recap) continue;
      expect(lesson.recap.points.length, lesson.id).toBeGreaterThanOrEqual(2);
      // Up to five: Lesson 1's approved draft (owner 2026-11-16)
      expect(lesson.recap.points.length, lesson.id).toBeLessThanOrEqual(5);
      // A highlight may have no article: Lesson 1's ending has no Read more (owner 2026-11-12)
      const lines = [
        ...lesson.recap.points,
        ...(lesson.recap.highlight?.article
          ? [{ ...lesson.recap.highlight, article: lesson.recap.highlight.article }]
          : []),
      ];
      for (const point of lines) {
        // A line with no article yet is plain text (owner 2026-11-16)
        if (!point.article) continue;
        const ids = getArticle(point.article).blocks.flatMap((b) =>
          b.kind === 'h' && b.id ? [b.id] : []
        );
        if (point.section) expect(ids, point.text).toContain(point.section);
      }
    }
    // Lesson 1's summary (owner 2026-11-16): four plain lines (no article yet) and price swings
    const l = getLesson('lesson-01');
    expect(l.recap?.points.filter((p) => !p.article)).toHaveLength(4);
    expect(l.recap?.highlight?.text).toBe('Decide when and why before you click.');
  });

  it('should teach Lesson 3’s swings, news and traps in the approved order, and end on the path (owner 2026-11-16)', () => {
    const l = getLesson('lesson-02');
    expect(l.tour).toBe('primer');
    // No way on from the close: Lesson 1's Try already ran the buy and sell tours (review 2026-11-16)
    expect(l.next).toBeUndefined();
    expect(l.cards.map((c) => c.title)).toEqual([
      'One bitcoin for $8,200',
      'Why so much?',
      'Big swings, both ways',
      'News moves it, fast',
      'Same news, either way',
      'The power of hype',
      'Thousands of deals, one candle',
      'A market shock',
      'A plan beats panic',
      'Up, then down',
      'Thin or deep',
      'The $8,200 moment',
      'Bitcoin is deep',
      'Quick check',
      'A rug pull',
      'Check before you trust',
      'Quick check',
    ]);
    expect(lessonScreens(l)).toHaveLength(21);
    expect(l.cards[0].art).toBe('flashCrash');
    expect(l.cards[0].beats?.at(-1)?.text).toContain(`${l.minutes} minutes`);
    // The benchmark's company and token are gone; the examples are ours
    expect(JSON.stringify(l)).not.toMatch(/Tesla|Squid/);
    // The quizzes: Match boxes (situations), then the rug pull's steps in order
    const quizzes = l.cards.flatMap((c) => (c.quiz ? [c.quiz] : []));
    expect(quizzes.map((q) => q.format)).toEqual(['match', 'order']);
    expect(quizzes[1].steps?.at(-1)).toBe('The price collapses');
  });

  it('should put the moment after the halving card: the same news, either way', () => {
    const l = getLesson('lesson-02');
    expect(l.cards[l.momentAfter!].title).toBe('Same news, either way');
    expect(lessonScreens(l)[l.momentAfter! + 1]).toEqual({ kind: 'moment' });
    // Our numbers, from our candles (fact-checked 2026-11-16)
    expect(l.cards[l.momentAfter!].text).toMatch(/\$63,775.*\$58,299.*\$71,437/);
    expect(l.moment.explain).toMatch(/the halving went both ways/);
    // Volatility, both ways, and sizing for the fall
    const swing = l.cards[2];
    expect(termIds(swing.text ?? '')).toContain('volatility');
    expect(swing.text).toMatch(/size for the fall/i);
  });

  it('should praise the honest answer in Lesson 3’s moment, never a guessed direction', () => {
    const m = getLesson('lesson-02').moment;
    expect(m.options[m.correct]).toMatch(/know/i);
  });

  it('should not give the moment’s answer away on the card before it', () => {
    const l = getLesson('lesson-02');
    const before = l.cards[l.momentAfter ?? l.cards.length - 1];
    expect(before.text).not.toMatch(/15%|January 2024/i);
    // The question's chart stops on the day and plays on after the answer
    expect(l.moment.chart?.freezeAt).toBe('2024-01-10');
    expect(l.moment.context).toMatch(/stops on that day/);
  });

  it('should keep the guide who asks through the answer: a grin when right, calm (never worried) when not', () => {
    // Owner 2026-11-08: Berwyn asks, so Berwyn reacts, never a switch to Pulin
    // A made-up warning question (the rule, apart from any lesson)
    const q: LessonQuestion = {
      question: '“Support” asks for your recovery phrase. Do you share it?',
      options: ['Never', 'Only with support'],
      correct: 0,
      explain: 'Nobody genuine ever asks for it.',
      presenter: { who: 'tock', mood: 'worried' },
    };
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
    expect(questionGuide(getLesson('lesson-02').cards[13].quiz!, undefined)).toEqual({
      who: 'tock',
      mood: 'thinking',
    });
  });

  it('should keep every funnel step id within the server’s pattern, past each earlier version', () => {
    for (const lesson of LESSONS) {
      const ids = lessonScreens(lesson).map((_, i) => lessonStepId(lesson, i));
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\.[0-9]{1,3}$/);
      // A step names today's screen, and nothing below the base does
      expect(lessonScreenOfStep(lesson, (lesson.stepBase ?? 0) + 1)).toBe(0);
      if (lesson.stepBase) expect(lessonScreenOfStep(lesson, lesson.stepBase)).toBeNull();
    }
    // Rewritten 2026-11-16: past the versions' 1–20 and 21–40
    expect(getLesson('lesson-01').stepBase).toBe(60);
    // Rewritten 2026-11-16: Lessons 2 and 3 past their earlier versions' steps
    expect(getLesson('lesson-ownership').stepBase).toBe(60);
    expect(getLesson('lesson-02').stepBase).toBe(60);
  });
});
