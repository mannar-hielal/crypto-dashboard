/**
 * The links between lessons, concepts and articles, worked out from what each declares (lesson cards
 * mark `[[terms]]`, concepts name their article and tours) — never kept by hand, so they can't go
 * stale. `learnGraph.test` holds the rules: every term is a concept, every article leads back to
 * practice, and a free item never links to a paid one. Pure: no React.
 */

import { getLesson, LESSONS, lessonScreens, type LessonCard, type LessonId } from '@/guide/lessons';
import { getTour, type TourId } from '@/guide/tours';
import type { ArticleId } from './articles';
import { CONCEPTS, getConcept, isConceptId, type Concept, type ConceptId } from './concepts';
import { termIds } from './terms';

export type PracticeLink =
  | { kind: 'lesson'; lesson: LessonId; screen: number; label: string }
  | { kind: 'tour'; tour: TourId; label: string };

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
  return cardPlaces((card) => termIds(card.text ?? '').includes(concept));
}

/** A lesson screen as a link's label: "Lesson 1: A notebook, not coins" (its card's title) */
export function lessonPlaceLabel(place: { lesson: LessonId; screen: number }): string {
  const lesson = getLesson(place.lesson);
  const screen = lessonScreens(lesson)[place.screen];
  const card = screen?.kind === 'card' ? lesson.cards[screen.index] : null;
  return `Lesson ${lesson.number}: ${card?.title ?? lesson.title}`;
}

/** The concepts an article explains */
export function conceptsOf(article: ArticleId): Concept[] {
  return CONCEPTS.filter((c) => c.article === article);
}

/** Lesson cards whose Read more opens this article (`card.more`, owner 2026-11-12) */
export function lessonPlacesReading(article: ArticleId): { lesson: LessonId; screen: number }[] {
  return cardPlaces((card) => card.more?.article === article);
}

/**
 * Where a reader of this article can practise it: lesson cards first (those marking its concepts,
 * and those whose Read more opens it), then tours, no repeats
 */
export function practiceFor(article: ArticleId): PracticeLink[] {
  const lessons = new Map<string, PracticeLink>();
  const tours = new Map<TourId, PracticeLink>();
  const places = [
    ...conceptsOf(article).flatMap((concept) => lessonPlacesOf(concept.id)),
    ...lessonPlacesReading(article),
  ];
  for (const place of places) {
    const key = `${place.lesson}:${place.screen}`;
    if (lessons.has(key)) continue;
    lessons.set(key, {
      kind: 'lesson',
      lesson: place.lesson,
      screen: place.screen,
      label: lessonPlaceLabel(place),
    });
  }
  for (const concept of conceptsOf(article)) {
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
