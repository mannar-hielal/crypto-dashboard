---
name: drawdown-circuit-breaker
description: Use when the user asks "should I be trading today", "am I in drawdown", "is my risk-of-ruin elevated", "circuit breaker check", "have I lost too much this week/month", or any account-level risk-gate question on cryptopapertrade.com. Reads paperStore.history[] and realizedPnl to decide TRADING_ALLOWED / COOLDOWN / HALTED. Fully offline — only reads app state, no external API. Uses UTC (crypto 24/7) not ET.
---

# Drawdown Circuit Breaker — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/drawdown-circuit-breaker/SKILL.md`. Default rule thresholds preserved (2% daily, 5% weekly, 8% monthly, N=2 losing streak → 24h cooldown); `America/New_York` weekday-release logic replaced with UTC because crypto trades 24/7; trader-memory-core thesis YAML replaced with `paperStore.history[]` closed-trade ledger.

## When to use

- The user asks "what's my risk-of-ruin" or "should I trade today".
- Asked before opening new risk — feeds **`pre-trade-discipline-gate`**.
- After a series of losing trades — confirms cooldown should activate.
- The user asks how the app's `realizedPnl` field relates to drawdown rules.

## When NOT to use

- Per-trade discipline (plan, stop, size) — use **`pre-trade-discipline-gate`**.
- Per-trade position sizing — use **`position-sizer`**.
- Post-trade review — use **`signal-postmortem`**.

## App context — what to read (cite the **`paper-trading-logic`** skill)

| Field                                      | Source                            | Purpose                                    |
| ------------------------------------------ | --------------------------------- | ------------------------------------------ |
| `paperStore.balance`                       | free cash                         | account_size (default; alt: user-supplied) |
| `paperStore.realizedPnl`                   | cumulative net P&L                | sanity check                               |
| `paperStore.history[]`                     | closed trades (MAX_HISTORY = 100) | realized P&L ledger, exit timestamps       |
| `HistoricalOrder.closingTime`              | order close timestamps            | recent loss timing                         |
| `BalanceEvent[]` (`paperStore.balanceLog`) | full balance ledger               | waterfall trace if needed                  |
| `useAuthStore.username`                    | owner of session                  | UTC day boundary anchored to UTC 00:00     |

`paperStore.history[]` entries carry `closedAt`, `entryPrice`, `exitPrice`, `pnl` (net), `side`. For UTC day/week/month bucketing, use `closedAt` as the timestamp key.

## Default rules (override-able via user input)

| Rule             | Default            | Description                                                         |
| ---------------- | ------------------ | ------------------------------------------------------------------- |
| Max daily loss   | 2% of account_size | realized P&L today ≤ −2% → COOLDOWN that UTC day                    |
| Losing streak    | N=2 losers         | 2 consecutive net-loss closes → 24h COOLDOWN from latest `closedAt` |
| Weekly drawdown  | 5% of account_size | realized P&L WTD ≤ −5% → HALTED for the rest of the UTC week        |
| Monthly drawdown | 8% of account_size | realized P&L MTD ≤ −8% → HALTED for the rest of the UTC month       |

Crypto intrinsics not in the original defaults — consider proposing (do not force):

- **Funding shock circuit**: 3 consecutive liquidation-equivalent moves (|pnl| > 10% of balance) inside 24h → COOLDOWN regardless of net P&L direction. Crypto funding-rate cascades are unforgiving.
- **Vol regime change**: if 7-day realized volatility on BTC (or symbol being traded) is > 2× its 30-day baseline, halve the default thresholds until vol normalizes. Verifies with a `technical-analyst` ATR read.
- **Halving-cycle caution**: pre-/post-halving ±30-day windows deserve tighter thresholds (50% of default) — historical behavior around halvings shows elevated false-breakout rates for pattern traders. Optional, user opt-in.

Always state default vs user-overridden values in the output.

## Time buckets (UTC, not ET)

