-- Owner 2026-11-16: Lessons 1–3 were rewritten (new screens, new quizzes). Every learner starts them
-- again: begun and finished alike (lesson-01 = Lesson 1, lesson-ownership = Lesson 2, lesson-02 =
-- Lesson 3; the ids stay, as accounts store them). Their funnel steps moved too (`stepBase`), so a
-- stored step would name no screen of today's lessons. Data only, no schema change.
DELETE FROM "LearningProgress" WHERE "itemId" IN ('lesson-01', 'lesson-ownership', 'lesson-02');
