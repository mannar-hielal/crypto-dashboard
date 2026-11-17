/**
 * Match boxes (owner's visual Q&A, 2026-11-16): terms on the left, meanings on the right in a fixed
 * shuffle. Tap a term, then its meaning: both get the same numbered chip, so colour is never the
 * only cue. Tapping a paired box undoes its pair. "Check" grades once every term is paired: each pair
 * gets ✓ or ✕, then "Right." / "Not quite." and the Why. Coming back to an answered question shows
 * the right pairs.
 */

import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { shuffledOrder, type LessonQuestion } from './lessons';
import { BoardFooter } from './BoardFooter';
import styles from './QuizBoard.module.css';

/** The links without the given term's pair */
const unpair = (links: Record<number, number>, term: number) =>
  Object.fromEntries(Object.entries(links).filter(([t]) => Number(t) !== term));

/** The pair's chip: ① ② ③ … */
const chip = (n: number) => String.fromCodePoint(0x2460 + n);

export function MatchQuiz({
  q,
  answer,
  onAnswer,
}: {
  q: LessonQuestion;
  answer: number | undefined;
  onAnswer: (i: number) => void;
}) {
  const pairs = useMemo(() => q.pairs ?? [], [q.pairs]);
  const answered = answer !== undefined;
  const meanings = useMemo(
    () => shuffledOrder(pairs.length, q.question),
    [pairs.length, q.question]
  );
  // term index → meaning index (the meaning's own index in `pairs`)
  const [links, setLinks] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const complete = Object.keys(links).length === pairs.length;
  // Answered on an earlier visit: no pairs in memory, so the right pairs are shown, unmarked
  const revisit = answered && !complete;
  const shown: Record<number, number> = revisit
    ? Object.fromEntries(pairs.map((_, i) => [i, i]))
    : links;
  const termOf = (meaning: number) => {
    const t = Object.entries(shown).find(([, m]) => m === meaning)?.[0];
    return t === undefined ? null : Number(t);
  };

  const onTerm = (t: number) => {
    if (answered) return;
    // A paired term is unpaired; a term being picked stays picked (only an unpaired term can be)
    if (links[t] !== undefined) setLinks((cur) => unpair(cur, t));
    else setSelected(selected === t ? null : t);
  };
  const onMeaning = (m: number) => {
    if (answered) return;
    const owner = termOf(m);
    if (selected === null) {
      if (owner !== null) setLinks((cur) => unpair(cur, owner));
      return;
    }
    setLinks((cur) => {
      const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== m));
      return { ...next, [selected]: m };
    });
    setSelected(null);
  };
  // Right: the question's own correct answer; not quite: -1 (no option), judged like any question
  const check = () => onAnswer(pairs.every((_, t) => links[t] === t) ? q.correct : -1);

  return (
    <>
      <p className={styles.question}>{q.question}</p>
      <div className={styles.columns}>
        <div className={styles.column}>
          {pairs.map((p, t) => {
            const m = shown[t];
            const mark =
              answered && !revisit && m !== undefined ? (m === t ? 'right' : 'wrong') : null;
            return (
              <button
                key={p.term}
                type="button"
                className={`${styles.box} ${selected === t ? styles.picked : ''} ${
                  mark ? styles[mark] : ''
                }`}
                disabled={answered}
                aria-pressed={selected === t}
                aria-label={`${p.term}${m === undefined ? '' : `, pair ${t + 1}`}${
                  mark === 'right' ? ', right' : mark === 'wrong' ? ', not quite' : ''
                }`}
                onClick={() => onTerm(t)}
                {...guide('lesson.match-term', String(t))}
              >
                <span aria-hidden="true">{p.term}</span>
                {m !== undefined && (
                  <span className={styles.chip} aria-hidden="true">
                    {chip(t)}
                  </span>
                )}
                {mark === 'right' && <Check aria-hidden="true" size={16} strokeWidth={3} />}
                {mark === 'wrong' && <X aria-hidden="true" size={16} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <div className={styles.column}>
          {meanings.map((m) => {
            const t = termOf(m);
            return (
              <button
                key={pairs[m].meaning}
                type="button"
                className={styles.box}
                disabled={answered}
                aria-label={`${pairs[m].meaning}${t === null ? '' : `, pair ${t + 1}`}`}
                onClick={() => onMeaning(m)}
                {...guide('lesson.match-meaning', String(m))}
              >
                <span aria-hidden="true">{pairs[m].meaning}</span>
                {t !== null && (
                  <span className={styles.chip} aria-hidden="true">
                    {chip(t)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <BoardFooter
        right={answer === undefined ? undefined : answer === q.correct}
        ready={complete}
        onCheck={check}
        revisit={revisit}
        revisitLabel="The right pairs:"
        explain={q.explain}
      />
    </>
  );
}
