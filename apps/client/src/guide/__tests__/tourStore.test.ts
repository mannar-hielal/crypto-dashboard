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
      // On to its look at what just happened (2026-11-17), its phone steps too
      expect(s().activeId).toBe('review-buy');
      expect(s().wide).toBe(false);
      for (let i = 0; i < tourSteps(getTour('review-buy'), false).length; i++) s().next();
      expect(s().activeId).toBeNull();
      // A practice trade and its review are no tours of the path: never marked finished or counted
      expect(s().completed).toEqual({});
      expect(s().finishes).toBe(0);
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should keep the step when the screen widens mid-tour, and open the form first when it narrows', () => {
    s().start('buy-first-coin'); // desktop: the side button first
    s().next(); // Market
    const market = tourSteps(getTour('buy-first-coin'), true)[1].id;
    // Rotated to a phone: its form is closed, so back to tapping Buy / Long (review 2026-11-16)
    s().setWide(false);
    expect(tourSteps(getTour('buy-first-coin'), false)[s().stepIndex].anchor).toBe(
      'trade.mobile.buy'
    );
    s().next(); // the form open on the phone: Market
    expect(tourSteps(getTour('buy-first-coin'), false)[s().stepIndex].id).toBe(market);
    // Widened again: the form is docked, so the same step
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

  it('should run the phone’s own form step when rotated to a phone on a shared step', () => {
    // Desktop: the side button, then a step both sizes share (the form docked, open)
    s().start('practice-buy');
    s().next();
    expect(
      getTour('practice-buy').steps.find(
        (st) => st.id === tourSteps(getTour('practice-buy'), true)[1].id
      )?.screen
    ).toBeUndefined();
    // On a phone that form is closed: back to tapping Buy / Long
    s().setWide(false);
    expect(tourSteps(getTour('practice-buy'), false)[s().stepIndex].anchor).toBe(
      'trade.mobile.buy'
    );
  });

  it('should not replay the phone’s form step when it was already done in this run', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    try {
      s().start('practice-buy'); // a phone: Tap Buy / Long first
      s().next(); // the form open: Market
      const market = tourSteps(getTour('practice-buy'), false)[s().stepIndex].id;
      s().setWide(true); // rotated to landscape
      s().setWide(false); // and back: the form step was done, so the same step
      expect(tourSteps(getTour('practice-buy'), false)[s().stepIndex].id).toBe(market);
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should stay put when rotated with a step its list does not hold', () => {
    s().start('practice-buy');
    useTourStore.setState({ stepIndex: 40 }); // a stale index
    s().setWide(false);
    expect(s().stepIndex).toBe(tourSteps(getTour('practice-buy'), false).length - 1);
  });

  it('should not replay the phone’s form step after Back to a desktop-only step', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    try {
      s().start('buy-first-coin'); // portrait: Tap Buy / Long
      s().next(); // the form open: Market
      s().setWide(true); // landscape: Market
      s().back(); // the desktop-only side-button step
      s().setWide(false); // portrait again: not Tap Buy / Long a second time
      expect(tourSteps(getTour('buy-first-coin'), false)[s().stepIndex].anchor).not.toBe(
        'trade.mobile.buy'
      );
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should not go back onto the phone’s form step once it was done', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    try {
      s().start('practice-buy'); // a phone: Tap Buy / Long
      s().next(); // the form open: Market
      s().back(); // nothing earlier to go back to but the form step: stays
      expect(tourSteps(getTour('practice-buy'), false)[s().stepIndex].anchor).not.toBe(
        'trade.mobile.buy'
      );
      s().next();
      const third = s().stepIndex;
      s().back(); // an ordinary step back still works
      expect(s().stepIndex).toBe(third - 1);
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should close a tour that has no step for the screen size it is rotated to', () => {
    s().start('practice-buy');
    // A tour with desktop steps only (none today: every tour shares steps)
    const tour = getTour('practice-buy');
    const saved = tour.steps;
    (tour as { steps: typeof saved }).steps = saved.filter((st) => st.screen === 'desktop');
    try {
      s().setWide(false);
      expect(s().activeId).toBeNull();
    } finally {
      (tour as { steps: typeof saved }).steps = saved;
    }
  });

  it('should close a tour that needs a larger screen when the screen narrows to a phone', () => {
    s().setWide(true);
    s().start('primer'); // not phone-ready
    s().setWide(false);
    expect(s().activeId).toBeNull();
    // Closed by the app, which the lesson tells apart from the learner's own close
    expect(s().closedForSize).toBe(true);
    s().start('primer');
    expect(s().closedForSize).toBe(false);
  });

  it('should never hand over to a next chapter that needs a larger screen on a phone', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    const tour = getTour('buy-first-coin');
    const saved = tour.next;
    (tour as { next?: typeof saved }).next = 'primer' as never; // a chain to a desktop-only tour
    try {
      s().setWide(false);
      s().start('buy-first-coin');
      useTourStore.setState({ stepIndex: tourSteps(tour, false).length - 1 });
      s().next();
      expect(s().activeId).toBeNull();
      expect(s().completed['buy-first-coin']).toBe(true);
    } finally {
      (tour as { next?: typeof saved }).next = saved;
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });

  it('should bring back an untapped Buy / Long step after a rotation and back', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    try {
      s().start('practice-buy');
      const at = () => tourSteps(getTour('practice-buy'), s().wide)[s().stepIndex];
      const first = at();
      expect(first.screen).toBe('phone'); // tap Buy / Long, not tapped yet
      s().setWide(true);
      s().setWide(false);
      expect(at().id).toBe(first.id);
    } finally {
      // @ts-expect-error -- jsdom has no matchMedia: back to that
      delete window.matchMedia;
    }
  });
});
