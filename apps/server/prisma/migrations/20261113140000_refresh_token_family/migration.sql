-- AlterTable: a sign-in's token family (logout deletes it) and a cap on reuse inside the window
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "reuseCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
