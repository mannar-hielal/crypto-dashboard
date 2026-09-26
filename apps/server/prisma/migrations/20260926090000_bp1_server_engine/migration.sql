-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "grossPnl" DECIMAL(20,8),
ADD COLUMN     "seq" SERIAL NOT NULL,
ALTER COLUMN "pnlPercent" SET DATA TYPE DECIMAL(12,4);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "isUserNote" BOOLEAN NOT NULL DEFAULT false,
    "pnl" DECIMAL(20,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceEvent" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "balanceBefore" DECIMAL(20,8) NOT NULL,
    "balanceAfter" DECIMAL(20,8) NOT NULL,
    "pnl" DECIMAL(20,8) NOT NULL,
    "action" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineLease" (
    "id" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastTickAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_userId_seq_idx" ON "JournalEntry"("userId", "seq");

-- CreateIndex
CREATE INDEX "BalanceEvent_userId_seq_idx" ON "BalanceEvent"("userId", "seq");

-- CreateIndex
CREATE INDEX "Order_status_symbol_idx" ON "Order"("status", "symbol");

-- CreateIndex
CREATE INDEX "Order_userId_seq_idx" ON "Order"("userId", "seq");

-- CreateIndex
CREATE INDEX "Trade_userId_seq_idx" ON "Trade"("userId", "seq");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEvent" ADD CONSTRAINT "BalanceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEvent" ADD CONSTRAINT "BalanceEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: pending orders placed before BP-1 carry the leverage they were placed with in their
-- quantity (qty = margin × leverage / trigger). Recover it so they fill at the same size (S2).
UPDATE "Order"
SET "leverage" = GREATEST(1, LEAST(10, ROUND("quantity" * COALESCE("limitPrice", "stopPrice") / "margin")))
WHERE "status" = 'PENDING'
  AND "margin" > 0
  AND COALESCE("limitPrice", "stopPrice") IS NOT NULL;
