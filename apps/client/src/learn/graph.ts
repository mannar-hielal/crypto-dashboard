/**
 * The links between lessons and concepts, worked out from what each declares (lesson cards mark
 * `[[terms]]`) — never kept by hand, so they can't go stale. `learnGraph.test` holds the rules: every
 * term is a concept, and a free item never links to a paid one. Pure: no React.
 */

import {
  cardTermIds,
  getLesson,
  LESSONS,
  lessonScreens,
  type LessonCard,
  type LessonId,
} from '@/guide/lessons';
import { getConcept, isConceptId, type Concept, type ConceptId } from './concepts';

/** Every lesson card that passes `test`, as the lesson and the screen it sits on */
function cardPlaces(test: (card: LessonCard) => boolean): { lesson: LessonId; screen: number }[] {
  const out: { lesson: LessonId; screen: number }[] = [];
  for (const lesson of LESSONS) {
    lessonScreens(lesson).forEach((screen, i) => {
      if (screen.kind === 'card' && test(lesson.cards[screen.index])) {
        out.push({ lesson: lesson.id, screen: i });
      }
    });
  }
  return out;
}

/** Where each concept is taught in a lesson: the lesson and the screen of the card that marks it */
export function lessonPlacesOf(concept: ConceptId): { lesson: LessonId; screen: number }[] {
  return cardPlaces((card) => cardTermIds(card).includes(concept));
}

/** A lesson screen as a link's label: "Lesson 1: A notebook, not coins" (its card's title) */
export function lessonPlaceLabel(place: { lesson: LessonId; screen: number }): string {
  const lesson = getLesson(place.lesson);
  const screen = lessonScreens(lesson)[place.screen];
  const card = screen?.kind === 'card' ? lesson.cards[screen.index] : null;
  return `Lesson ${lesson.number}: ${card?.title ?? lesson.title}`;
}

/** The concept behind a tapped term, or null for an unknown id (never thrown at a learner) */
export function conceptFor(id: string): Concept | null {
  return isConceptId(id) ? getConcept(id) : null;
}
