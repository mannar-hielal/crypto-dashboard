import { describe, expect, it } from 'vitest';
import { getLesson, lessonScreens } from '@/guide/lessons';
import { FREE } from '@/learn/access';
import { CHECKPOINTS } from '@/learn/checkpoints';
import {
  CHAPTERS,
  lessonFraction,
  NEEDS_DONE,
  onChart,
  nodeOffset,
  openKeys,
  pathState,
  type Chapter,
  type PathProgress,
} from '@/learn/path';

const empty = (): PathProgress => ({ lessons: {}, tours: {}, skippedTours: {}, checkpoints: {} });

/** The states of chapter 1's stops, in order */
const states = (p: PathProgress, chapters?: readonly Chapter[]) =>
  pathState(p, [], chapters).chapters[0].nodes.map((n) => `${n.key}=${n.state}`);

describe('pathState', () => {
  it('should open only the first lesson and the checkpoint for a new learner', () => {
    expect(states(empty())).toEqual([
      'lesson:lesson-01=current',
      'lesson:lesson-ownership=locked',
      'lesson:lesson-02=locked',
      'tour:buy-first-coin=locked',
      'tour:sell-and-review=locked',
      'lesson:lesson-04=locked',
      'checkpoint:checkpoint-ch1=open',
    ]);
    const view = pathState(empty());
    expect(view.current).toBe('lesson:lesson-01');
    expect(view.percent).toBe(0);
  });

  it('should move the next step on once a lesson is done, and count it', () => {
    const view = pathState({ ...empty(), lessons: { 'lesson-01': true } });
    expect(view.chapters[0].nodes.map((n) => n.state)).toEqual([
      'done',
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
      'open',
    ]);
    expect(view.chapters[0].done).toBe(1);
    expect(view.percent).toBe(9);
  });

  it('should let a tour skipped on a phone stop blocking the path, without counting it as done', () => {
    const view = pathState({
      ...empty(),
      lessons: { 'lesson-01': true, 'lesson-ownership': true, 'lesson-02': true },
      skippedTours: { 'buy-first-coin': true },
    });
    // Sell needs Buy done (owner 2026-11-17): it stays locked, and Lesson 4 is next (owner 2026-11-18)
    expect(view.chapters[0].nodes.map((n) => n.state)).toEqual([
      'done',
      'done',
      'done',
      'skipped',
      'locked',
      'current',
      'open',
    ]);
    expect(view.percent).toBe(27);
  });

  it('should keep Sell locked until Buy is done, then make it the next step (owner 2026-11-17)', () => {
    expect(NEEDS_DONE).toEqual({ 'sell-and-review': 'buy-first-coin' });
    const lessons = { 'lesson-01': true, 'lesson-ownership': true, 'lesson-02': true } as const;
    const sell = (p: PathProgress) =>
      pathState(p).chapters[0].nodes.find((n) => n.key === 'tour:sell-and-review')!.state;
    // Not reached, reached with Buy still to do, tested out, skipped itself: locked every time
    expect(sell({ ...empty(), lessons })).toBe('locked');
    expect(sell({ ...empty(), checkpoints: { 'checkpoint-ch1': true } })).toBe('locked');
    expect(sell({ ...empty(), lessons, skippedTours: { 'sell-and-review': true } })).toBe('locked');
    // Buy done: open, and the next step
    const view = pathState({ ...empty(), lessons, tours: { 'buy-first-coin': true } });
    expect(view.current).toBe('tour:sell-and-review');
    // Buy done before the lessons around it (Lesson 1's Try): Sell still waits its turn on the path
    expect(sell({ ...empty(), tours: { 'buy-first-coin': true } })).toBe('locked');
  });

  it('should keep a finished tour done even if it was skipped earlier', () => {
    const view = pathState({
      ...empty(),
      tours: { 'buy-first-coin': true },
      skippedTours: { 'buy-first-coin': true },
    });
    expect(view.chapters[0].nodes[3].state).toBe('done');
  });

  it('should make the checkpoint the next step once everything before it is done', () => {
    const view = pathState({
      ...empty(),
      lessons: {
        'lesson-01': true,
        'lesson-ownership': true,
        'lesson-02': true,
        'lesson-04': true,
      },
      tours: { 'buy-first-coin': true, 'sell-and-review': true },
    });
    expect(view.current).toBe('checkpoint:checkpoint-ch1');
  });

  it('should open the rest of the chapter when tested out, never ticking what was skipped', () => {
    const view = pathState({ ...empty(), checkpoints: { 'checkpoint-ch1': true } });
    // But for Sell, which needs Buy done first (owner 2026-11-17)
    expect(view.chapters[0].nodes.map((n) => n.state)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'locked',
      'open',
      'done',
    ]);
    expect(view.chapters[0].done).toBe(1);
    // Passing the checkpoint opens chapter 2: its first lesson is the next step (owner 2026-11-19)
    expect(view.current).toBe('lesson:lesson-coins');
    expect(view.percent).toBe(9);
  });

  it('should keep a chapter that is coming soon inert', () => {
    const later: Chapter = {
      id: 'ch3',
      number: 3,
      title: 'Later',
      tone: 'green',
      access: FREE,
      status: 'soon',
      preview: [{ kind: 'lesson', title: 'Someday' }],
    };
    const soon = pathState(empty(), [], [CHAPTERS[0], later]).chapters[1];
    expect(soon.chapter.status).toBe('soon');
    expect(soon.locked).toBe(true);
    expect(soon.nodes).toEqual([]);
    expect(soon.firstIndex).toBe(7);
  });

  it('should show chapter 2 as its built lessons, locked until chapter 1 is passed, then its unwritten stops as titles (owner 2026-11-19)', () => {
    const view = pathState(empty());
    const two = view.chapters[1];
    expect(two.chapter.status).toBe('open');
    expect(two.locked).toBe(true);
    expect(two.nodes.map((n) => `${n.key}=${n.state}`)).toEqual([
      'lesson:lesson-coins=locked',
      'lesson:lesson-stablecoins=locked',
      'lesson:lesson-wallets=locked',
      'lesson:lesson-fees=locked',
    ]);
    expect(two.firstIndex).toBe(7);
    const ch = two.chapter as Chapter & { status: 'open' };
    // One lesson and the checkpoint are still to write, so the map shows them as titles only
    expect(ch.soon?.map((n) => n.kind)).toEqual(['lesson', 'checkpoint']);
  });

  it('should lock a later chapter until the one before it has its checkpoint passed', () => {
    const open = CHAPTERS[0] as Chapter & { status: 'open' };
    const two: Chapter = { ...open, id: 'two', number: 2 };
    const before = pathState(empty(), [], [open, two]).chapters[1];
    expect(before.locked).toBe(true);
    expect(before.nodes.every((n) => n.state === 'locked')).toBe(true);

    const after = pathState(
      { ...empty(), lessons: { 'lesson-01': true }, checkpoints: { 'checkpoint-ch1': true } },
      [],
      [open, { ...open, id: 'two', number: 2, nodes: open.nodes.slice(2, 4) }]
    );
    expect(after.chapters[1].locked).toBe(false);
    expect(after.chapters[1].firstIndex).toBe(7);
    expect(after.current).toBe('lesson:lesson-02');
  });

  it('should show a stop that is not on the plan as Pro, not locked, and not block the path', () => {
    const open = CHAPTERS[0] as Chapter & { status: 'open' };
    const withPro: Chapter = {
      ...open,
      nodes: [{ ...open.nodes[0], access: 'learn.deep-dives' }, ...open.nodes.slice(1)],
    };
    expect(states(empty(), [withPro]).slice(0, 2)).toEqual([
      'lesson:lesson-01=pro',
      'lesson:lesson-ownership=current',
    ]);
    // Granted, it's an ordinary stop again
    expect(pathState(empty(), ['learn.deep-dives'], [withPro]).current).toBe('lesson:lesson-01');
  });

  it('should list what may be started now', () => {
    expect(openKeys(pathState(empty()))).toEqual(['lesson:lesson-01', 'checkpoint:checkpoint-ch1']);
  });
});

