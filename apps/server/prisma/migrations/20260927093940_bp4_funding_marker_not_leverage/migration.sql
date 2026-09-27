-- BP-4 review fix: a SymbolSetting row created only to record lastFundingAt must not pin the
-- symbol's leverage. Existing rows were all created by a leverage change (or the BP-3 merge
-- migration, which set each position's leverage), so they stay pinned (default true).

-- AlterTable
ALTER TABLE "SymbolSetting" ADD COLUMN     "leveragePinned" BOOLEAN NOT NULL DEFAULT true;
