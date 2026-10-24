import { beforeEach, describe, expect, it } from 'vitest';
import { useLessonStore } from '@/guide/lessonStore';
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
    useLessonStore.setState({ screen: 6 }); // try it
    s().enterTour();
    expect(s().inTour).toBe(true);
    s().leaveTour();
    expect(s().inTour).toBe(false);
    expect(s().screen).toBe(7);
    s().leaveTour(); // not in a tour: nothing moves
    expect(s().screen).toBe(7);
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
    expect(s().rating).toBe(4);
  });

  it('should replace the finished set with the server’s answer', () => {
    s().setCompleted(['lesson-01']);
    expect(s().completed).toEqual({ 'lesson-01': true });
    s().setCompleted([]);
    expect(s().completed).toEqual({});
  });
});
