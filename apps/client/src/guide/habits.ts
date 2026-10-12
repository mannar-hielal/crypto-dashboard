/**
 * What each habit badge is called and asks for. The ids come from the SDK; the server counts them.
 * Careful habits only — nothing here may reward profit, win rate or how often someone trades.
 */

import type { HabitBadgeId } from '@crypto-dashboard/sdk';

export const HABIT_COPY: Record<HabitBadgeId, { title: string; text: string }> = {
  'first-stop-loss': {
    title: 'Protected a trade',
    text: 'Placed an order with a stop-loss',
  },
  'ten-stop-losses': {
    title: 'A stop-loss, ten times',
    text: 'Ten orders placed with a stop-loss',
  },
  'journal-week': {
    title: 'A week of notes',
    text: 'Wrote a journal note on seven different days',
  },
  'first-tour': {
    title: 'First guided practice',
    text: 'Finished a guided tour',
  },
  'all-tours': {
    title: 'The whole path',
    text: 'Finished all three guided tours',
  },
};
