-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "closeOnTrigger" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slTriggerBy" TEXT NOT NULL DEFAULT 'LastPrice',
ADD COLUMN     "tpTriggerBy" TEXT NOT NULL DEFAULT 'LastPrice',
ADD COLUMN     "triggerBy" TEXT NOT NULL DEFAULT 'LastPrice';

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "slTriggerBy" TEXT NOT NULL DEFAULT 'LastPrice',
ADD COLUMN     "tpTriggerBy" TEXT NOT NULL DEFAULT 'LastPrice';
