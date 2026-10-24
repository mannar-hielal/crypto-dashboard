/**
 * The links between lessons, concepts and articles, worked out from what each declares (lesson cards
 * mark `[[terms]]`, concepts name their article and tours) — never kept by hand, so they can't go
 * stale. `learnGraph.test` holds the rules: every term is a concept, every article leads back to
 * practice, and a free item never links to a paid one. Pure: no React.
 */

import { getLesson, LESSONS, lessonScreens, type LessonId } from '@/guide/lessons';
import { getTour, type TourId } from '@/guide/tours';
import type { ArticleId } from './articles';
import { CONCEPTS, getConcept, isConceptId, type Concept, type ConceptId } from './concepts';
import { termIds } from './terms';

export type PracticeLink =
  | { kind: 'lesson'; lesson: LessonId; screen: number; label: string }
  | { kind: 'tour'; tour: TourId; label: string };

/** Where each concept is taught in a lesson: the lesson and the screen of the card that marks it */
export function lessonPlacesOf(concept: ConceptId): { lesson: LessonId; screen: number }[] {
  const out: { lesson: LessonId; screen: number }[] = [];
  for (const lesson of LESSONS) {
    lessonScreens(lesson).forEach((screen, i) => {
      if (screen.kind !== 'card') return;
      const ids = termIds(lesson.cards[screen.index].text ?? '');
      if (ids.includes(concept)) out.push({ lesson: lesson.id, screen: i });
    });
  }
  return out;
}

/** The concepts an article explains */
export function conceptsOf(article: ArticleId): Concept[] {
  return CONCEPTS.filter((c) => c.article === article);
}

/** Where a reader of this article can practise it: lesson cards first, then tours, no repeats */
export function practiceFor(article: ArticleId): PracticeLink[] {
  const lessons = new Map<string, PracticeLink>();
  const tours = new Map<TourId, PracticeLink>();
  for (const concept of conceptsOf(article)) {
    for (const place of lessonPlacesOf(concept.id)) {
      const key = `${place.lesson}:${place.screen}`;
      if (lessons.has(key)) continue;
      const lesson = getLesson(place.lesson);
      const screen = lessonScreens(lesson)[place.screen];
      const card = screen.kind === 'card' ? lesson.cards[screen.index] : null;
      lessons.set(key, {
        kind: 'lesson',
        lesson: place.lesson,
        screen: place.screen,
        label: `Lesson ${lesson.number}: ${card?.title ?? lesson.title}`,
      });
    }
    for (const tour of concept.practisedIn ?? []) {
      if (!tours.has(tour)) tours.set(tour, { kind: 'tour', tour, label: getTour(tour).title });
    }
  }
  const order = (l: PracticeLink) =>
    l.kind === 'lesson' ? getLesson(l.lesson).number * 1000 + l.screen : 0;
  const ordered = [...lessons.values()].sort((a, b) => order(a) - order(b));
  return [...ordered, ...tours.values()];
}

/** The concept behind a tapped term, or null for an unknown id (never thrown at a learner) */
export function conceptFor(id: string): Concept | null {
  return isConceptId(id) ? getConcept(id) : null;
}
