import { describe, expect, it } from 'vitest';
import { HABIT_BADGE_IDS } from '@crypto-dashboard/sdk';
import { HABIT_COPY } from '@/guide/habits';

describe('habit copy', () => {
  it('should describe every badge the server can award, and nothing else', () => {
    expect(Object.keys(HABIT_COPY).sort()).toEqual([...HABIT_BADGE_IDS].sort());
  });

  it('should never name profit, winning or trading often', () => {
    for (const { title, text } of Object.values(HABIT_COPY)) {
      expect(`${title} ${text}`).not.toMatch(/profit|win|gain|streak of trades|every day/i);
    }
  });
});
