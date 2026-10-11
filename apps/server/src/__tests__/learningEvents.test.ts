import { describe, expect, it } from 'vitest';
import { buildTourFunnel, type EventRow } from '../services/LearningEvents.js';

const T = (m: number) => new Date(Date.UTC(2026, 9, 12, 10, m));
const ev = (
  userId: string,
  name: string,
  stepId: string | null,
  m: number,
  itemId = 'primer'
): EventRow => ({
  userId,
  name,
  itemId,
  stepId,
  at: T(m),
});

describe('buildTourFunnel', () => {
  it('should list every tour, at zero when nobody opened it', () => {
    const f = buildTourFunnel([], ['primer', 'buy-first-coin']);
    expect(f).toEqual([
      { itemId: 'primer', started: 0, completed: 0, steps: [] },
      { itemId: 'buy-first-coin', started: 0, completed: 0, steps: [] },
    ]);
  });

  it('should count people, not events', () => {
    const rows = [
      ev('a', 'tour_started', null, 0),
      ev('a', 'tour_step', 'primer.1', 1),
      ev('a', 'tour_step', 'primer.2', 2),
      ev('a', 'tour_step', 'primer.1', 3), // went back
      ev('a', 'tour_started', null, 10), // ran it again
      ev('b', 'tour_started', null, 0),
      ev('b', 'tour_step', 'primer.1', 1),
    ];
    const [primer] = buildTourFunnel(rows, ['primer']);
    expect(primer.started).toBe(2);
    expect(primer.steps).toEqual([
      { stepId: 'primer.1', viewers: 2, closedHere: 0 },
      { stepId: 'primer.2', viewers: 1, closedHere: 0 },
    ]);
  });

  it('should count a person once as finished, however often they finished', () => {
    const rows = [
      ev('a', 'tour_completed', null, 5),
      ev('a', 'tour_completed', null, 50),
      ev('b', 'tour_completed', null, 6),
    ];
    expect(buildTourFunnel(rows, ['primer'])[0].completed).toBe(2);
  });

  it('should attribute a close to the step only when it was the person’s last event', () => {
    const rows = [
      ev('a', 'tour_step', 'primer.2', 1),
      ev('a', 'tour_closed', 'primer.2', 2),
      // b closed, then came back and finished: not a drop-off
      ev('b', 'tour_step', 'primer.3', 1),
      ev('b', 'tour_closed', 'primer.3', 2),
      ev('b', 'tour_started', null, 3),
      ev('b', 'tour_completed', null, 4),
    ];
    const steps = buildTourFunnel(rows, ['primer'])[0].steps;
    expect(steps.find((s) => s.stepId === 'primer.2')?.closedHere).toBe(1);
    expect(steps.find((s) => s.stepId === 'primer.3')?.closedHere).toBe(0);
  });

  it('should order steps numerically, not as text', () => {
    const rows = [
      ev('a', 'tour_step', 'primer.10', 1),
      ev('a', 'tour_step', 'primer.2', 2),
      ev('a', 'tour_step', 'primer.1', 3),
    ];
    expect(buildTourFunnel(rows, ['primer'])[0].steps.map((s) => s.stepId)).toEqual([
      'primer.1',
      'primer.2',
      'primer.10',
    ]);
  });

  it('should keep tours apart', () => {
    const rows = [
      ev('a', 'tour_started', null, 0, 'primer'),
      ev('a', 'tour_started', null, 1, 'buy-first-coin'),
      ev('b', 'tour_started', null, 2, 'buy-first-coin'),
    ];
    const f = buildTourFunnel(rows, ['primer', 'buy-first-coin']);
    expect(f[0].started).toBe(1);
    expect(f[1].started).toBe(2);
  });
});
