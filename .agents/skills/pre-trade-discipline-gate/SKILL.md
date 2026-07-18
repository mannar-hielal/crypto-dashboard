---
name: pre-trade-discipline-gate
description: Use BEFORE the user submits an order in TradingPanel — runs a discipline checklist so planless, oversized, revenge-risk, regime-blocked, or circuit-breaker-blocked entries are flagged. Triggers: "should I take this trade", "am I being disciplined", "checklist before submit", "gating this entry", "is my plan in the journal". Bound to cryptopapertrade paperStore journal and the drawdown-circuit-breaker skill. Never auto-blocks app behavior; advisory only.
---

# Pre-Trade Discipline Gate — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/pre-trade-discipline-gate/SKILL.md`. The decision contract (`GO` / `REVIEW_REQUIRED` / `NO_GO` / `NO_ACTIONABLE_ORDERS`) preserved. trader-memory-core thesis YAML replaced with the cryptopapertrade `paperStore.journal[]` + `useAuthStore` user history.

## When to use

- The user asks "should I take this BTC trade" before clicking Buy in `TradingPanel`.
- The user mentions a setup they're considering and wants a sanity check.
- The user has had losing trades recently and asks "am I revenge trading".
- The user pastes a chart + says "I want to long here" — `technical-analyst` then this skill.

## When NOT to use

- The user is asking about a _closed_ trade — use `signal-postmortem`.
- The user is asking about account-level risk gating — use `drawdown-circuit-breaker`.
- The user is editing app code — use `paper-trading-logic` or relevant coding skills.

## Inputs (gather from the user or the app)

Local "candidate" object per order:

```json
{
  "symbol": "BTCUSDT",
  "side": "buy|sell",
  "order_type": "market|limit|stop",
  "entry_price": 78000.0,
  "stop_price": 76000.0,
  "take_profit": 85000.0,
  "usdt_amount": 1000.0,
  "coin_units": 0.01282,
  "leverage": 1,
  "plan_in_journal": false,
  "thesis_text": "Breakout from base, weekly trend up",
  "session_id": "optional"
}
```

Optional upstream artifacts (read as JSON if present):

- **`drawdown-circuit-breaker`** decision JSON (`recommendation: TRADING_ALLOWED | COOLDOWN | HALTED`)
- **`technical-analyst`** most recent `<SYMBOL>_technical_analysis_<YYYY-MM-DD>.md` scenario probabilities
- **`paper-trading-logic`** skill's state map for current `paperStore.balance`, open positions, recent `history[]`, `journal[]`

## Decision contract

