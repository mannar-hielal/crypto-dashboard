import { describe, expect, it } from 'vitest';
import { FREE } from '@/learn/access';
import { CHECKPOINTS } from '@/learn/checkpoints';
import {
  CHAPTERS,
  nodeMode,
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
      'open',
    ]);
    expect(view.chapters[0].done).toBe(1);
    expect(view.percent).toBe(17);
  });

  it('should let a tour skipped on a phone stop blocking the path, without counting it as done', () => {
    const view = pathState({
      ...empty(),
      lessons: { 'lesson-01': true, 'lesson-ownership': true, 'lesson-02': true },
      skippedTours: { 'buy-first-coin': true },
    });
    expect(view.chapters[0].nodes.map((n) => n.state)).toEqual([
      'done',
      'done',
      'done',
      'skipped',
      'current',
      'open',
    ]);
    expect(view.percent).toBe(50);
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
      lessons: { 'lesson-01': true, 'lesson-ownership': true, 'lesson-02': true },
      tours: { 'buy-first-coin': true, 'sell-and-review': true },
    });
    expect(view.current).toBe('checkpoint:checkpoint-ch1');
  });

  it('should open the rest of the chapter when tested out, never ticking what was skipped', () => {
    const view = pathState({ ...empty(), checkpoints: { 'checkpoint-ch1': true } });
    expect(view.chapters[0].nodes.map((n) => n.state)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
      'done',
    ]);
    expect(view.chapters[0].done).toBe(1);
    // Chapter 2 isn't written yet, so there is no next step
    expect(view.current).toBeNull();
    expect(view.percent).toBe(17);
  });

  it('should keep a chapter that is coming soon inert', () => {
    const soon = pathState(empty()).chapters[1];
    expect(soon.chapter.status).toBe('soon');
    expect(soon.locked).toBe(true);
    expect(soon.nodes).toEqual([]);
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
      expect(c.nodes.at(-1)?.kind).toBe('checkpoint');
      expect(c.nodes.filter((n) => n.kind === 'checkpoint')).toHaveLength(1);
    }
  });

  it('should mark a stop hands-on when the learner tries it themselves', () => {
    // Owner 2026-11-12: any lesson with a "Now you try it" is hands-on, as is practice on the screen
    expect(nodeMode({ kind: 'lesson', id: 'lesson-01', access: FREE })).toBe('hands-on'); // Nora's ledger
    expect(nodeMode({ kind: 'lesson', id: 'lesson-02', access: FREE })).toBe('hands-on'); // the real chart
    expect(nodeMode({ kind: 'tour', id: 'buy-first-coin', access: FREE })).toBe('hands-on');
    expect(nodeMode({ kind: 'checkpoint', id: 'checkpoint-ch1', access: FREE })).toBe('check');
    const view = pathState(empty());
    expect(view.chapters[0].nodes.map((n) => n.mode)).toEqual([
      'hands-on',
      'hands-on',
      'hands-on',
      'hands-on',
      'hands-on',
      'check',
    ]);
  });
});
