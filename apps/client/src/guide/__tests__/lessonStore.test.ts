import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noteToSave, useLessonStore } from '@/guide/lessonStore';
import { getLesson, lessonScreens } from '@/guide/lessons';

const s = () => useLessonStore.getState();
const total = lessonScreens(getLesson('lesson-01')).length;

describe('lessonStore', () => {
  beforeEach(() => s().reset());

  it('should start on the first screen with nothing answered', () => {
    s().start('lesson-01');
    expect(s().activeId).toBe('lesson-01');
    expect(s().screen).toBe(0);
    expect(s().answers).toEqual({});
  });

  it('should open at a given screen (an article’s "Learn it in Lesson 1"), within the lesson', () => {
    s().start('lesson-01', 2);
    expect(s().screen).toBe(2);
    s().start('lesson-01', 99);
    expect(s().screen).toBe(total - 1);
    s().start('lesson-01', -3);
    expect(s().screen).toBe(0);
  });

  it('should move forward and back within the lesson, never past either end', () => {
    s().start('lesson-01');
    s().back();
    expect(s().screen).toBe(0);
    for (let i = 0; i < total + 3; i++) s().next();
    expect(s().screen).toBe(total - 1);
    s().back();
    expect(s().screen).toBe(total - 2);
  });

  it('should keep the first answer on a screen', () => {
    s().start('lesson-01');
    useLessonStore.setState({ screen: 5 });
    s().answer(1);
    s().answer(2);
    expect(s().answers).toEqual({ 5: 1 });
  });

  it('should hide for the tour and carry on with the next screen when the tour ends', () => {
    s().start('lesson-01');
    useLessonStore.setState({ screen: 18 }); // try it
    s().enterTour('buy-first-coin');
    expect(s().inTour).toBe(true);
    s().leaveTour();
    expect(s().inTour).toBe(false);
    expect(s().screen).toBe(19);
    s().leaveTour(); // not in a tour: nothing moves
    expect(s().screen).toBe(19);
  });

  it('should move on from a card only when its own practice trade ends (owner 2026-11-16)', () => {
    s().start('lesson-01', 3); // Buy and Sell: practice-buy
    s().enterTour('practice-buy');
    s().leaveTour();
    expect(s().screen).toBe(4);
    // Another tour handed over from the same card (an article's practice link): back on the card
    s().start('lesson-01', 3);
    s().enterTour('buy-first-coin');
    s().leaveTour();
    expect(s()).toMatchObject({ screen: 3, inTour: false, tourFrom: null });
  });

  it('should mark the lesson completed on finish, and not on close', () => {
    s().start('lesson-01');
    s().close();
    expect(s().completed).toEqual({});
    expect(s().activeId).toBeNull();

    s().start('lesson-01');
    s().rate(4);
    s().finish();
    expect(s().completed['lesson-01']).toBe(true);
    expect(s().activeId).toBeNull();
    // The rating went to the funnel when it was given; it doesn't outlive the lesson
    expect(s().rating).toBeNull();
  });

  it('should replace the finished set with the server’s answer', () => {
    s().setCompleted(['lesson-01']);
    expect(s().completed).toEqual({ 'lesson-01': true });
    s().setCompleted([]);
    expect(s().completed).toEqual({});
  });

  it('should look back at an earlier lesson and return to the lesson as it was left', () => {
    s().start('lesson-ownership', 4);
    s().answer(1);
    s().rate(3);
    s().setNote('Keys, not coins');
    s().visit('lesson-01', 2);
    expect(s()).toMatchObject({
      activeId: 'lesson-01',
      screen: 2,
      answers: {},
      rating: null,
      note: '',
    });
    expect(s().returnTo?.lesson).toBe('lesson-ownership');

    // A look back from the look back still returns to where the learner started
    s().visit('lesson-01', 3);
    expect(s().returnTo?.lesson).toBe('lesson-ownership');

    s().returnBack();
    expect(s()).toMatchObject({
      activeId: 'lesson-ownership',
      screen: 4,
      answers: { 4: 1 },
      rating: 3,
      returnTo: null,
    });
  });

  it('should return to the lesson, not close or finish, on ✕ or Finish during a look back', () => {
    s().start('lesson-ownership', 2);
    s().visit('lesson-01', 1);
    s().close();
    expect(s()).toMatchObject({ activeId: 'lesson-ownership', screen: 2, returnTo: null });

    s().visit('lesson-01', 1);
    s().finish();
    expect(s()).toMatchObject({ activeId: 'lesson-ownership', screen: 2, finishes: 0 });
    expect(s().completed).toEqual({});
  });

  it('should save the journal line once, and keep a failure from stopping the learner twice', async () => {
    const write = vi.fn().mockResolvedValueOnce('Network error').mockResolvedValue(null);
    s().start('lesson-01');
    expect(noteToSave(s())).toBe(false);
    expect(await s().saveNote(write)).toBe(true); // nothing typed: nothing to save
    s().setNote(' One pen ');
    expect(noteToSave(s())).toBe(true);

    expect(await s().saveNote(write)).toBe(false);
    expect(s()).toMatchObject({
      noteStatus: 'draft',
      noteError: expect.stringContaining('carry on'),
    });
    // The way on, after a failure, goes on without another try; Save to journal tries again
    expect(noteToSave(s())).toBe(false);
    expect(await s().saveNote(write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await s().saveNote(write, true)).toBe(true);
    expect(write).toHaveBeenLastCalledWith('One pen');
    expect(s().noteStatus).toBe('saved');
    expect(await s().saveNote(write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('should not let a save that lands after the learner left mark the next lesson’s line', async () => {
    let land: (v: null) => void = () => undefined;
    const write = () => new Promise<null>((resolve) => (land = resolve));
    s().start('lesson-01');
    s().setNote('Slow');
    const saving = s().saveNote(write);
    expect(s().noteStatus).toBe('saving');

    s().close();
    s().start('lesson-ownership');
    land(null);
    expect(await saving).toBe(false);
    expect(s()).toMatchObject({ activeId: 'lesson-ownership', note: '', noteStatus: 'draft' });
  });

  it('should go home from a look back when its lesson is started, carry on in its own, and start any other afresh', () => {
    s().start('lesson-ownership', 3);
    s().answer(0);
    s().visit('lesson-01', 1);
    s().start('lesson-ownership', 5); // home, answers kept, at the screen asked for
    expect(s()).toMatchObject({
      activeId: 'lesson-ownership',
      screen: 5,
      answers: { 3: 0 },
      returnTo: null,
    });
    s().visit('lesson-01', 1);
    s().start('lesson-ownership'); // no screen: where it was left
    expect(s()).toMatchObject({ activeId: 'lesson-ownership', screen: 5, answers: { 3: 0 } });

    s().visit('lesson-01', 1);
    s().start('lesson-01', 4); // the look back's own lesson: the look back carries on, at that card
    expect(s()).toMatchObject({ activeId: 'lesson-01', screen: 4 });
    expect(s().returnTo?.lesson).toBe('lesson-ownership');

    s().start('lesson-02'); // any other: a fresh run, the look back over
    expect(s()).toMatchObject({ activeId: 'lesson-02', screen: 0, returnTo: null });
    expect(s().starts).toBe(2);
  });

  it('should leave no rating behind once a lesson is finished', () => {
    s().start('lesson-01');
    s().rate(4);
    s().finish();
    expect(s()).toMatchObject({ activeId: null, rating: null, finishes: 1 });
  });

  it('should keep the lesson already on screen: its screen with none given, a card if asked, its tour', () => {
    s().start('lesson-02', 3);
    s().answer(1);
    const run = s().run;
    s().start('lesson-02');
    expect(s()).toMatchObject({ activeId: 'lesson-02', screen: 3, answers: { 3: 1 }, run });
    s().start('lesson-02', 6);
    expect(s()).toMatchObject({ screen: 6, answers: { 3: 1 }, run });
    expect(s().starts).toBe(1);

    s().enterTour('primer');
    s().start('lesson-02', 2);
    expect(s()).toMatchObject({ screen: 6, inTour: true });
  });

  it('should remember the furthest screen of each lesson, never lower it, and skip a look back', () => {
    // The map's progress ring (owner 2026-11-12)
    const st = useLessonStore.getState;
    st().start('lesson-02', 3);
    st().next();
    expect(st().reached).toEqual({ 'lesson-02': 4 });
    st().back();
    st().back();
    expect(st().reached['lesson-02']).toBe(4);
    // A look back only visits: Lesson 1 isn't begun by it
    st().visit('lesson-01', 6);
    expect(st().reached['lesson-01']).toBeUndefined();
    // The server's answer merges, each lesson keeping the higher
    st().setReached({ 'lesson-02': 2, 'lesson-ownership': 5 });
    expect(st().reached).toEqual({ 'lesson-02': 4, 'lesson-ownership': 5 });
    st().reset();
    expect(st().reached).toEqual({});
  });

  it('should count a finish once when a look back comes between the streak and the close', () => {
    s().start('lesson-01');
    s().markFinished();
    expect(s().finishes).toBe(1);
    s().visit('lesson-ownership', 2); // a look back from the streak screen's lesson
    s().returnBack();
    s().markFinished(); // pressed again: still the same finish
    s().finish();
    expect(s()).toMatchObject({ finishes: 1, activeId: null, completed: { 'lesson-01': true } });
  });
});
