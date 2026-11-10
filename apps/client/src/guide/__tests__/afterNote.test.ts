import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { afterNote, setJournalWrite, startLesson, startTour } from '@/guide/afterNote';
import { useLessonStore } from '@/guide/lessonStore';
import { getLesson, lessonScreens } from '@/guide/lessons';
import { useTourStore } from '@/guide/tourStore';

const s = () => useLessonStore.getState();
const lastScreen = (id: Parameters<typeof getLesson>[0]) => lessonScreens(getLesson(id)).length - 1;

describe('afterNote', () => {
  beforeEach(() => {
    s().reset();
    useTourStore.getState().reset();
  });
  afterEach(() => setJournalWrite(null));

  it('should go on at once with no journal line to save', () => {
    const go = vi.fn();
    afterNote(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('should save a typed line first, go on once it is in, and ignore a press while it saves', async () => {
    let land: (v: null) => void = () => undefined;
    const write = vi.fn(() => new Promise<null>((resolve) => (land = resolve)));
    setJournalWrite(write);
    s().start('lesson-02', lastScreen('lesson-02'));
    s().setNote('A line');
    const go = vi.fn();
    afterNote(go);
    afterNote(go); // a second press while it saves: ignored
    expect(write).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    land(null);
    await vi.waitFor(() => expect(go).toHaveBeenCalledTimes(1));
  });

  it('should hand the lesson’s own tour over, the lesson waiting where it is', () => {
    const navigate = vi.fn();
    s().start('lesson-02', 1);
    startTour('primer', navigate);
    expect(s()).toMatchObject({ activeId: 'lesson-02', screen: 1, inTour: true });
    expect(useTourStore.getState().activeId).toBe('primer');
    expect(navigate).toHaveBeenCalled();
    // Handed over from a card, the lesson comes back on that card; from Try, it moves on
    act(() => useTourStore.getState().close());
    s().leaveTour();
    expect(s()).toMatchObject({ screen: 1, inTour: false });
    const tryScreen = lessonScreens(getLesson('lesson-02')).findIndex((x) => x.kind === 'try');
    s().start('lesson-02', tryScreen);
    s().enterTour();
    s().leaveTour();
    expect(s().screen).toBe(tryScreen + 1);
  });

  it('should end the lesson on screen, a look back’s home with it, before any other tour', () => {
    s().start('lesson-ownership', 2);
    s().visit('lesson-01', 1);
    startTour('primer', vi.fn());
    expect(s()).toMatchObject({ activeId: null, returnTo: null });
    expect(useTourStore.getState().activeId).toBe('primer');
  });

  it('should end a running tour when another lesson is started from outside', () => {
    s().start('lesson-02', 1);
    startTour('primer', vi.fn()); // Lesson 3's own tour, handed over
    startLesson('lesson-01');
    expect(s()).toMatchObject({ activeId: 'lesson-01', inTour: false });
    expect(useTourStore.getState().activeId).toBeNull();

    // A tour of its own (no lesson) too
    startTour('buy-first-coin', vi.fn());
    expect(useTourStore.getState().activeId).toBe('buy-first-coin');
    startLesson('lesson-02');
    expect(useTourStore.getState().activeId).toBeNull();
  });

  it('should let a Finish win over a ✕ or Esc pressed while a save is on its way, either order', async () => {
    for (const finishFirst of [true, false]) {
      let land: (v: null) => void = () => undefined;
      setJournalWrite(() => new Promise<null>((resolve) => (land = resolve)));
      s().reset();
      s().start('lesson-02', lastScreen('lesson-02'));
      s().setNote('A line');
      const finish = vi.fn();
      const close = vi.fn();
      if (finishFirst) {
        afterNote(finish, { finishing: true });
        afterNote(close);
      } else {
        afterNote(close);
        afterNote(finish, { finishing: true });
      }
      land(null);
      await vi.waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
      expect(close).not.toHaveBeenCalled();
    }
  });

  it('should hand the home lesson’s own tour over from a look back', () => {
    s().start('lesson-02', 3);
    s().answer(0);
    s().visit('lesson-01', 1);
    startTour('primer', vi.fn());
    expect(s()).toMatchObject({
      activeId: 'lesson-02',
      screen: 3,
      answers: { 3: 0 },
      inTour: true,
      returnTo: null,
    });
  });

  it('should run only the first move asked while a save is on its way', async () => {
    let land: (v: null) => void = () => undefined;
    setJournalWrite(() => new Promise<null>((resolve) => (land = resolve)));
    s().start('lesson-02', lastScreen('lesson-02'));
    s().setNote('A line');
    const first = vi.fn();
    const last = vi.fn();
    afterNote(first);
    afterNote(last);
    land(null);
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(last).not.toHaveBeenCalled();
  });

  it('should hand a looked-back lesson’s own tour to that look back', () => {
    s().start('lesson-ownership', 1);
    s().visit('lesson-02', 2); // any look back into a lesson with a tour
    startTour('primer', vi.fn());
    expect(s()).toMatchObject({ activeId: 'lesson-02', screen: 2, inTour: true });
    expect(s().returnTo?.lesson).toBe('lesson-ownership');
  });
});
