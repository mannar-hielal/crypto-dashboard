-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createType" TEXT;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "extraMargin" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "execType" TEXT NOT NULL DEFAULT 'Trade';

-- ─── One-way mode: one position per symbol (BP-3) ───────────────────────────────
-- Bybit's one-way mode keeps a single position per symbol; same-side fills average into it. Until
-- BP-3 each same-side fill opened its own row. Merge every group of same-side rows into the oldest
-- one, from stored values only (nothing is recomputed at today's rates):
--   * quantity, margin, entry fee, close-fee reserve and extra margin are summed;
--   * the entry price is the quantity-weighted average;
--   * leverage is the merged position's effective leverage (notional / margin), 1…10;
--   * the newest take-profit and the newest stop-loss win (a newer TP / SL replaces the
--     position's, as Bybit's Full-mode TP/SL does).
-- A journal line tells the user what happened.

CREATE TEMP TABLE "bp3_merge" AS
SELECT
  "userId",
  "symbol",
  "side",
  (array_agg("id" ORDER BY "openedAt", "id"))[1] AS "keepId",
  COUNT(*) AS "n",
  SUM("quantity") AS "qty",
  SUM("quantity" * "entryPrice") AS "notional",
  SUM("margin") AS "margin",
  SUM("entryFee") AS "entryFee",
  SUM("closeFeeReserve") AS "closeFeeReserve",
  SUM("extraMargin") AS "extraMargin",
  (array_agg("takeProfit" ORDER BY "openedAt" DESC, "id" DESC)
    FILTER (WHERE "takeProfit" IS NOT NULL))[1] AS "takeProfit",
  (array_agg("stopLoss" ORDER BY "openedAt" DESC, "id" DESC)
    FILTER (WHERE "stopLoss" IS NOT NULL))[1] AS "stopLoss"
FROM "Position"
GROUP BY "userId", "symbol", "side"
HAVING COUNT(*) > 1;

UPDATE "Position" p
SET
  "quantity" = m."qty",
  "entryPrice" = ROUND(m."notional" / m."qty", 8),
  "margin" = m."margin",
  "entryFee" = m."entryFee",
  "closeFeeReserve" = m."closeFeeReserve",
  "extraMargin" = m."extraMargin",
  "leverage" = CASE
    WHEN m."margin" > 0 THEN LEAST(10, GREATEST(1, ROUND(m."notional" / m."margin")))::INTEGER
    ELSE p."leverage"
  END,
  "takeProfit" = m."takeProfit",
  "stopLoss" = m."stopLoss",
  "updatedAt" = NOW()
FROM "bp3_merge" m
WHERE p."id" = m."keepId";

INSERT INTO "JournalEntry" ("id", "userId", "accountId", "time", "text", "isUserNote", "createdAt")
SELECT
  'j-merge-' || p."id",
  p."userId",
  p."accountId",
  NOW(),
  'Merged ' || m."n" || ' ' || p."side" || ' ' || p."symbol" ||
    ' positions into one (one-way mode, as on Bybit) @ avg $' || ROUND(m."notional" / m."qty", 2),
  false,
  NOW()
FROM "bp3_merge" m
JOIN "Position" p ON p."id" = m."keepId";

DELETE FROM "Position" p
USING "bp3_merge" m
WHERE p."userId" = m."userId"
  AND p."symbol" = m."symbol"
  AND p."side" = m."side"
  AND p."id" <> m."keepId";

-- One leverage per symbol, as on Bybit: a symbol with an open position uses the position's
-- leverage from now on (pre-BP-2 positions carry the account-wide leverage they were opened with).
INSERT INTO "SymbolSetting" ("id", "accountId", "symbol", "leverage", "marginMode")
SELECT DISTINCT ON (p."accountId", p."symbol")
  'ss-bp3-' || p."id",
  p."accountId",
  p."symbol",
  p."leverage",
  'isolated'
FROM "Position" p
ORDER BY p."accountId", p."symbol", p."openedAt", p."id"
ON CONFLICT ("accountId", "symbol") DO UPDATE SET "leverage" = EXCLUDED."leverage";

DROP TABLE "bp3_merge";
