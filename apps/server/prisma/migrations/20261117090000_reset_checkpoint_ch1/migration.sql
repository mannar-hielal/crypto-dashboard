-- Owner 2026-11-17: chapter 1's checkpoint changed with the Lessons 1–3 rewrite (a question went
-- with keys and custody to a later lesson), so its earlier passes no longer count: every learner
-- takes it again, and a learner already in chapter 2 finds it closed until they pass. A pass now
-- carries its question set's version as `step` (CHECKPOINT_VERSION); the API also ignores a pass
-- without one, written by an old API machine while this release rolls out. Data only.
DELETE FROM "LearningProgress" WHERE "itemId" = 'checkpoint-ch1';
