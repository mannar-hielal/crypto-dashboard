-- Owner 2026-11-22: Lessons 2, 3 and 4 gained a second card, the sneak peek ("What you will learn"), so
-- every screen after it moved one place and their funnel steps moved too (`stepBase` 60 -> 100): a
-- stored step would name another screen of today's lessons. Every learner starts them again, begun
-- and finished alike (lesson-ownership = Lesson 2, lesson-02 = Lesson 3, lesson-04 = Lesson 4; the
-- ids stay, as accounts store them). Lesson 1 and the checkpoint are untouched, and a passed chapter 1
-- checkpoint still opens chapter 2. Data only, no schema change.
DELETE FROM "LearningProgress" WHERE "itemId" IN ('lesson-ownership', 'lesson-02', 'lesson-04');
