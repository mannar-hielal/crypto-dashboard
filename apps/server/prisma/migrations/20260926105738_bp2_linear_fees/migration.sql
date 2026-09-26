-- BP-2 structure. Every statement is conditional (IF NOT EXISTS / guarded): the first production
-- run of this migration stopped part-way (the "Order" columns were added before "Position" was
-- found missing — see 20260926100000_repair_schema_drift), so it must be safe to run again.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'linear',
ADD COLUMN IF NOT EXISTS "feeAsset" TEXT,
ADD COLUMN IF NOT EXISTS "feeRate" DECIMAL(10,6),
ADD COLUMN IF NOT EXISTS "isMaker" BOOLEAN,
ADD COLUMN IF NOT EXISTS "reserved" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'linear',
ADD COLUMN IF NOT EXISTS "closeFeeReserve" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "entryFee" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "marginMode" TEXT NOT NULL DEFAULT 'isolated';

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'linear';

-- CreateTable
CREATE TABLE IF NOT EXISTS "SymbolSetting" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "marginMode" TEXT NOT NULL DEFAULT 'isolated',

    CONSTRAINT "SymbolSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SymbolSetting_accountId_symbol_key" ON "SymbolSetting"("accountId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_status_category_symbol_idx" ON "Order"("status", "category", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Position_category_symbol_idx" ON "Position"("category", "symbol");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SymbolSetting_accountId_fkey') THEN
    ALTER TABLE "SymbolSetting" ADD CONSTRAINT "SymbolSetting_accountId_fkey" FOREIGN KEY ("accountId")
      REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Backfill (BP-2) ────────────────────────────────────────────────────────────
-- Every existing position, order and trade is today's leveraged trading, which becomes USDT
-- Perpetual (D7) — the 'linear' column default above already says so.
--
-- Record what pre-BP-2 rows were actually charged at the flat 0.07% rate, so nothing is ever
-- recomputed at the new Bybit rates:
--   * an open position's entry fee was 0.07% of its margin;
--   * a pending order took margin + 0.07% of margin from the balance, which is what a cancel,
--     edit or fill must refund;
--   * a filled order was charged 0.07% (taker) in USDT.

-- A position's leverage was never stored: it is quantity × entry / margin (qty = margin × lev / price)
UPDATE "Position"
SET "entryFee" = "margin" * 0.0007,
    "leverage" = GREATEST(1, LEAST(10, ROUND("quantity" * "entryPrice" / NULLIF("margin", 0))))::INTEGER
WHERE "margin" > 0;

UPDATE "Order"
SET "reserved" = "margin" * 1.0007
WHERE "status" = 'PENDING';

UPDATE "Order"
SET "feeRate" = 0.0007,
    "feeAsset" = 'USDT',
    "isMaker" = false
WHERE "status" = 'FILLED';
