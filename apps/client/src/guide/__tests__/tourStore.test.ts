import { beforeEach, describe, expect, it } from 'vitest';
import { useTourStore } from '@/guide/tourStore';
import { getTour } from '@/guide/tours';

const s = () => useTourStore.getState();

describe('tourStore', () => {
  beforeEach(() => s().reset());

  it('should start at the first step and walk forward and back', () => {
    s().start('primer');
    expect(s().activeId).toBe('primer');
    expect(s().stepIndex).toBe(0);
    s().next();
    s().next();
    expect(s().stepIndex).toBe(2);
    s().back();
    expect(s().stepIndex).toBe(1);
    s().back();
    s().back();
    expect(s().stepIndex).toBe(0);
  });

  it('should hand over to the next chapter and mark the finished one completed', () => {
    s().start('primer');
    const last = getTour('primer').steps.length;
    for (let i = 0; i < last; i++) s().next();
    expect(s().completed.primer).toBe(true);
    expect(s().activeId).toBe('buy-first-coin');
    expect(s().stepIndex).toBe(0);
  });

  it('should end after the last chapter', () => {
    s().start('sell-and-review');
    const last = getTour('sell-and-review').steps.length;
    for (let i = 0; i < last; i++) s().next();
    expect(s().completed['sell-and-review']).toBe(true);
    expect(s().activeId).toBeNull();
  });

  it('should close without marking anything completed', () => {
    s().start('buy-first-coin');
    s().next();
    s().close();
    expect(s().activeId).toBeNull();
    expect(s().completed).toEqual({});
  });

  it('should clear a quiz answer when the step changes', () => {
    s().start('sell-and-review');
    s().answerQuiz(1);
    expect(s().quizAnswer).toBe(1);
    s().next();
    expect(s().quizAnswer).toBeNull();
  });

  it('should replace the completed set from the server', () => {
    s().setCompleted(['primer', 'buy-first-coin']);
    expect(s().completed).toEqual({ primer: true, 'buy-first-coin': true });
  });
});
