-- AlterTable: a sign-in's token family (logout deletes it) and a cap on reuse inside the window
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "reuseCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: every token issued before families is its own family, so no token is ever without one
-- (a logout then always finds the whole chain; review on #288)
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

-- Required, with a default: the previous build, still serving while this migration runs, creates
-- tokens without a family; each one gets a family of its own instead of failing (review on #288)
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL,
ALTER COLUMN "familyId" SET DEFAULT (gen_random_uuid())::text;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
