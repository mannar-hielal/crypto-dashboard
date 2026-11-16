-- Owner 2026-11-16: Lessons 1–3 were rewritten (new screens, new quizzes). Every learner starts them
-- again: begun and finished alike (lesson-01 = Lesson 1, lesson-ownership = Lesson 2, lesson-02 =
-- Lesson 3; the ids stay, as accounts store them). Their funnel steps moved too (`stepBase`), so a
-- stored step would name no screen of today's lessons. Data only, no schema change.
-- A finished Lesson 1 also stood for "the welcome card is done with" (the client hides the card
-- then): keep that, as a dismissal, before the lesson's row goes
INSERT INTO "LearningProgress" ("userId", "itemId", "status", "updatedAt")
SELECT "userId", 'welcome-card', 'dismissed', NOW()
FROM "LearningProgress"
WHERE "itemId" = 'lesson-01' AND "status" = 'completed'
ON CONFLICT ("userId", "itemId") DO NOTHING;

DELETE FROM "LearningProgress" WHERE "itemId" IN ('lesson-01', 'lesson-ownership', 'lesson-02');
