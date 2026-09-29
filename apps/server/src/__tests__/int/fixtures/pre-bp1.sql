-- A database as the app left it before the server trading engine (BP-1), so before BP-2 too:
-- applied up to 20260627160554_add_subscriber_status_enum. migrationReplay.int.test.ts loads it,
-- then runs every later migration over it. Column lists are that era's schema only.
--
-- User rp-u1 — leveraged trading as the old client stored it (qty = margin × leverage / price):
--   three same-side BTC longs (BP-3 merges them), one ETH short, a pending BTC limit and a pending
--   ETH stop, one filled and one cancelled order, and a closed trade.
-- User rp-u2 — an account with no trading at all.

INSERT INTO "User" ("id", "email", "username", "password", "createdAt", "updatedAt", "emailVerifiedAt")
VALUES
  ('rp-u1', 'replay-1@example.test', 'replay_one', 'not-a-hash', '2026-06-20 08:00:00', '2026-06-20 08:00:00', '2026-06-20 08:05:00'),
  ('rp-u2', 'replay-2@example.test', 'replay_two', 'not-a-hash', '2026-06-21 08:00:00', '2026-06-21 08:00:00', NULL);

INSERT INTO "Account" ("id", "userId", "totalBalance", "availableBalance", "realizedPnl", "lastReset", "createdAt", "updatedAt")
VALUES
  ('rp-a1', 'rp-u1', 10025, 3670.555, 25, '2026-06-20 08:00:00', '2026-06-20 08:00:00', '2026-06-22 12:00:00'),
  ('rp-a2', 'rp-u2', 10000, 10000, 0, '2026-06-21 08:00:00', '2026-06-21 08:00:00', '2026-06-21 08:00:00');

-- Three BTC longs opened at 10×, 5× and 10×; only the first has a refId (the client's id)
INSERT INTO "Position" ("id", "refId", "userId", "accountId", "symbol", "side", "quantity", "entryPrice", "margin", "takeProfit", "stopLoss", "openedAt", "updatedAt")
VALUES
  ('rp-p1', 'client-pos-1', 'rp-u1', 'rp-a1', 'BTCUSDT', 'LONG', 0.2, 50000, 1000, 55000, NULL, '2026-06-22 09:00:00', '2026-06-22 09:00:00'),
  ('rp-p2', NULL, 'rp-u1', 'rp-a1', 'BTCUSDT', 'LONG', 0.1, 52000, 1040, 56000, 48000, '2026-06-22 10:00:00', '2026-06-22 10:00:00'),
  ('rp-p3', NULL, 'rp-u1', 'rp-a1', 'BTCUSDT', 'LONG', 0.1, 51000, 510, NULL, 47000, '2026-06-22 11:00:00', '2026-06-22 11:00:00'),
  ('rp-p4', NULL, 'rp-u1', 'rp-a1', 'ETHUSDT', 'SHORT', 2, 3000, 1200, NULL, NULL, '2026-06-22 11:30:00', '2026-06-22 11:30:00');

INSERT INTO "Order" ("id", "refId", "userId", "accountId", "symbol", "side", "orderType", "quantity", "limitPrice", "stopPrice", "margin", "commission", "filledQuantity", "averageFilledPrice", "status", "createdAt", "filledAt", "cancelledAt", "updatedAt")
VALUES
  -- PENDING: 0.3 BTC at 40,000 on 1,200 margin = 10×; 1 ETH stop at 2,800 on 1,400 margin = 2×
  ('rp-o1', 'client-ord-1', 'rp-u1', 'rp-a1', 'BTCUSDT', 'BUY', 'LIMIT', 0.3, 40000, NULL, 1200, 0, 0, NULL, 'PENDING', '2026-06-22 11:40:00', NULL, NULL, '2026-06-22 11:40:00'),
  ('rp-o2', NULL, 'rp-u1', 'rp-a1', 'ETHUSDT', 'SELL', 'STOP', 1, NULL, 2800, 1400, 0, 0, NULL, 'PENDING', '2026-06-22 11:45:00', NULL, NULL, '2026-06-22 11:45:00'),
  ('rp-o3', NULL, 'rp-u1', 'rp-a1', 'BTCUSDT', 'BUY', 'MARKET', 0.2, NULL, NULL, 1000, 0.7, 0.2, 50000, 'FILLED', '2026-06-22 09:00:00', '2026-06-22 09:00:00', NULL, '2026-06-22 09:00:00'),
  ('rp-o4', NULL, 'rp-u1', 'rp-a1', 'SOLUSDT', 'BUY', 'LIMIT', 10, 100, NULL, 100, 0, 0, NULL, 'CANCELLED', '2026-06-21 09:00:00', NULL, '2026-06-21 10:00:00', '2026-06-21 10:00:00');

-- A closed long: +25 USDT
INSERT INTO "Trade" ("id", "userId", "accountId", "orderId", "symbol", "side", "quantity", "executedPrice", "totalCost", "pnl", "pnlPercent", "commission", "entryPrice", "openedAt", "executedAt", "createdAt")
VALUES
  ('rp-t1', 'rp-u1', 'rp-a1', NULL, 'BTCUSDT', 'SELL', 0.05, 50500, 2525, 25, 5, 0.35, 50000, '2026-06-21 12:00:00', '2026-06-21 13:00:00', '2026-06-21 13:00:00');
