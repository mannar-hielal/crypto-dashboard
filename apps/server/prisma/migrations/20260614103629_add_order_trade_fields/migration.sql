-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commission" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "margin" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "stopLoss" DECIMAL(20,8),
ADD COLUMN     "stopPrice" DECIMAL(20,8),
ADD COLUMN     "takeProfit" DECIMAL(20,8);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "commission" DECIMAL(20,8) NOT NULL DEFAULT 0;
