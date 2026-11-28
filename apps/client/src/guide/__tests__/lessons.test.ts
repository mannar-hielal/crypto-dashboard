import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_VERSIONS,
  LESSON_FIRST_STEPS,
  LESSON_VERSION_SPAN,
} from '@crypto-dashboard/sdk';
import { CHECKPOINTS } from '@/learn/checkpoints';
import {
  LESSON_IDS,
  LESSON_LABELS,
  LESSONS,
  cardTermIds,
  cardWords,
  getLesson,
  isLessonId,
  lessonScreenOfStep,
  lessonScreens,
  lessonStepId,
  questionGuide,
  type LessonQuestion,
  lessonOwnsTour,
  screenTour,
} from '@/guide/lessons';
import { daySeconds } from '@/guide/lessonChartData';
import { getTour, isTourId, PRACTICE_REVIEW_IDS, PRACTICE_TOUR_IDS, TOUR_IDS } from '@/guide/tours';
import { ARTICLES } from '@/blog/posts';
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

// Lessons that may ask more than six questions, each with the owner's date
const QUESTION_CAP_EXCEPTIONS: Partial<Record<string, number>> = {
  'lesson-wallets': 8, // owner 2026-11-22: two persona questions and the phrase quizzes
};

describe('lessons', () => {
  it('should never use * as a times sign in lesson copy (× is; * marks emphasis)', () => {
    // Emphasis markers sit flush against their text: a * with spaces on both sides ("(2 + 3) * 4",
    // "price * 2") or flush between digits ("5*3") is a times sign
    for (const lesson of LESSONS) {
      expect(JSON.stringify(lesson), lesson.id).not.toMatch(/\s\*\s|\d\*\d/);
    }
  });

  // (Articles, checkpoints and the tours' quiz Whys render through RichText; tour step text is plain,
  // where a times-sign * is harmless but still wrong: one rule for all the copy)
  it('should never use * as a times sign in articles, checkpoints or tours either', () => {
    const tours = [...TOUR_IDS, ...PRACTICE_TOUR_IDS, ...PRACTICE_REVIEW_IDS].map(getTour);
    for (const [name, data] of [
      ['articles', ARTICLES],
      ['checkpoints', CHECKPOINTS],
      ['tours', tours],
    ] as const) {
      expect(JSON.stringify(data), name).not.toMatch(/\s\*\s|\d\*\d/);
    }
  });

  it('should take a spaced or digit-flush * for a times sign, never an emphasis marker', () => {
    const timesSign = /\s\*\s|\d\*\d/;
    for (const sum of ['(2 + 3) * 4', '10% * 3', 'price * 2', '5*3']) {
      expect(sum).toMatch(timesSign);
    }
    for (const markup of ['**19%**', 'a *word* here', 'about **$459**, before']) {
      expect(markup).not.toMatch(timesSign);
    }
  });

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
        const teaching = lesson.cards.filter((c) => !c.beats && !c.meet && !c.quiz && !c.preview);
        expect(teaching.length).toBeGreaterThan(0);
        expect(teaching.length).toBeLessThanOrEqual(16);
        for (const card of lesson.cards) {
          expect(cardWords(card), card.title).toBeLessThanOrEqual(80);
          expect(
            !!card.text ||
              !!card.lines?.length ||
              !!card.beats?.length ||
              !!card.meet ||
              !!card.preview ||
              !!card.quiz,
            card.title
          ).toBe(true);
        }
      });

      it('should open with a sneak peek, never the guides’ chat (owner 2026-11-22)', () => {
        // Lesson 1's "Meet your guides" card is its peek (it already lists what you will learn);
        // every other lesson has a "What you will learn" card as card 1 or 2, drawn from its recap
        if (lesson.id === 'lesson-01') {
          expect(lesson.cards[1].meet?.list.length).toBeGreaterThanOrEqual(3);
          return;
        }
        const at = lesson.cards.findIndex((c) => c.preview);
        expect([0, 1], lesson.id).toContain(at);
        const peek = lesson.cards[at];
        expect(peek.title).toBe('What you will learn');
        // Its own graphic, derived from the lesson's topics, with a guide pointing at it (owner 2026-11-22)
        expect(peek.art, 'the picture on top').toMatch(/^peek[A-Z]/);
        expect(peek.presenter?.pose, 'a guide points at it').toBe('point');
        expect(peek.preview!.length).toBeGreaterThanOrEqual(3);
        expect(peek.preview!.length).toBeLessThanOrEqual(4);
        for (const line of peek.preview!) {
          expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(16);
        }
        // The opening card is never the guides' back-and-forth
        expect(lesson.cards[0].lines, lesson.id).toBeUndefined();
      });

      it('should ask 2 to 6 questions (the moment, the checks, the quizzes between cards), each with a valid answer and a why', () => {
        // Owner 2026-11-16: up to six, and the quizzes may sit between the cards. Lesson 7 may ask
        // eight (owner 2026-11-22: the wallet lesson's two persona questions and its phrase quizzes)
        const questions = [
          lesson.moment,
          ...lesson.checks,
          ...lesson.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
        ];
        expect(questions.length).toBeGreaterThanOrEqual(2);
        expect(questions.length).toBeLessThanOrEqual(QUESTION_CAP_EXCEPTIONS[lesson.id] ?? 6);
        expect(lesson.checks.length).toBeLessThanOrEqual(3);
        for (const q of questions) {
          expect(q.explain.trim().length, q.question).toBeGreaterThan(0);
          // Drag and drop, Match boxes, Pick and Draw a line grade the whole board (checked in their own rules)
          if (['order', 'match', 'pick', 'draw'].includes(q.format ?? '')) continue;
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
            expect(
              card.photo ?? (card.beats && card.art) ?? card.quiz ?? (card.preview && card.art),
              card.title
            ).toBeDefined();
            continue;
          }
          expect(['tick', 'tock'], card.title).toContain(card.presenter.who);
          // Worried only for a real warning (owner 2026-10-24): a short's open-ended loss,
          // liquidation, a rug pull or a scam, never sharing a key
          if (card.presenter.mood === 'worried') {
            // In its text or its guide's line (The catch: Berwyn's line, after the math, 2026-11-17)
            const said = [card.text ?? '', ...(card.lines ?? []).map((l) => l.text)].join(' ');
            expect(said, card.title).toMatch(/liquidation|scam|rug pull|stop|share|warning/i);
          }
        }
        for (const q of [lesson.moment, ...lesson.checks]) {
          if (q.presenter?.mood === 'worried') {
            expect(q.question, 'a worried guide warns').toMatch(/recovery phrase|share|support/i);
          }
        }
      });

      it('should work every sum in numbered steps, one operation each, by a guide (owner 2026-11-17)', () => {
        for (const card of lesson.cards) {
          if (!card.math) continue;
          const { who, steps, answer } = card.math;
          expect(['tick', 'tock'], card.title).toContain(who);
          expect(steps.length, card.title).toBeGreaterThanOrEqual(2);
          expect(steps.length, card.title).toBeLessThanOrEqual(6);
          for (const step of steps) {
            // A short label, then one operation and its result
            expect(step.label.length, step.label).toBeLessThanOrEqual(24);
            expect(step.sum, step.label).toMatch(/^[^=≈]+ [−+×÷] [^=≈]+ [=≈] [^=≈]+$/);
          }
          expect(answer.trim(), card.title).not.toBe('');
          // A worked sum sits on a teaching card, never a quiz
          expect(card.quiz, card.title).toBeUndefined();
        }
      });

      it('should tell an analogy by one guide, on a card without the guides’ chit-chat (owner 2026-11-17)', () => {
        for (const card of lesson.cards) {
          if (!card.analogy) continue;
          expect(['tick', 'tock'], card.title).toContain(card.analogy.who);
          expect(card.lines, card.title).toBeUndefined();
          expect(card.analogy.text, card.title).toMatch(/^Think of it as /);
        }
      });

      it('should have one "Try it": a tour on the real screen, or a piece inside the sheet', () => {
        // A Try it screen always has its intro line
        if (lesson.tour || lesson.tryWidget)
          expect(lesson.tryIntro?.trim(), lesson.id).toBeTruthy();
        // Lessons 4 to 6 have no Try it screen (owner 2026-11-18); Lesson 6 offers its practice buy on a card
        if (
          lesson.id === 'lesson-04' ||
          lesson.id === 'lesson-coins' ||
          lesson.id === 'lesson-stablecoins' ||
          lesson.id === 'lesson-wallets' ||
          lesson.id === 'lesson-fees' ||
          lesson.id === 'lesson-dapps'
        ) {
          expect([lesson.tour, lesson.tryWidget, lesson.tryIntro]).toEqual([
            undefined,
            undefined,
            undefined,
          ]);
          return;
        }
        expect(!!lesson.tour !== !!lesson.tryWidget).toBe(true);
        if (lesson.tour) expect(isTourId(lesson.tour)).toBe(true);
        if (lesson.tryWidget) expect(isWidgetId(lesson.tryWidget)).toBe(true);
      });

      it('should lead to a real next lesson, and say no hype', () => {
        if (lesson.next) {
          expect(isLessonId(lesson.next)).toBe(true);
          expect(lesson.next).not.toBe(lesson.id);
        }
        // A worked sum's real result may pass 100% (Lesson 1's long: 166%, owner 2026-11-17): the
        // percent rule reads everything else, the other words the math too
        const cards = lesson.cards.map((card) => ({ ...card, math: undefined }));
        const all = JSON.stringify({ ...lesson, cards });
        for (const h of HYPE) expect(all, String(h)).not.toMatch(h);
        const sums = JSON.stringify(lesson.cards.map((c) => c.math ?? null));
        for (const h of HYPE.filter((x) => !x.source.includes('%'))) {
          expect(sums, String(h)).not.toMatch(h);
        }
      });

      it('should mark at most two terms a card, and end on two or three things the learner can do', () => {
        // Its text and its guides' lines together (both open the peek since 2026-11-17)
        for (const card of lesson.cards) {
          expect(cardTermIds(card).length, card.title).toBeLessThanOrEqual(2);
        }
        // A lesson with a recap sums up there (its can-do list may be empty)
        if (!lesson.recap) {
          expect(lesson.canDo.length).toBeGreaterThanOrEqual(2);
          expect(lesson.canDo.length).toBeLessThanOrEqual(3);
        }
        expect(lesson.access).toBe(FREE);
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
          ...(lesson.tour || lesson.tryWidget ? ['try'] : []),
          ...lesson.checks.map(() => 'check'),
          'summary',
          'close',
        ]);
      });
    });
  }

  it('should number the lessons in order, keeping the stored ids (owner 2026-11-08)', () => {
    expect(LESSONS.map((l) => [l.id, l.number, l.title])).toEqual([
      ['lesson-01', 1, 'Up, down and your first trade'],
      ['lesson-ownership', 2, 'Money nobody controls'],
      ['lesson-02', 3, 'News, swings and traps'],
      ['lesson-04', 4, 'Trader or investor? Find your style'],
      ['lesson-coins', 5, 'Coins and tokens: who has their own road'],
      ['lesson-stablecoins', 6, 'Stablecoins: the coins that try to sit still'],
      ['lesson-wallets', 7, 'Your wallet, your keys: who holds them?'],
      ['lesson-fees', 8, 'Why sending crypto costs a fee'],
      ['lesson-dapps', 9, 'Trading without a middleman: DApps and pools'],
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

  it('should work out Lesson 1’s long and short in numbered steps, from the cards’ own prices', () => {
    const l = getLesson('lesson-01');
    const card = (title: string) => l.cards.find((c) => c.title === title)!;
    // The result (owner 2026-11-17): rewritten around the math, the hindsight line dropped
    const result = card('The result');
    expect(result.lines).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/hindsight/i);
    // A spot buy, so Bybit's spot closes (fact check 2026-11-17): 27,499.97 → 73,079.40
    const long = card('A real long');
    expect(result.text).toMatch(/\$27,500.*\$73,079/);
    expect(long.text).toMatch(/spot market.*\$27,500.*\$73,079/);
    expect(long.chart?.category).toBe('spot');
    expect(long.chart?.markers.map((m) => m.text)).toEqual(['Buy $27,500', 'Sell $73,079']);
    expect(result.math?.steps.map((x) => x.sum)).toEqual([
      '73,079 − 27,500 = 45,579',
      '45,579 ÷ 27,500 = 1.657',
      '1.657 × 100 = 165.7%',
      '$1,000 × 1.657 = $1,657',
      '$1,000 + $1,657 = $2,657',
      '$2,657 × 0.998 ≈ $2,652',
    ]);
    expect(result.math?.answer).toMatch(/about 166%.*\$2,652.*\$1,652 profit/);
    // Every other scene stays on the perpetual
    const scenes = l.cards.flatMap((c) => [c.chart, c.quiz?.chart]).filter((x) => x !== undefined);
    expect(scenes.filter((x) => x !== long.chart).every((x) => x.category === undefined)).toBe(
      true
    );
    // The catch: the short's numbers match the chart's markers and the card before it
    const short = card('A real short');
    expect(short.text).toMatch(/\$64,894.*0\.01 BTC.*\$18,965/);
    const caught = card('The catch');
    expect(caught.math?.steps.map((x) => x.sum)).toEqual([
      '0.01 × 64,894 = $648.94',
      '0.01 × 18,965 = $189.65',
      '$648.94 − $189.65 = $459.29',
      '459.29 ÷ 648.94 = 0.708',
      '0.708 × 100 = 70.8%',
    ]);
    expect(caught.lines?.[0].text).toMatch(/^Now the catch/);
    // One phrase for closing a position, as the practice reviews say it (fact check 2026-11-17)
    expect(card('Close it to keep it').text).toContain(
      'In our app that’s the ✕ (Close) at the end of your position row.'
    );
    // Fact check 2026-11-17: liquidation comes before the margin runs out, and the margin is lost
    expect(caught.lines?.[0].text).toContain(
      'the exchange closes a losing short before your margin runs out (liquidation), and that margin is lost'
    );
    // Going short: the borrowing analogy, by one guide, in place of the guides' exchange
    const short2 = card('Going short');
    expect(short2.analogy?.text).toMatch(/borrow.*give it back.*keep \$20/);
    // Fact check 2026-11-17: where the analogy stops matching names the margin and the funding fee
    expect(short2.analogy?.text).toMatch(
      /Our perpetual borrows nothing: you put up USDT as margin, the contract settles the difference in USDT, and while it’s open you pay or receive a small funding fee\.$/
    );
    expect(cardWords(short2)).toBeLessThanOrEqual(80);
    expect(short2.practice?.tour).toBe('practice-short');
  });

  it('should add the math wherever the lessons work out a gain, a loss or a percent', () => {
    const titles = LESSONS.flatMap((l) => l.cards.filter((c) => c.math).map((c) => c.title));
    expect(titles).toEqual([
      'The result',
      'The catch',
      'Smaller coins swing harder',
      'Big swings, both ways',
      'Up, then down',
      'A trader’s day',
      'An investor’s year',
      'Two assets, one week',
      'Park your profit',
      'Is it worth it?',
      'Scoop a token, move the price',
    ]);
  });

  it('should keep Lesson 3’s math only where it teaches the card’s percent (owner review 2026-11-17)', () => {
    const l = getLesson('lesson-02');
    const card = (title: string) => l.cards.find((c) => c.title === title)!;
    // Kept: the text never gives the percent; the sum gives "a third", the sizing rule's number
    const swings = card('Big swings, both ways');
    expect(swings.text).not.toMatch(/\d+%/);
    expect(swings.text).toMatch(/drop by a third/);
    expect(swings.math?.answer).toMatch(/33%.*a third/);
    // Kept: the text says "more than half"; the sum proves it from the two closes
    const peak = card('Up, then down');
    expect(peak.text).toMatch(/more than half/);
    expect(peak.math?.steps.at(-1)?.sum).toBe('0.532 × 100 = 53.2%');
    // Removed: the text already states the 23%, and the card is about one company shaking the market
    const shock = card('A market shock');
    expect(shock.math).toBeUndefined();
    expect(shock.text).toMatch(/down about 23%/);
  });

  it('should give the cards a picture that tells them where one helps (owner 2026-11-17)', () => {
    const art = (id: 'lesson-01' | 'lesson-ownership' | 'lesson-02') =>
      Object.fromEntries(getLesson(id).cards.flatMap((c) => (c.art ? [[c.title, c.art]] : [])));
    expect(art('lesson-01')).toEqual({
      'Up or down, you can win': 'threePaths',
      'Buy and Sell': 'buySell',
      'Close it to keep it': 'closeToKeep',
      'Going short': 'shortGame',
      'The market never sleeps': 'alwaysOpen',
    });
    expect(art('lesson-ownership')).toEqual({
      'A headline in the first block': 'bitcoin',
      'What you will learn': 'peekOwnership',
      'One record, many copies': 'ledger',
      'Sealed by hard work': 'sealBroken',
      'The hash links the chain': 'hashChain',
    });
    // Lesson 3 keeps its pictures as they were
    expect(art('lesson-02')).toEqual({
      'One Bitcoin for $8,200': 'flashCrash',
      'What you will learn': 'peekSwings',
      'Thousands of deals, one candle': 'candleAnatomy',
      'Thin or deep': 'deepThin',
      'The $8,200 moment': 'staircase',
      'Check before you trust': 'checkCoin',
    });
    // Going short's picture matches its analogy's numbers
    const short = getLesson('lesson-01').cards.find((c) => c.title === 'Going short')!;
    expect(short.analogy?.text).toMatch(/\$60.*\$40.*keep \$20/);
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
      'What you will learn',
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
    // 22 screens (the sneak peek is card 2, owner 2026-11-22): the moment follows the NFT card, then the features quiz, the Try, the summary
    expect(lessonScreens(l)).toHaveLength(22);
    expect(lessonScreens(l)[l.momentAfter! + 1]).toEqual({ kind: 'moment' });
    // The cold open: the genesis block's headline, and the lesson's own length
    expect(l.cards[0].beats?.[0].text).toBe('3 January 2009 · The first block');
    // The cold open no longer announces what you will learn: the sneak peek next does (2026-11-22)
    expect(JSON.stringify(l.cards[0].beats)).not.toMatch(/In the next \d+ minutes/);
    // The quizzes: a payment's journey in order, then two Match boxes
    const quizzes = l.cards.flatMap((c) => (c.quiz ? [c.quiz] : []));
    expect(quizzes.map((q) => q.format)).toEqual(['order', 'match', 'match']);
    expect(quizzes[0].steps?.[0]).toBe('You sign the payment');
    // What the features quiz tests is taught first (fact check 2026-11-16)
    const charge = l.cards.find((c) => c.title === 'No one in charge')!;
    expect(charge.text).toMatch(/never be more than 21 million/);
    expect(charge.text).toMatch(/anyone can read the whole ledger/);
    // The summary: plain points, no staged birth story (owner 2026-11-17); the actual why first
    // (fact check 2026-11-17); no article links since 2026-11-18
    expect(l.recap?.title).toBe('Why Bitcoin exists');
    expect(l.recap?.points.map((p) => p.text)).toEqual([
      'Bitcoin was made so people can pay each other online without trusting a bank in the middle.',
      'Bitcoin keeps one ledger, copied on thousands of computers.',
      'Nodes check every payment, and blocks are linked by their hash.',
      'No one is in charge: the network agrees.',
    ]);
    expect(Object.keys(l.recap ?? {})).toEqual(['title', 'points']);
  });

  it('should tease each next lesson on its close', () => {
    // A concrete 2008: Lehman Brothers, on Lesson 2's own card
    expect(
      getLesson('lesson-ownership').cards.find((c) => c.title === '2008: trust broke')?.text
    ).toMatch(/Lehman Brothers, a bank founded in 1850/);
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

  it('should give every Pick question 4+ tiles with 2+ right ones, no options and correct 0 (owner 2026-11-18)', () => {
    for (const l of LESSONS) {
      const questions = [
        l.moment,
        ...l.checks,
        ...l.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
      ];
      for (const q of questions.filter((x) => x.format === 'pick')) {
        const tiles = q.tiles ?? [];
        expect(tiles.length, `${l.id}: ${q.question}`).toBeGreaterThanOrEqual(4);
        expect(
          tiles.filter((t) => t.right).length,
          `${l.id}: ${q.question}`
        ).toBeGreaterThanOrEqual(2);
        expect(
          tiles.filter((t) => !t.right).length,
          `${l.id}: ${q.question}`
        ).toBeGreaterThanOrEqual(1);
        expect(new Set(tiles.map((t) => t.label)).size, `${l.id}: ${q.question}`).toBe(
          tiles.length
        );
        expect([q.options, q.correct], `${l.id}: ${q.question}`).toEqual([[], 0]);
      }
    }
  });

  it('should give every Draw a line question a chart that holds its buy and sell days, a hint and no options (owner 2026-11-18)', () => {
    for (const l of LESSONS) {
      const questions = [
        l.moment,
        ...l.checks,
        ...l.cards.flatMap((c) => (c.quiz ? [c.quiz] : [])),
      ];
      for (const q of questions.filter((x) => x.format === 'draw')) {
        const where = `${l.id}: ${q.question}`;
        expect(q.draw, where).toBeDefined();
        expect(q.chart, where).toBeDefined();
        expect(q.draw?.hint.trim(), where).toBeTruthy();
        expect([q.options, q.correct], where).toEqual([[], 0]);
        const end = daySeconds(q.chart!.end);
        const start = end - (q.chart!.bars - 1) * 86_400;
        const buy = daySeconds(q.draw!.buy.date);
        const sell = daySeconds(q.draw!.sell.date);
        expect(buy, where).toBeGreaterThanOrEqual(start);
        expect(sell, where).toBeLessThanOrEqual(end);
        expect(sell, where).toBeGreaterThan(buy);
        // The chart gives nothing away: no markers on the days to find
        expect(q.chart!.markers, where).toEqual([]);
      }
    }
  });

  it('should keep Lesson 4’s worked sums true to the dated prices on its cards (fact check 2026-11-18)', () => {
    const l = getLesson('lesson-04');
    const pct = (from: number, to: number) => ((to - from) / from) * 100;
    // A trader's day: 22 Apr 2025, low 87,013.60, high 94,000.00
    expect(pct(87_013.6, 94_000)).toBeCloseTo(8.03, 2);
    // An investor's year: closes 1 Nov 2024 and 1 Nov 2025
    expect(pct(69_495.5, 110_046)).toBeCloseTo(58.35, 2);
    // The traced trade: closes 8 and 22 Apr 2025
    expect(pct(76_286.9, 93_400)).toBeCloseTo(22.43, 2);
    const day = l.cards.find((c) => c.title === 'A trader’s day')!;
    expect(day.math?.steps.map((s) => s.sum)).toEqual([
      '94,000.00 − 87,013.60 = 6,986.40',
      '6,986.40 ÷ 87,013.60 = 0.0803',
      '0.0803 × 100 = 8.03%',
    ]);
    const year = l.cards.find((c) => c.title === 'An investor’s year')!;
    expect(year.math?.steps.map((s) => s.sum)).toEqual([
      '110,046.00 − 69,495.50 = 40,550.50',
      '40,550.50 ÷ 69,495.50 = 0.5835',
      '0.5835 × 100 = 58.35%',
    ]);
    // Each marker's price is the figure its card quotes
    expect(day.chart?.markers.map((m) => m.text)).toEqual(['High $94,000.00', 'Low $87,013.60']);
    expect(year.chart?.markers.map((m) => m.text)).toEqual(['$69,495.50', '$110,046.00']);
  });

  it('should have Lesson 4 teach trading and investing, with Lena and Zoe each on one quiz (owner 2026-11-18)', () => {
    const l = getLesson('lesson-04');
    // The two friends' questions are plain multiple choice (no format of their own)
    expect(l.cards.flatMap((c) => (c.quiz ? [c.quiz.format ?? 'choice'] : []))).toEqual([
      'draw',
      'pick',
      'choice',
      'choice',
    ]);
    const friends = l.cards.filter((c) => c.quiz?.art);
    expect(friends.map((c) => c.quiz?.art)).toEqual(['lena', 'zoe']);
    // Pulin speaks for the trader mood, Berwyn for the investor mood
    expect(l.cards.find((c) => c.title === 'What trading is')?.presenter?.who).toBe('tick');
    expect(l.cards.find((c) => c.title === 'What investing is')?.presenter?.who).toBe('tock');
    // Chapter 1's stored ids and this lesson's first step agree with the server's floor (100 since
    // the sneak peek card, 2026-11-22)
    expect(l.stepBase).toBe(100);
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

  it('should start each lesson’s steps where the server expects its current version', () => {
    // The server refuses a start or finish below it (a client on an earlier version): the SDK's
    // LESSON_FIRST_STEPS is the shared number, and a server test holds its copy to it too
    for (const l of LESSONS) expect((l.stepBase ?? 0) + 1, l.id).toBe(LESSON_FIRST_STEPS[l.id]);
  });

  it('should fit each lesson’s screens in one version’s span, which the server refuses past', () => {
    for (const l of LESSONS)
      expect(lessonScreens(l).length, l.id).toBeLessThanOrEqual(LESSON_VERSION_SPAN);
  });

  it('should start each lesson’s steps above every step its earlier versions used', () => {
    // An earlier version's step in the current range would count as today's (its rows, its
    // finishes). On a rebuild, record the version replaced here (stepBase + its screens) and raise
    // stepBase above it. Measured on main before the 2026-11-16 rewrite
    const EARLIER_LAST_STEPS: Record<string, number> = {
      'lesson-01': 32,
      'lesson-ownership': 34,
      'lesson-02': 54,
    };
    // The sneak peek card (owner 2026-11-22) moved Lessons 2 to 4 again: the versions replaced then,
    // stepBase 60 plus their screens (21, 21 and 19), now start from 100
    Object.assign(EARLIER_LAST_STEPS, { 'lesson-ownership': 81, 'lesson-02': 81, 'lesson-04': 79 });
    for (const l of LESSONS) {
      expect((l.stepBase ?? 0) + 1, l.id).toBeGreaterThan(EARLIER_LAST_STEPS[l.id] ?? 0);
    }
  });

  it('should version each checkpoint as the SDK does, which the server holds its copy to', () => {
    // A pass carries it; the server ignores a pass from an earlier question set (owner 2026-11-17)
    for (const c of CHECKPOINTS) expect(c.version, c.id).toBe(CHECKPOINT_VERSIONS[c.id]);
  });

  it('should give each drag-and-drop step and each match a text of its own (their keys)', () => {
    for (const l of LESSONS) {
      for (const q of [
        ...l.checks,
        ...(l.cards.map((c) => c.quiz).filter(Boolean) as LessonQuestion[]),
      ]) {
        if (q.steps) expect(new Set(q.steps).size, q.question).toBe(q.steps.length);
        if (q.pairs) {
          expect(new Set(q.pairs.map((p) => p.term)).size, q.question).toBe(q.pairs.length);
          expect(new Set(q.pairs.map((p) => p.meaning)).size, q.question).toBe(q.pairs.length);
        }
      }
    }
  });

  it('should say which tours are a lesson’s own: its Try tour and its cards’ practice trades', () => {
    expect(lessonOwnsTour(getLesson('lesson-01'), 'buy-first-coin')).toBe(true);
    expect(lessonOwnsTour(getLesson('lesson-01'), 'practice-buy')).toBe(true);
    expect(lessonOwnsTour(getLesson('lesson-01'), 'primer')).toBe(false);
    expect(lessonOwnsTour(getLesson('lesson-02'), 'primer')).toBe(true);
    const l1 = getLesson('lesson-01');
    expect(
      screenTour(
        l1,
        lessonScreens(l1).find((s) => s.kind === 'try')
      )
    ).toBe('buy-first-coin');
    expect(screenTour(l1, { kind: 'close' })).toBeUndefined();
  });

  it('should only tease a next lesson that the close really offers', () => {
    // A teaser names what the close really offers (review #275): the next lesson. A close with no
    // way on has no teaser (Lesson 3 since the rewrite)
    for (const l of LESSONS) expect(!!l.teaser, l.id).toBe(!!l.next);
  });

  it('should give no card a button label of its own: Continue, Back and Finish lesson everywhere', () => {
    // Owner 2026-11-17 (replacing 2026-11-12's "Unlock …" first button and the question-style
    // labels): one label set, in the sheet (LESSON_LABELS); a card's data can't carry another
    for (const l of LESSONS) {
      for (const card of l.cards) expect(Object.keys(card), card.title).not.toContain('nextLabel');
    }
    expect(LESSON_LABELS).toEqual({ next: 'Continue', back: 'Back', finish: 'Finish lesson' });
  });

  it('should say "Lesson N" wherever a lesson reuses a term an earlier lesson taught', () => {
    const firstTaught = new Map<string, number>();
    for (const l of LESSONS) {
      for (const card of l.cards) {
        const ids = cardTermIds(card);
        const words = [card.text ?? '', ...(card.lines ?? []).map((x) => x.text)].join(' ');
        for (const id of ids) {
          const earlier = firstTaught.get(id);
          if (earlier !== undefined && earlier < l.number) {
            expect(words, `${l.id}: ${card.title}`).toMatch(
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

  it('should sum a lesson up in a few plain lines, with no link to an article (owner 2026-11-18)', () => {
    for (const lesson of LESSONS) {
      if (!lesson.recap) continue;
      expect(lesson.recap.points.length, lesson.id).toBeGreaterThanOrEqual(2);
      // Up to five: Lesson 1's approved draft (owner 2026-11-16)
      expect(lesson.recap.points.length, lesson.id).toBeLessThanOrEqual(5);
      for (const point of lesson.recap.points) {
        expect(Object.keys(point), point.text).toEqual(['text']);
      }
      expect(Object.keys(lesson.recap.highlight ?? { text: '' })).toEqual(['text']);
    }
    // Lesson 1's summary: five lines (owner 2026-11-16)
    const l = getLesson('lesson-01');
    expect(l.recap?.points).toHaveLength(5);
    expect(l.recap?.highlight?.text).toBe('Decide when and why before you click.');
  });

  it('should carry no article link anywhere in a lesson: no Read more, no can-do article (owner 2026-11-18)', () => {
    for (const lesson of LESSONS) {
      for (const card of lesson.cards) expect(Object.keys(card), card.title).not.toContain('more');
      for (const item of lesson.canDo) {
        expect(Object.keys(item), item.text).toEqual(['text']);
      }
    }
  });

  it('should teach Lesson 3’s swings, news and traps in the approved order, and end on the path (owner 2026-11-16)', () => {
    const l = getLesson('lesson-02');
    expect(l.tour).toBe('primer');
    // No way on from the close: Lesson 1's Try already ran the buy and sell tours (review 2026-11-16)
    expect(l.next).toBeUndefined();
    expect(l.cards.map((c) => c.title)).toEqual([
      'One Bitcoin for $8,200',
      'What you will learn',
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
    expect(lessonScreens(l)).toHaveLength(22);
    // Fact check 2026-11-17: Bitcoin with a capital B throughout, the low's source named, and no
    // promise that a swing up is any easier to time
    const prose = JSON.stringify(l, (key: string, v: unknown) =>
      key === 'article' || key === 'art' || key === 'fallback' ? undefined : v
    );
    expect(prose).not.toMatch(/\bbitcoin\b/);
    expect(l.cards.find((c) => c.title === 'Big swings, both ways')?.text).toContain(
      'On 19 May 2021 Bitcoin fell from about $42,900 to as low as $28,800 on Bybit’s perpetual chart, then closed near $36,700. It can swing up just as hard, often without warning, so no one can reliably time it.'
    );
    expect(l.cards[0].art).toBe('flashCrash');
    // The cold open no longer announces what you will learn: the sneak peek next does (2026-11-22)
    expect(JSON.stringify(l.cards[0].beats)).not.toMatch(/In the next \d+ minutes/);
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
    const swing = l.cards[3];
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
    expect(questionGuide(getLesson('lesson-02').cards[14].quiz!, undefined)).toEqual({
      who: 'tock',
      mood: 'thinking',
    });
  });

  it('should teach coins and tokens in the approved order, with the road and shop metaphor (owner 2026-11-19)', () => {
    const l = getLesson('lesson-coins');
    expect(l.cards.map((c) => c.title)).toEqual([
      'What you will learn',
      'A coin has its own road',
      'The road needs upkeep',
      'The coins in our market',
      'What does a coin have?',
      'A token uses a road that exists',
      'A token you can trade here',
      'Token job 1: utility',
      'Token job 2: security',
      'Token job 3: governance',
      'Match each token to its job',
      'Altcoins',
      'Two assets, one week',
      'What is LINK?',
      'Who pays the fee?',
    ]);
    // The new peeks, one per idea, and no practice trade (nothing here is a buy or a sell)
    expect(l.cards.flatMap((c) => cardTermIds(c))).toEqual(['coin', 'staking', 'token', 'altcoin']);
    expect(l.cards.some((c) => c.practice)).toBe(false);
    // The analogy is Berwyn's and says where it stops matching
    const analogy = l.cards.find((c) => c.title === 'A token uses a road that exists')!.analogy;
    expect(analogy?.who).toBe('tock');
    expect(analogy?.text).toMatch(/shop.*Where it stops matching/);
    // Stablecoins come next, so the altcoin card says they try not to swing
    expect(l.cards.find((c) => c.title === 'Altcoins')?.text).toMatch(/Stablecoins are altcoins/);
    // Your call: the honest answer is to find out who made it
    expect(l.moment.options[l.moment.correct]).toMatch(/who made it/);
    // No project's logo, and no link to a lesson that is not written yet
    expect(l.recap?.highlight?.text).toMatch(/Next up: stablecoins/);
    expect(l.next).toBeUndefined();
  });

  it('should keep the coin-traits pick to three right tiles of six, and name the eight coins (fact check 2026-11-19)', () => {
    const l = getLesson('lesson-coins');
    const pick = l.cards.find((c) => c.title === 'What does a coin have?')!.quiz!;
    expect(pick.format).toBe('pick');
    expect(pick.tiles).toHaveLength(6);
    expect(pick.tiles!.filter((t) => t.right)).toHaveLength(3);
    expect(pick.question).toMatch(/Pick three/);
    const market = l.cards.find((c) => c.title === 'The coins in our market')!.text!;
    for (const t of ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE']) {
      expect(market).toContain(t);
    }
    // LINK is the token, not a coin: set apart on the card
    expect(market).toMatch(/LINK.*not a coin/);
  });

  it('should keep the coins-and-tokens sums true to the dated closes (fact check 2026-11-19)', () => {
    // Bybit USDT perpetual daily closes, 29 Jul and 5 Aug 2024, UTC
    const closes = { BTC: [66_757.7, 53_988.2], LINK: [13.524, 9.475] } as const;
    const l = getLesson('lesson-coins');
    const card = l.cards.find((c) => c.title === 'Two assets, one week')!;
    const steps = card.math!.steps.map((s) => s.sum);
    const fmt = (n: number, d: number) =>
      (n < 0 ? '−' : '') +
      Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    const expected: string[] = [];
    for (const [from, to] of [closes.BTC, closes.LINK]) {
      const change = Number((to - from).toFixed(4));
      const ratio = Number((change / from).toFixed(3));
      const decimals = from > 1000 ? 1 : 3;
      expected.push(
        `${fmt(to, decimals)} − ${fmt(from, decimals)} = ${fmt(change, decimals)}`,
        `${fmt(change, decimals)} ÷ ${fmt(from, decimals)} = ${fmt(ratio, 3)}`,
        `${fmt(ratio, 3)} × 100 = ${fmt(Number((ratio * 100).toFixed(1)), 1)}%`
      );
    }
    expect(steps).toEqual(expected);
    // The chart's markers carry the same LINK figures
    expect(card.chart?.markers.map((m) => m.text)).toEqual(['$13.524', '−29.9%']);
    expect(card.math?.answer).toMatch(/LINK.*fell more than bitcoin.*only one example/);
  });

  it('should teach stablecoins in the approved order, with the cloakroom metaphor (owner 2026-11-19)', () => {
    const l = getLesson('lesson-stablecoins');
    expect(l.cards.map((c) => c.title)).toEqual([
      'What you will learn',
      'The steady coin',
      'A ticket for a dollar',
      'Kind 1: dollar-backed',
      'Kind 2: crypto-backed',
      'Kind 3: rule-based',
      'What stands behind the ticket?',
      'Why traders keep them',
      'Park your profit',
      'Parking a profit, in order',
      'The catch: the peg can slip',
      '“Stable” is a goal',
      'A stablecoin at $0.92',
      'A key advantage',
    ]);
    // The analogy is Berwyn's, starts the approved way and says where it stops matching
    const analogy = l.cards.find((c) => c.title === 'A ticket for a dollar')!.analogy;
    expect(analogy?.who).toBe('tock');
    expect(analogy?.text).toMatch(/^Think of it as a cloakroom ticket.*Where it stops matching/);
    // Quizzes: match the three kinds, put a profit's steps in order, then two multiple choice
    const quiz = (title: string) => l.cards.find((c) => c.title === title)!.quiz!;
    expect(quiz('What stands behind the ticket?').format).toBe('match');
    expect(quiz('What stands behind the ticket?').pairs).toHaveLength(3);
    expect(quiz('Parking a profit, in order').format).toBe('order');
    expect(quiz('Parking a profit, in order').steps).toHaveLength(4);
    for (const title of ['A stablecoin at $0.92', 'A key advantage']) {
      expect(quiz(title).options).toHaveLength(4);
    }
    // One practice buy, on the card that says our markets are priced in USDT (Lesson 1's tour)
    const practice = l.cards.filter((c) => c.practice);
    expect(practice.map((c) => c.title)).toEqual(['Why traders keep them']);
    expect(practice[0].practice?.tour).toBe('practice-buy');
    // Your call: check what stands behind it
    expect(l.moment.options[l.moment.correct]).toMatch(/What stands behind it/);
    // The de-peg is a drawn picture, never a chart, and its number matches the fact check
    const peg = l.cards.find((c) => c.title === 'The catch: the peg can slip')!;
    expect(peg.art).toBe('pegDip');
    expect(peg.chart).toBeUndefined();
    expect(peg.text).toMatch(/March 2023.*about 87 cents over a weekend/);
    // The way on is written in the highlight only: wallets come next, with no lesson to link yet
    expect(l.recap?.highlight?.text).toMatch(/Next up: wallets/);
    expect(l.next).toBeUndefined();
  });

  it('should keep the parked-profit sum true (fact check 2026-11-19)', () => {
    const l = getLesson('lesson-stablecoins');
    const card = l.cards.find((c) => c.title === 'Park your profit')!;
    expect(card.math!.steps.map((s) => s.sum)).toEqual([
      '300 − 200 = 100',
      '100 ÷ 200 = 0.5',
      '0.5 × 100 = 50%',
    ]);
    expect(card.math?.answer).toMatch(/50% gain.*300 USDT.*Fees are left out/);
  });

  it('should teach wallets and keys in the approved order, with the mailbox metaphor (owner 2026-11-22)', () => {
    const l = getLesson('lesson-wallets');
    expect(l.cards.map((c) => c.title)).toEqual([
      'What you will learn',
      'A wallet holds keys, not coins',
      'Address and private key',
      'Who is who?',
      'What a wallet is for',
      'Mira and Sneaky Sam',
      'The phone in the sea',
      'Custodial: a company keeps your key',
      'The trade-off',
      'Non-custodial: you keep the key',
      'Control, privacy, no reset button',
      'The recovery phrase',
      'Three rules for the phrase',
      'Where would you keep it?',
      'Setting up safely, in order',
      'Hot wallets',
      'Cold wallets',
      'Which wallet for which job?',
      'Lena: a long-term holder',
      'Zoe: trades every week',
      'A purse and a safe',
    ]);
    // 25 screens: 21 cards, Your call, the phrase check, the summary and the close
    expect(lessonScreens(l)).toHaveLength(25);
    // Your call follows the card on the missing reset button
    expect(l.cards[l.momentAfter!].title).toBe('Control, privacy, no reset button');
    expect(l.moment.options[l.moment.correct]).toBe('Only the exchange user');
    // Quiz formats: two Match boxes, a Pick, a Drag and drop, two persona questions
    const quiz = (title: string) => l.cards.find((c) => c.title === title)!.quiz!;
    expect(quiz('Who is who?').format).toBe('match');
    expect(quiz('Who is who?').pairs).toHaveLength(4);
    expect(quiz('Which wallet for which job?').format).toBe('match');
    expect(quiz('Which wallet for which job?').pairs).toHaveLength(3);
    const pick = quiz('Where would you keep it?');
    expect(pick.format).toBe('pick');
    expect(pick.tiles).toHaveLength(6);
    expect(pick.tiles!.filter((t) => t.right)).toHaveLength(3);
    expect(quiz('Setting up safely, in order').format).toBe('order');
    expect(quiz('Setting up safely, in order').steps).toHaveLength(5);
    // Lena's and Zoe's questions each have their picture and one right answer
    expect(quiz('Lena: a long-term holder').art).toBe('lena');
    expect(quiz('Lena: a long-term holder').options[1]).toMatch(/hardware wallet.*on paper/);
    expect(quiz('Zoe: trades every week').art).toBe('zoe');
    expect(quiz('Zoe: trades every week').options[1]).toMatch(/only what she trades/);
    // The phrase check refuses to share, and its worried guide warns about support
    expect(l.checks).toHaveLength(1);
    expect(l.checks[0].options[l.checks[0].correct]).toMatch(/^Never share them/);
    // No practice trade: a wallet has no trade, and card 11 says the paper account is not a wallet
    expect(l.cards.filter((c) => c.practice)).toEqual([]);
    expect(l.cards.find((c) => c.title === 'Control, privacy, no reset button')?.text).toMatch(
      /practice money in an account we hold/
    );
    // The fact check (2026-11-22): the analogy is a bank account (a safe-deposit box teaches it wrong),
    // the phrase may be typed to restore a wallet, FTX froze withdrawals and went bankrupt
    expect(
      l.cards.find((c) => c.title === 'Custodial: a company keeps your key')?.analogy?.text
    ).toMatch(/bank account/);
    expect(l.cards.find((c) => c.title === 'Three rules for the phrase')?.text).toMatch(
      /type it only to restore your own wallet/
    );
    expect(l.cards.find((c) => c.title === 'The trade-off')?.text).toMatch(
      /November 2022 FTX.*froze withdrawals and went bankrupt/
    );
    // Lesson 6 said wallets come next, and this one says fees do
    expect(l.recap?.highlight?.text).toMatch(/Next up: why sending crypto costs a fee/);
    expect(l.next).toBeUndefined();
  });

  it('should teach network fees in the approved order, with the bus metaphor (owner goal 2026-11-22)', () => {
    const l = getLesson('lesson-fees');
    expect(l.cards.map((c) => c.title)).toEqual([
      'What you will learn',
      'Sending has a price',
      'A block is a bus',
      'Who picks the passengers?',
      'From send to confirmed',
      'Why a fee exists',
      'Why the fee moves',
      'Who is who?',
      'A real fee spike',
      'Is it worth it?',
      'Cheap chains and pricey chains',
      'A plain send or a swap',
      'What makes a fee higher?',
      'Busy days',
      'Plan before you send',
      'Two different fees',
      'Which costs the most?',
    ]);
    // 20 screens: 17 cards, Your call after "Plan before you send", the summary and the close
    expect(lessonScreens(l)).toHaveLength(20);
    expect(l.cards[l.momentAfter!].title).toBe('Plan before you send');
    expect(l.moment.options[l.moment.correct]).toMatch(/^Check whether waiting/);
    // Quizzes: order, match, pick, then two multiple choice; no practice trade
    const quiz = (title: string) => l.cards.find((c) => c.title === title)!.quiz!;
    expect(quiz('From send to confirmed').format).toBe('order');
    expect(quiz('From send to confirmed').steps).toHaveLength(4);
    expect(quiz('Who is who?').format).toBe('match');
    expect(quiz('Who is who?').pairs).toHaveLength(4);
    const pick = quiz('What makes a fee higher?');
    expect(pick.format).toBe('pick');
    expect(pick.tiles!.filter((t) => t.right)).toHaveLength(3);
    for (const title of ['Busy days', 'Which costs the most?']) {
      const q = quiz(title);
      expect(q.options[q.correct], title).toBeTruthy();
    }
    expect(l.cards.filter((c) => c.practice)).toEqual([]);
    // The bus is Berwyn's analogy, and says where it stops matching
    const bus = l.cards.find((c) => c.title === 'A block is a bus')!.analogy;
    expect(bus?.who).toBe('tock');
    expect(bus?.text).toMatch(/^Think of it as a bus.*Where it stops matching/);
    // Our real example: bitcoin's average fee, April 2024 (about $5, $128 on 20 April, $35 on 21 April)
    const spike = l.cards.find((c) => c.title === 'A real fee spike')!;
    expect(spike.text).toMatch(/few dollars, about \$4.*20 April.*about \$128.*about \$35/);
    expect(spike.chart).toBeUndefined();
    // The sum is true: a $200 send, a $4 fee and a $128 fee
    const math = l.cards.find((c) => c.title === 'Is it worth it?')!.math!;
    expect(math.steps.map((s) => s.sum)).toEqual([
      '4 ÷ 200 = 0.02',
      '0.02 × 100 = 2%',
      '128 ÷ 200 = 0.64',
      '0.64 × 100 = 64%',
    ]);
    expect(math.answer).toMatch(/2%.*64%/);
    // The paper account's fee is the exchange's Commission, not a network fee
    expect(l.cards.find((c) => c.title === 'Two different fees')?.text).toMatch(
      /Commission.*exchange.*network fee is different/
    );
    // The sneak peek matches the summary: four lines each
    expect(l.cards[0].preview).toHaveLength(4);
    expect(l.recap?.points).toHaveLength(4);
    expect(l.recap?.highlight?.text).toMatch(/Next up: trading without a middleman/);
  });

  it('should teach DApps and pools in the approved order, with the vending machine and jars (owner 2026-11-28)', () => {
    const l = getLesson('lesson-dapps');
    expect(l.cards.map((c) => c.title)).toEqual([
      'What you will learn',
      'The exchange in the middle',
      'What you hand over',
      'Withdrawals paused',
      'A machine with no shopkeeper',
      'What is a DApp?',
      'Web2 and Web3',
      'A swap with no order desk',
      'Your swap, in order',
      'Two jars instead of a queue',
      'Scoop a token, move the price',
      'Who fills the jars?',
      'What a swap costs',
      'Who does what?',
      'Big pool, tiny pool',
      'Same app, other chains',
      'No help desk',
      'Read before you sign',
      'What should make you stop?',
    ]);
    // 22 screens: 19 cards, Your call after "Read before you sign", the summary and the close
    expect(lessonScreens(l)).toHaveLength(22);
    expect(l.cards[l.momentAfter!].title).toBe('Read before you sign');
    expect(l.moment.options[l.moment.correct]).toMatch(/^Close it, and check/);
    const quiz = (title: string) => l.cards.find((c) => c.title === title)!.quiz!;
    expect(quiz('Withdrawals paused').options[quiz('Withdrawals paused').correct]).toMatch(
      /^No: the company holds the keys/
    );
    expect(quiz('Your swap, in order').format).toBe('order');
    expect(quiz('Your swap, in order').steps).toHaveLength(4);
    expect(quiz('Who does what?').format).toBe('match');
    expect(quiz('Who does what?').pairs).toHaveLength(4);
    expect(quiz('Big pool, tiny pool').options[0]).toBe('The tiny pool moves your price more');
    const pick = quiz('What should make you stop?');
    expect(pick.format).toBe('pick');
    expect(pick.tiles).toHaveLength(6);
    expect(pick.tiles!.filter((t) => t.right)).toHaveLength(3);
    // No practice trade on a card: the paper account has no wallet and no swap
    expect(l.cards.filter((c) => c.practice)).toEqual([]);
    // Two analogies, Berwyn's, each saying where it stops matching
    for (const title of ['A machine with no shopkeeper', 'Two jars instead of a queue']) {
      const analogy = l.cards.find((c) => c.title === title)!.analogy;
      expect(analogy?.who, title).toBe('tock');
      expect(analogy?.text, title).toMatch(/^Think of it as .*Where it stops matching/);
    }
    // The new terms; a reused one names its lesson (the "Lesson N" rule checks it)
    expect(l.cards.flatMap((c) => cardTermIds(c))).toEqual([
      'custody',
      'smart-contract',
      'dapp',
      'wallet',
      'liquidity-pool',
      'liquidity-provider',
      'network-fee',
    ]);
    // Fact check 2026-11-28: tokens in pools, a permit can approve, disconnecting revokes nothing,
    // a confirmed payment, and no phrase ever on a website
    const text = (title: string) => l.cards.find((c) => c.title === title)!.text!;
    expect(text('Read before you sign')).toMatch(
      /free signature.*permit.*Disconnecting does not cancel an approval.*revoke/
    );
    expect(text('No help desk')).toMatch(
      /never type it into a website\. A confirmed payment usually cannot be reversed/
    );
    expect(text('Who fills the jars?')).toMatch(/impermanent loss.*fees may not cover it/);
    // The coverage check: other chains, and switching between them
    expect(text('Same app, other chains')).toMatch(/you can switch.*bridge/);
    expect(text('What a swap costs')).toMatch(/between 0\.01% and 1%.*slippage/);
    // The sneak peek matches the summary: four lines each, and the way on is what the map shows next
    expect(l.cards[0].preview).toHaveLength(4);
    expect(l.recap?.points).toHaveLength(4);
    expect(l.recap?.highlight?.text).toMatch(/Next up: try a swap with a practice wallet/);
    expect(l.next).toBeUndefined();
  });

  it('should work out the pool’s price from x × y = k, on the card’s own pool (2026-11-28)', () => {
    const math = getLesson('lesson-dapps').cards.find(
      (c) => c.title === 'Scoop a token, move the price'
    )!.math!;
    const [eth, usdc] = [10, 20_000];
    const k = eth * usdc;
    const needed = Math.round(k / (eth - 1));
    const fmt = (n: number) => n.toLocaleString('en-US');
    expect(math.steps.map((s) => s.sum)).toEqual([
      `${eth} × ${fmt(usdc)} = ${fmt(k)}`,
      `${eth} − 1 = ${eth - 1}`,
      `${fmt(k)} ÷ ${eth - 1} ≈ ${fmt(needed)}`,
      `${fmt(needed)} − ${fmt(usdc)} = ${fmt(needed - usdc)}`,
    ]);
    expect(math.answer).toContain(`**${fmt(needed - usdc)} USDC**`);
    expect(math.answer).toMatch(/price impact.*Fees are left out/);
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
    // Rewritten 2026-11-16, then moved again by the sneak peek card (2026-11-22): Lessons 2 to 4
    // start above both earlier versions
    expect(getLesson('lesson-ownership').stepBase).toBe(100);
    expect(getLesson('lesson-02').stepBase).toBe(100);
    expect(getLesson('lesson-04').stepBase).toBe(100);
  });
});
