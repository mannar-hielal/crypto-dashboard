-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "refId" TEXT,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "margin" DECIMAL(20,8) NOT NULL,
    "takeProfit" DECIMAL(20,8),
    "stopLoss" DECIMAL(20,8),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commission" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "margin" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "refId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "stopLoss" DECIMAL(20,8),
ADD COLUMN     "stopPrice" DECIMAL(20,8),
ADD COLUMN     "takeProfit" DECIMAL(20,8);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "commission" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "entryPrice" DECIMAL(20,8),
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "refId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Position_refId_key" ON "Position"("refId");

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE INDEX "Position_accountId_idx" ON "Position"("accountId");

-- CreateIndex
CREATE INDEX "Position_symbol_idx" ON "Position"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Order_refId_key" ON "Order"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_refId_key" ON "Trade"("refId");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

