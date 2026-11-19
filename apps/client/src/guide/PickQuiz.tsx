/**
 * Pick the right ones (owner's visual Q&A, 2026-11-18): six tiles in two columns, each an icon and a
 * few words; the learner picks exactly as many as the question names ("Picked 2 of 3"), then Check.
 * Each picked tile gets ✓ or ✕ (never colour alone), then "Right." / "Not quite." and the Why; after
 * a "Not quite.", Try again clears the picks (owner 2026-11-17). A tapped tile is a real button
 * (Tab to move, Space to pick). Coming back to a rightly answered question shows the right tiles.
 */

import { useState } from 'react';
import {
  ArrowsClockwise,
  CalendarBlank,
  Certificate,
  ChartPieSlice,
  Coins,
  Eye,
  Leaf,
  Lightning,
  LinkSimple,
  ListChecks,
  RoadHorizon,
  UsersThree,
} from '@phosphor-icons/react';
import { Check, X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { BoardFooter } from './BoardFooter';
import { QUIZ_MARK_SIZE_SMALL } from './quizMarks';
import type { LessonQuestion, TileIcon } from './lessons';
import styles from './PickQuiz.module.css';

const ICONS = {
  calendar: CalendarBlank,
  pie: ChartPieSlice,
  calm: Leaf,
  repeat: ArrowsClockwise,
  lightning: Lightning,
  eye: Eye,
  // Lesson 5's coin traits (2026-11-19)
  road: RoadHorizon,
  link: LinkSimple,
  coins: Coins,
  people: UsersThree,
  vote: ListChecks,
  certificate: Certificate,
} satisfies Record<TileIcon, unknown>;

export function PickQuiz({
  q,
  answer,
  onAnswer,
  onRetry,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
  /** "Try again" after a wrong check: the picks are cleared, then the answer */
  onRetry?: () => void;
}) {
  const tiles = q.tiles ?? [];
  const need = tiles.filter((t) => t.right).length;
  const [picked, setPicked] = useState<number[]>([]);
  const answered = answer !== undefined;
  const right = answer === q.correct;
  // Answered on an earlier visit: no picks in memory, so the right tiles are shown, unmarked
  const revisit = right && picked.length === 0;
  const shown = revisit ? tiles.flatMap((t, i) => (t.right ? [i] : [])) : picked;

  const toggle = (i: number) => {
    if (answered) return;
    setPicked((cur) =>
      cur.includes(i) ? cur.filter((n) => n !== i) : cur.length < need ? [...cur, i] : cur
    );
  };

  return (
    <>
      <p className={styles.count}>{q.question}</p>
      <ul className={styles.grid}>
        {tiles.map((t, i) => {
          const Icon = ICONS[t.icon];
          const on = shown.includes(i);
          const mark = answered && !revisit && on ? (t.right ? 'right' : 'wrong') : null;
          return (
            <li key={t.label}>
              <button
                type="button"
                className={`${styles.tile} ${on && !mark ? styles.on : ''} ${
                  mark ? styles[mark] : ''
                }`}
                disabled={answered}
                aria-pressed={on}
                aria-label={`${t.label}${
                  mark === 'right' ? ', right' : mark === 'wrong' ? ', not quite' : ''
                }`}
                onClick={() => toggle(i)}
                {...guide('lesson.pick-tile', String(i))}
              >
                <Icon aria-hidden="true" size={28} weight="duotone" className={styles.icon} />
                <span aria-hidden="true">{t.label}</span>
                {mark === 'right' && (
                  <Check aria-hidden="true" size={QUIZ_MARK_SIZE_SMALL} strokeWidth={3} />
                )}
                {mark === 'wrong' && (
                  <X aria-hidden="true" size={QUIZ_MARK_SIZE_SMALL} strokeWidth={3} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!answered && <p className={styles.count}>{`Picked ${picked.length} of ${need}`}</p>}
      <BoardFooter
        right={answered ? right : undefined}
        ready={picked.length === need}
        onCheck={() => onAnswer(picked.every((i) => tiles[i].right) ? q.correct : -1)}
        revisit={revisit}
        revisitLabel="The right ones:"
        explain={q.explain}
        onRetry={
          onRetry &&
          (() => {
            setPicked([]);
            onRetry();
          })
        }
      />
    </>
  );
}