| Outcome                | Trigger                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GO`                   | All checklist items pass; regime neutral-to-favorable; no circuit-breaker halt; size within risk budget.                                                                |
| `REVIEW_REQUIRED`      | Missing market-regime or circuit-breaker artifact on an actionable order; ambiguous journal note; sample size on the related setup < 20.                                |
| `NO_GO`                | One of: plan not in journal, stop undefined, size > planned risk, revenge-window active, regime explicit REDUCE_ONLY/CASH_PRIORITY, circuit breaker COOLDOWN or HALTED. |
| `NO_ACTIONABLE_ORDERS` | The candidate's `order_intent` is not actionable (e.g. "watchlist only" or "idea").                                                                                     |

## Rule blocks

1. **Plan-in-journal**: `plan_in_journal` must be `true`. If `false`, → `NO_GO` with reason `entry_not_in_written_plan`. Cross-check: search `paperStore.journal[]` for an `isUserNote: true` note timestamped within the last 24h mentioning `symbol` + the trade direction. If `paperStore` doesn't expose this, prompt the user to journal first.

2. **Stop-predefined**: `stop_price` must be present and numeric. If undefined → `NO_GO` with reason `stop_undefined`.

3. **TP/SL direction (mirror `paperStore.checkTPSL`)**:
   - Long: TP > entry, SL < entry.
   - Short: TP < entry, SL > entry.
   - Violation → `NO_GO` with `tpsl_direction_invalid`. (Same rules enforced server-side by `useTPSLMonitor` — verify the user's inputs match this convention.)

4. **Size-within-plan**: `actual_risk_dollars = coin_units * |entry - stop|`. Must be ≤ `planned_risk_dollars`. If `actual_risk_dollars > planned_risk_dollars * 1.05` (5% slippage tolerance) → `NO_GO` with `size_outside_plan`.

5. **Revenge-window**: scan last 3 entries in `paperStore.history[]`. If 2+ consecutive losing trades AND the latest close was within 60 minutes AND the candidate symbol matches the latest losing symbol AND the candidate side is opposite to the latest losing side → flag `REVIEW_REQUIRED` with reason `revenge_window`. If 3+ consecutive losers regardless of symbol/side → `NO_GO`.

6. **Sanity warnings** (from `TradingPanel.tsx` blocking modal logic — same thresholds):
   - SL deviating > 80% from live `latestPrice` → `REVIEW_REQUIRED` with `sl_far_warning`.
   - SL distance > 10% from entry → `REVIEW_REQUIRED` with `large_distance_warning`.
   - These don't `NO_GO`; they force an explicit confirmation (the app already shows a blocking modal — confirm journal logged).

7. **Market-regime gate** (if circuit-breaker artifact present):
   - `REDUCE_ONLY` → allowed only if candidate reduces an existing position; otherwise `NO_GO`.
   - `CASH_PRIORITY` → `REVIEW_REQUIRED` (caution but not block).
   - `TRADING_ALLOWED` → pass.

8. **Circuit-breaker gate** (from `drawdown-circuit-breaker` skill):
   - `TRADING_ALLOWED` → pass.
   - `COOLDOWN` → `NO_GO` with `circuit_breaker_cooldown`.
   - `HALTED` → `NO_GO` with `circuit_breaker_halted`.

9. **Leverage cap**: `leverage > 10` → `NO_GO` with `leverage_above_cap`. The app already enforces this in Account Settings; defense-in-depth here.

## Procedure

1. Collect or prompt for the candidate object.
2. Read `paperStore` state per the **`paper-trading-logic`** skill (balance, history, journal, leverage).
3. If the `drawdown-circuit-breaker` skill hasn't been run today, suggest running it first; if the user says skip, mark `market-regime-artifact: MISSING` and proceed with `REVIEW_REQUIRED` if other items fail.
4. Apply rule blocks 1–9 in order; first critical-failure short-circuits to `NO_GO`.
5. Build the decision artifact:

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO8601 UTC>",
  "candidate_symbol": "BTCUSDT",
  "decision": "GO | REVIEW_REQUIRED | NO_GO | NO_ACTIONABLE_ORDERS",
  "checklist": [
    { "rule": "plan_in_journal", "passed": true, "evidence": "Journal entry id=...@..." },
    { "rule": "stop_predefined", "passed": true },
    { "rule": "tpsl_direction", "passed": true },
    {
      "rule": "size_within_plan",
      "passed": true,
      "actual_risk_dollars": 100.0,
      "planned_risk_dollars": 100.0
    },
    { "rule": "revenge_window", "passed": true, "recent_losses": 0 },
    { "rule": "sl_sanity", "passed": true, "sl_deviation_pct": 0.05 },
    { "rule": "leverage_cap", "passed": true, "leverage": 1 }
  ],
  "market_regime": "TRADING_ALLOWED",
  "circuit_breaker": "TRADING_ALLOWED",
  "warnings": [],
  "rationale": "All checklist items passed; trade size within 1% risk rule; no recent revenge pattern.",
  "linked_thesis_journal_id": "optional"
}
```

6. If `GO`, summarize the rationale to the user and confirm before they submit. If `REVIEW_REQUIRED`, list the open items clearly and ask the user to resolve each before retrying. If `NO_GO`, state the blocking reason; do not suggest workarounds.

## Compose with other skills

- **`technical-analyst`** — produces entry/stop, this skill validates the plan to use them.
- **`position-sizer`** — produces the `usdt_amount` and `coin_units`, this skill confirms they fit the risk budget.
- **`drawdown-circuit-breaker`** — produces the upstream circuit-breaker decision.
- **`paper-trading-logic`** — cites app-side state and rules; do not duplicate the app's logic — reference it.

## Output discipline

- Always cite `paperStore` field names verbatim (`balance`, `history`, `journal`, `leverage`).
- Never auto-place the order or call `placeOrder` — advisory only.
- The blocking confirm modals in `TradingPanel.tsx` (SL deviation, large distance) are app-side enforcement; this skill is a pre-submit human-in-the-loop review.
- If `paperStore` does not contain enough journal context to verify `plan_in_journal`, ASK the user rather than guessing — never default to "passed".
