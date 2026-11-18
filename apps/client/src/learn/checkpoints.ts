/**
 * A chapter's checkpoint (learning map, owner's visual Q&A 2026-10-24): five mixed questions drawn
 * from the whole chapter, so the learner retrieves what each lesson taught rather than re-reading
 * it. Passing (4 of 5) opens the next chapter, and anyone may take it early to "test out". Every
 * answer is explained and a miss points back to where it was taught; there are no lives, prizes or
 * timers. Pure data: no React.
 */

import { FREE, type Entitlement } from './access';
import type { LessonId, LessonQuestion } from '@/guide/lessons';
import type { TourId } from '@/guide/tours';

export const CHECKPOINT_IDS = ['checkpoint-ch1'] as const;
export type CheckpointId = (typeof CHECKPOINT_IDS)[number];

export function isCheckpointId(value: string): value is CheckpointId {
  return (CHECKPOINT_IDS as readonly string[]).includes(value);
}

/** Where a question's idea was taught: a miss offers to go back there */
export type TaughtIn = { kind: 'lesson'; id: LessonId } | { kind: 'tour'; id: TourId };

export interface CheckpointQuestion extends LessonQuestion {
  taughtIn: TaughtIn;
}

export interface Checkpoint {
  id: CheckpointId;
  title: string;
  /** Right answers needed to pass */
  pass: number;
  /**
   * The question set's version, sent with a pass: the server ignores a pass from an earlier set (the
   * SDK's `CHECKPOINT_VERSIONS`, which a test holds this to). Raise it when the questions change
   */
  version: number;
  questions: CheckpointQuestion[];
  access: Entitlement;
}

const checkpointCh1: Checkpoint = {
  id: 'checkpoint-ch1',
  // Owner 2026-11-16: our own name (unit 1 is "Start here: crypto and trading basics")
  title: 'Chapter 1 checkpoint',
  // Ten questions, pass at eight (owner 2026-11-18: the length of the benchmark's checkpoint, whose
  // pass mark isn't shown; 80%, as our five-question set's four)
  pass: 8,
  // 3: the finished chapter's ten questions across Lessons 1–4 (owner 2026-11-18: earlier passes no
  // longer count); 2 was the Lessons 1–3 rewrite's five
  version: 3,
  access: FREE,
  questions: [
    {
      question: 'Why can’t one person quietly change a Bitcoin balance?',
      options: [
        'A bank checks every change',
        'Thousands of copies of the record would reject it',
        'The price would drop first',
      ],
      correct: 1,
      explain:
        'Bitcoin’s record is copied on thousands of computers. An edit that doesn’t match the other copies is simply rejected — no bank needed.',
      taughtIn: { kind: 'lesson', id: 'lesson-ownership' },
    },
    {
      // Lesson 1 since the rewrite (2026-11-16): the recovery-phrase question moved with keys and
      // custody to a later lesson
      context:
        'You hold Bitcoin. Your plan: sell if a day closes below $50,000. Today it closed at $48,700.',
      question: 'What does your plan say to do?',
      options: [
        'Sell, as the plan says',
        'Wait: it might bounce back',
        'Buy more while it’s cheap',
      ],
      correct: 0,
      explain:
        'The plan set the rule before the move, so the close below $50,000 decides it. Waiting or buying more is the gut talking, not the plan.',
      taughtIn: { kind: 'lesson', id: 'lesson-01' },
    },
    {
      question: 'What sets Bitcoin’s price on an exchange right now?',
      options: [
        'The exchange decides it',
        'The latest trades between buyers and sellers',
        'Bitcoin’s creator',
      ],
      correct: 1,
      explain:
        'The price is simply where the last buyer and seller agreed to trade. More eager buyers push it up, more eager sellers push it down.',
      taughtIn: { kind: 'lesson', id: 'lesson-02' },
    },
    {
      context: 'Headline: “Big bank says Bitcoin will double this year.”',
      question: 'What do you know about tomorrow’s price?',
      options: ['It will rise', 'It will fall', 'Nothing for sure: a forecast isn’t a fact'],
      correct: 2,
      explain:
        'Good news can move a price either way, and forecasts are often wrong. No one knows the next move in advance.',
      taughtIn: { kind: 'lesson', id: 'lesson-02' },
    },
    {
      question:
        'You buy $100 of Bitcoin and sell it straight back. The price hasn’t moved. Where do you end up?',
      options: ['Exactly $100', 'A little under $100', 'A little over $100'],
      correct: 1,
      explain:
        'Spot charges 0.1% when you buy and again when you sell. The price has to move further than the fees before a trade pays.',
      taughtIn: { kind: 'tour', id: 'sell-and-review' },
    },
    {
      context: 'You expect a coin’s price to fall over the next week.',
      question: 'Which trade would profit if you’re right?',
      options: ['Going long', 'Going short', 'Staying out'],
      correct: 1,
      explain:
        'Going short profits when the price falls: you sell first and buy back lower. Going long is the other side: it profits when the price rises.',
      taughtIn: { kind: 'lesson', id: 'lesson-01' },
    },
    {
      question: 'How is the crypto market different from a shop?',
      options: [
        'It is open all day, every day, so prices can move while you sleep',
        'It closes at night, like a shop',
        'Only professionals can trade at weekends',
      ],
      correct: 0,
      explain:
        'Crypto never closes: there is no opening time and no weekend. That’s why a plan, with its exit set in advance, matters.',
      taughtIn: { kind: 'lesson', id: 'lesson-01' },
    },
    {
      context:
        'A coin has only a few buyers waiting, far apart in price. One big market sell order (sell at any price) arrives.',
      question: 'What happens to the price?',
      options: [
        'It barely moves',
        'It jumps down as the order uses up the few buyers',
        'It rises, because someone is selling',
      ],
      correct: 1,
      explain:
        'In a thin market the order uses up the nearby buyers and has to reach the ones far below. A deep market, with many buyers close by, absorbs it.',
      taughtIn: { kind: 'lesson', id: 'lesson-02' },
    },
    {
      context: 'A stranger online says a brand-new coin “can’t lose” and tells you to hurry.',
      question: 'What’s the smartest first move?',
      options: [
        'Buy a little, just to test it',
        'Borrow money to buy more',
        'Check who runs it and whether you could sell it',
      ],
      correct: 2,
      explain:
        'Hurry and “can’t lose” are classic scam warning signs. Before any money moves, check who is behind the coin and whether buyers exist, so you could get out.',
      taughtIn: { kind: 'lesson', id: 'lesson-02' },
    },
    {
      question: 'Which describes an investor, not a trader?',
      options: [
        'Holds for years and ignores daily moves',
        'Buys and sells several times a day',
        'Picks the coins that move fastest',
      ],
      correct: 0,
      explain:
        'Investors hold for a long time, often years, and look at the big picture. Buying and selling often is a trader’s habit, and chasing the fastest movers is usually a short-term, trader-style approach.',
      taughtIn: { kind: 'lesson', id: 'lesson-04' },
    },
  ],
};

export const CHECKPOINTS: readonly Checkpoint[] = [checkpointCh1];

export function getCheckpoint(id: CheckpointId): Checkpoint {
  const checkpoint = CHECKPOINTS.find((c) => c.id === id);
  if (!checkpoint) throw new Error(`Unknown checkpoint ${id}`);
  return checkpoint;
}

/** Right answers in `answers` (indexed like the questions; a gap is an unanswered question) */
export function checkpointScore(checkpoint: Checkpoint, answers: readonly number[]): number {
  return checkpoint.questions.filter((q, i) => answers[i] === q.correct).length;
}
