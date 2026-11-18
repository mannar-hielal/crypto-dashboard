import { beforeEach, describe, expect, it } from 'vitest';
import { checkpointScore, getCheckpoint } from '@/learn/checkpoints';
import { usePathStore } from '@/learn/pathStore';

const checkpoint = getCheckpoint('checkpoint-ch1');
const right = checkpoint.questions.map((q) => q.correct);
const wrong = (q: { correct: number }) => (q.correct === 0 ? 1 : 0);

/** Answer every question: right for the first `rightCount`, wrong after that */
function take(rightCount: number) {
  const s = usePathStore.getState();
  s.startCheckpoint('checkpoint-ch1');
  checkpoint.questions.forEach((q, i) => {
    usePathStore.getState().answer(i < rightCount ? q.correct : wrong(q));
    usePathStore.getState().next();
  });
}

describe('usePathStore', () => {
  beforeEach(() => usePathStore.getState().reset());

  it('should record a pass at the result when enough answers are right', () => {
    take(checkpoint.pass);
    const s = usePathStore.getState();
    expect(s.question).toBe(checkpoint.questions.length);
    expect(s.checkpoints).toEqual({ 'checkpoint-ch1': true });
  });

  it('should record nothing for a score under the pass mark', () => {
    take(checkpoint.pass - 1);
    expect(usePathStore.getState().checkpoints).toEqual({});
    expect(usePathStore.getState().question).toBe(checkpoint.questions.length);
  });

  it('should keep the first answer and not move on before one is given', () => {
    const s = usePathStore.getState();
    s.startCheckpoint('checkpoint-ch1');
    s.next();
    expect(usePathStore.getState().question).toBe(0);
    usePathStore.getState().answer(right[0]);
    usePathStore.getState().answer(wrong(checkpoint.questions[0]));
    expect(usePathStore.getState().answers).toEqual([right[0]]);
  });

  it('should start again from a clean slate, and close without losing a pass', () => {
    take(checkpoint.questions.length);
    usePathStore.getState().startCheckpoint('checkpoint-ch1');
    expect(usePathStore.getState()).toMatchObject({ question: 0, answers: [] });
    usePathStore.getState().closeCheckpoint();
    expect(usePathStore.getState()).toMatchObject({
      checkpointId: null,
      checkpoints: { 'checkpoint-ch1': true },
    });
  });

  it('should skip a tour for now, and take the server’s progress as loaded', () => {
    usePathStore.getState().skipTour('buy-first-coin');
    expect(usePathStore.getState().skippedTours).toEqual({ 'buy-first-coin': true });

    usePathStore
      .getState()
      .setProgress({ skippedTours: ['sell-and-review'], checkpoints: ['checkpoint-ch1'] });
    expect(usePathStore.getState()).toMatchObject({
      loaded: true,
      skippedTours: { 'sell-and-review': true },
      checkpoints: { 'checkpoint-ch1': true },
    });
  });
});

describe('the chapter 1 checkpoint', () => {
  it('should have ten questions, pass at eight, and point every one back to where it was taught', () => {
    expect(checkpoint.questions).toHaveLength(10);
    expect(checkpoint.pass).toBe(8);
    for (const q of checkpoint.questions) {
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.explain.length).toBeGreaterThan(0);
      expect(q.taughtIn.id).toBeTruthy();
    }
    expect(checkpointScore(checkpoint, right)).toBe(10);
    expect(checkpointScore(checkpoint, [])).toBe(0);
  });

  it('should test all four lessons and the sell practice, and not hide the right answer in one slot (owner 2026-11-18)', () => {
    const taught = new Set(checkpoint.questions.map((q) => q.taughtIn.id));
    for (const id of [
      'lesson-01',
      'lesson-ownership',
      'lesson-02',
      'lesson-04',
      'sell-and-review',
    ]) {
      expect(taught.has(id as never), id).toBe(true);
    }
    // The right option isn't always in the same place
    expect(new Set(checkpoint.questions.map((q) => q.correct)).size).toBeGreaterThanOrEqual(3);
  });
});
