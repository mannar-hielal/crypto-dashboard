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
  it('should never use * as a times sign in lesson copy (× is; * marks emphasis)', () => {
    for (const lesson of LESSONS) {
      expect(JSON.stringify(lesson), lesson.id).not.toMatch(/\d\s*\*\s*\d/);
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

  it('should add the math wherever Lessons 1–3 work out a gain, a loss or a percent', () => {
    const titles = LESSONS.flatMap((l) => l.cards.filter((c) => c.math).map((c) => c.title));
    expect(titles).toEqual([
      'The result',
      'The catch',
      'Smaller coins swing harder',
      'Big swings, both ways',
      'Up, then down',
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
      'One record, many copies': 'ledger',
      'Sealed by hard work': 'sealBroken',
      'The hash links the chain': 'hashChain',
    });
    // Lesson 3 keeps its pictures as they were
    expect(art('lesson-02')).toEqual({
      'One Bitcoin for $8,200': 'flashCrash',
      'Thousands of deals, one candle': 'candleAnatomy',
      'Thin or deep': 'staircase',
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
    // The summary: plain points, no staged birth story (owner 2026-11-17); the actual why first,
    // and no one in charge opens the network article's answer (fact check 2026-11-17)
    expect(l.recap?.title).toBe('Why Bitcoin exists');
    expect(l.recap?.points.map((p) => [p.text, p.article, p.section])).toEqual([
      [
        'Bitcoin was made so people can pay each other online without trusting a bank in the middle.',
        'bitcoin-story',
        'plan',
      ],
      [
        'Bitcoin keeps one ledger, copied on thousands of computers.',
        'bitcoin-network',
        'three-jobs',
      ],
      [
        'Nodes check every payment, and blocks are linked by their hash.',
        'bitcoin-network',
        'blocks',
      ],
      ['No one is in charge: the network agrees.', 'bitcoin-network', 'answered'],
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
      'One Bitcoin for $8,200',
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
