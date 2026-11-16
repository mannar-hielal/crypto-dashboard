import { beforeEach, describe, expect, it } from 'vitest';
import { useTourStore } from '@/guide/tourStore';
import { getTour, tourSteps } from '@/guide/tours';

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
    s().start('buy-first-coin');
    const last = tourSteps(getTour('buy-first-coin'), true).length;
    for (let i = 0; i < last; i++) s().next();
    expect(s().completed['buy-first-coin']).toBe(true);
    expect(s().activeId).toBe('sell-and-review');
    expect(s().stepIndex).toBe(0);
  });

  it('should end the primer without handing over (Lesson 1 offers the next step)', () => {
    s().start('primer');
    const last = getTour('primer').steps.length;
    for (let i = 0; i < last; i++) s().next();
    expect(s().completed.primer).toBe(true);
    expect(s().activeId).toBeNull();
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

  it('should run only a phone’s steps when the tour starts on a narrow screen', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    try {
      s().start('practice-buy');
      expect(s().wide).toBe(false);
      const phone = tourSteps(getTour('practice-buy'), false).length;
      for (let i = 0; i < phone - 1; i++) s().next();
      expect(s().activeId).toBe('practice-buy');
      s().next();
      expect(s().activeId).toBeNull();
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should keep the step when the screen crosses the tours’ width mid-tour', () => {
    s().start('buy-first-coin'); // desktop: the side button first
    s().next(); // Market
    const market = tourSteps(getTour('buy-first-coin'), true)[1].id;
    s().setWide(false); // rotated to a phone: the same step, at its place in the phone's list
    expect(tourSteps(getTour('buy-first-coin'), false)[s().stepIndex].id).toBe(market);
    s().setWide(true);
    expect(tourSteps(getTour('buy-first-coin'), true)[s().stepIndex].id).toBe(market);
  });

  it('should not skip the phone’s open-the-form step when rotated on a desktop-only step', () => {
    s().start('practice-buy'); // desktop: the side button first (a desktop-only step)
    s().setWide(false);
    expect(tourSteps(getTour('practice-buy'), false)[s().stepIndex].anchor).toBe(
      'trade.mobile.buy'
    );
  });
});
