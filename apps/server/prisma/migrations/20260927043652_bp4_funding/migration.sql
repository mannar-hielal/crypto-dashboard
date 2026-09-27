-- BP-4 funding. Additive only: new columns with defaults and one index, no backfill (no funding
-- was ever settled before BP-4).

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "cumFunding" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SymbolSetting" ADD COLUMN     "lastFundingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "feeRate" DECIMAL(12,8),
ADD COLUMN     "funding" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Trade_userId_execType_seq_idx" ON "Trade"("userId", "execType", "seq");
