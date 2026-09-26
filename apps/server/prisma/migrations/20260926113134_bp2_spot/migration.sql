-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "ocoGroup" TEXT;

-- CreateTable
CREATE TABLE "SpotBalance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "free" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "locked" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotBalance_accountId_coin_key" ON "SpotBalance"("accountId", "coin");

-- AddForeignKey
ALTER TABLE "SpotBalance" ADD CONSTRAINT "SpotBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔐 A coin balance can never go negative (defense in depth: the engine already refuses a sell or
-- lock beyond the free balance)
ALTER TABLE "SpotBalance" ADD CONSTRAINT "SpotBalance_nonnegative"
  CHECK ("free" >= 0 AND "locked" >= 0 AND "avgCost" >= 0);