describe('the map', () => {
  it('should keep every chapter and checkpoint free today', () => {
    for (const c of CHAPTERS) {
      expect(c.access).toBe(FREE);
      if (c.status === 'open') for (const n of c.nodes) expect(n.access).toBe(FREE);
    }
    for (const c of CHECKPOINTS) expect(c.access).toBe(FREE);
  });

  it('should end every open chapter with its checkpoint', () => {
    for (const c of CHAPTERS) {
      if (c.status !== 'open') continue;
      // A chapter built lesson by lesson ends on its checkpoint among the titles still to write
      const stops: { kind: string }[] = [...c.nodes, ...(c.soon ?? [])];
      expect(stops.at(-1)?.kind).toBe('checkpoint');
      expect(stops.filter((n) => n.kind === 'checkpoint')).toHaveLength(1);
    }
  });

  it('should zig-zag within 40 px either side (back by the owner, 2026-11-12)', () => {
    const offsets = Array.from({ length: 12 }, (_, i) => nodeOffset(i));
    expect(offsets[0]).toBe(0);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(40);
    expect(new Set(offsets).size).toBeGreaterThan(3);
  });

  it('should ring a begun lesson with its share done, and nothing else', () => {
    const screens = lessonScreens(getLesson('lesson-02')).length;
    expect(lessonFraction('lesson-02', 6, false)).toBeCloseTo(7 / screens);
    expect(lessonFraction('lesson-02', undefined, false)).toBeNull(); // not begun
    expect(lessonFraction('lesson-02', 6, true)).toBeNull(); // done: the tick instead
    // The last screen without a Finish: a full ring, still not done
    expect(lessonFraction('lesson-02', screens - 1, false)).toBe(1);
    const view = pathState({ ...empty(), reached: { 'lesson-01': 2 } });
    const [l1, , , tour] = view.chapters[0].nodes;
    expect(l1.fraction).toBeCloseTo(3 / lessonScreens(getLesson('lesson-01')).length);
    expect(tour.fraction).toBeNull();
  });

  it('should mark what is done on the real chart: the practice, and Lesson 3', () => {
    // Owner 2026-11-12: the dumbbell icon
    // Lesson 1's Try is a paper trade on the real chart since the rewrite (owner 2026-11-16)
    expect(onChart({ kind: 'lesson', id: 'lesson-01', access: FREE })).toBe(true);
    expect(onChart({ kind: 'lesson', id: 'lesson-ownership', access: FREE })).toBe(false);
    expect(onChart({ kind: 'lesson', id: 'lesson-02', access: FREE })).toBe(true);
    expect(onChart({ kind: 'tour', id: 'buy-first-coin', access: FREE })).toBe(true);
    expect(onChart({ kind: 'checkpoint', id: 'checkpoint-ch1', access: FREE })).toBe(false);
  });
});
