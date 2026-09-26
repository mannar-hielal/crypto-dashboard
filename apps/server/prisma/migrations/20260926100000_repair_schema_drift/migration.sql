-- Repair schema drift on production (found when the BP-2 release failed, 2026-09-26).
--
-- Production recorded 20260614103629_add_order_trade_fields as applied, but only part of it exists
-- there: the "Position" table, "Order"."refId" and "Trade"."entryPrice" / "openedAt" / "refId"
-- are missing (that migration file was edited after production had applied it, 8d40c8d). This
-- recreates exactly what it should have created, as of that migration.
--
-- Every statement is conditional: on a database that already has these objects (dev, a fresh
-- install) this migration changes nothing.

CREATE TABLE IF NOT EXISTS "Position" (
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

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refId" TEXT;

ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "entryPrice" DECIMAL(20,8),
ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "refId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Position_refId_key" ON "Position"("refId");
CREATE INDEX IF NOT EXISTS "Position_userId_idx" ON "Position"("userId");
CREATE INDEX IF NOT EXISTS "Position_accountId_idx" ON "Position"("accountId");
CREATE INDEX IF NOT EXISTS "Position_symbol_idx" ON "Position"("symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_refId_key" ON "Order"("refId");
CREATE UNIQUE INDEX IF NOT EXISTS "Trade_refId_key" ON "Trade"("refId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Position_userId_fkey') THEN
    ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Position_accountId_fkey') THEN
    ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId")
      REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
