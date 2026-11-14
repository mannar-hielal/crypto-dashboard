-- AlterTable: a sign-in's token family (logout deletes it) and a cap on reuse inside the window.
-- Added without a default first: a volatile default on ADD COLUMN would rewrite the whole table,
-- and the backfill below rewrites it again (review on #297)
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "reuseCount" INTEGER NOT NULL DEFAULT 0;

-- 🔐 The default before the backfill: the previous build, still serving while this migration runs,
--    creates tokens without a family, and from here on each one gets a family of its own. Were it
--    added after the backfill, a token inserted in between would stay NULL and the NOT NULL below
--    would fail the migration (reviews on #288, #289). SET DEFAULT on an existing column only
--    applies to new rows, so it rewrites nothing
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET DEFAULT (gen_random_uuid())::text;

-- Backfill: every token issued before families is its own family (familyId = id), so a logout
-- always finds the whole chain (review on #288)
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

-- Required: no token is ever without a family
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- The daily purge deletes by expiry, on a table that now keeps rotated rows (review on #288)
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