- **Today**: UTC midnight to next UTC midnight. Today_PnL = sum of `history[*].pnl` where `closedAt` falls in the current UTC day.
- **This week**: Monday UTC 00:00 to next Monday UTC 00:00 (ISO weeks). WTD_PnL = sum in current UTC week.
- **This month**: 1st of UTC month, 00:00, to next month 1st. MTD_PnL = sum in current UTC month.

Crypto is 24/7 — no weekday-release logic, no ET session boundaries. A loss at 23:59 UTC Sunday counts towards Sunday's UTC day and the previous ISO week.

## Decision contract

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO8601 UTC>",
  "as_of_date": "<YYYY-MM-DD UTC>",
  "account_size": 10000.0,
  "recommendation": "TRADING_ALLOWED | COOLDOWN | HALTED",
  "triggered_rules": [
    {
      "rule": "losing_streak_cooldown",
      "threshold": 2,
      "observed": 2,
      "active_until": "<ISO8601 UTC>",
      "detail": "2 consecutive losing closes; last loss exit <ISO8601 UTC>."
    }
  ],
  "metrics": {
    "realized_pnl_today": 0.0,
    "realized_pnl_wtd": -250.0,
    "realized_pnl_mtd": -250.0,
    "consecutive_losses": 2,
    "last_loss_exit_at": "<ISO8601 UTC>",
    "trades_scanned": 12
  },
  "config": {
    "max_daily_loss_pct": 2.0,
    "losing_streak_n": 2,
    "cooldown_hours": 24.0,
    "weekly_drawdown_pct": 5.0,
    "monthly_drawdown_pct": 8.0
  },
  "data_quality": "OK | EMPTY_STATE | STALE",
  "warnings": [],
  "rationale": "<one paragraph>"
}
```

## Edge states

- **EMPTY_STATE**: `paperStore.history[]` length 0 → `TRADING_ALLOWED` with `data_quality: EMPTY_STATE` (universal — empty account shouldn't self-block).
- **STALE**: latest `closedAt` older than 7 days → `TRADING_ALLOWED` with `data_quality: STALE` and warning that re-engagement should be incremental. Don't HALT on stale data — the user may simply not have traded recently.
- **Small sample**: `history[]` length < 10 → degrade HALTED → COOLDOWN; degrade COOLDOWN → REVIEW (warn user). Don't impose full drawdown rules on insufficient samples.
- **Account reset**: `paperStore.reset()` clears history; treat as empty state immediately after.

## Procedure

1. Confirm `account_size` — default `paperStore.balance`, but allow user override for "if I deposit more" scenario testing.
2. Read `paperStore.history[]` (in client memory or via the SDK type `ClosedTrade`).
3. Bucket every closed trade by UTC day/week/month using `closedAt`.
4. Compute `realized_pnl_today`, `_wtd`, `_mtd` as sum of `pnl`.
5. Walk chronological `history[]` from oldest to newest to count `consecutive_losses` (reset to 0 on a non-losing trade or when sequence is interrupted by more than 24h of no activity).
6. Apply rules in order: daily loss → losing-streak → weekly → monthly. First triggered HARD-gate wins (COOLDOWN for daily/streak, HALTED for weekly/monthly).
7. Emit the decision artifact and tell the user the next course of action.

## Compose with other skills

- Feeds **`pre-trade-discipline-gate`** as the upstream circuit-breaker decision ("circuit_breaker_decision" reference).
- Reads `paperStore` per **`paper-trading-logic`** — never re-derive balance inflight.
- Optional upstream: **`technical-analyst`** for vol regime change.
- Original framework at <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/drawdown-circuit-breaker/references/circuit_breaker_framework.md>.

## Output discipline

- Always cite `paperStore.history[].closedAt` for any realized P&L claim.
- Use UTC everywhere — mention explicitly that this differs from the original ET-based skill.
- If user asks for ET or local timezone, re-bucket on demand; default remains UTC.
- Do not auto-clear `cooldown` — let it expire by `active_until` timestamp.
- The app does NOT have a circuit-breaker built in — this skill is advisory on top of `paperStore`. If the user wants enforcement, propose a `paperStore` action (with explicit approval) that reads the latest circuit-breaker artifact before allowing `placeOrder`.
