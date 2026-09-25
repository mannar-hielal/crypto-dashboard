---
name: signal-postmortem
description: Use after a paper trade closes on cryptopapertrade.com — categorizes outcome (TRUE_POSITIVE, FALSE_POSITIVE, MISSED_OPPORTUNITY, REGIME_MISMATCH), computes realized returns at 5-bar and 20-bar horizons, and feeds weight-adjustment + skill-improvement artifacts. Triggers: "review my closed trade", "postmortem BTC trade", "why did that trade fail", "outcome classification", "update signal weights". Reads paperStore.history[] + Bybit OHLCV via server REST. Mandatory 20-sample minimum before emitting weight suggestions.
---

# Signal Postmortem — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/signal-postmortem/SKILL.md`. Outcome categories and feedback integration preserved; FMP realized-return fetch replaced with the server's `/api/market/history` endpoint (Bybit OHLCV); ticker semantics swapped to crypto trading symbols (`BTCUSDT`); regime tags adapted for crypto market states.

## When to use

- The user closes a paper trade (`paperStore.history[]` gains an entry).
- The user asks "why did this trade work / fail".
- The user asks to update signal weights / adjust screener confidence.
- Periodically — the user requests a monthly or N-trade postmortem sweep.

## When NOT to use

- The user asks about a trade they're thinking of taking — use `pre-trade-discipline-gate`.
- The user is asking about app code hydration — use `paper-trading-logic`.
- The user wants a backtest of a strategy they haven't run live yet — use `backtest-expert`.

## App context — signal identification

`paperStore.history[]` carries `ClosedTrade` records:

```
id, symbol, side, qty, entryPrice, exitPrice, openedAt, closedAt,
pnl (net of commissions), closeType ('take-profit' | 'stop-loss' | 'manual'),
commission, ...
```

For postmortem:

- **Signal ID**: synthesize as `sig_<symbol>_<openedAt_epoch>_<first6ofId>`.
- **Predicted direction**: `side === 'buy' ? LONG : SHORT`.
- **Entry price**: `entryPrice`.
- **Exit price / date**: `exitPrice`, `closedAt`.
- **Source skill**: heuristic — if the user journaled an entry linking to `technical-analyst` or `position-sizer`, use that tag; otherwise default `manual`.
- **Holding period**: `closedAt - openedAt` (in bars for crypto, not days — use 1h or 1d bars based on the trade's interval).

## Realized returns — fetch via the server, not Bybit directly

For 5-bar and 20-bar horizons after `entryPrice`:

- `GET /api/market/history?symbol=<SYMBOL>&interval=1d&limit=100` → up to 1000 daily bars capped by `INTERVAL_FETCH_LIMIT['1d']` (server max 1000).
- Compute `realized_5d = (price[closedAt_idx+5] - entryPrice) / entryPrice` (long) or its inverse for short.
- If `closedAt_idx + 5 > array.length`, mark `5d: null` and skip n-day close.
- Crypto 24/7 — 5 bars = 5 UTC days (different from US equity's 5 trading days = 1 calendar week).

## Outcome categories (preserved from original)

| Category             | Long                                                                                                      | Short                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- | ---- |
| `TRUE_POSITIVE`      | predicted LONG, realized 5d > 0 AND 20d > 0                                                               | predicted SHORT, realized 5d < 0 AND 20d < 0 |
| `FALSE_POSITIVE`     | predicted LONG, realized 5d < 0 OR 20d < 0                                                                | predicted SHORT, realized 5d > 0 OR 20d > 0  |
| `MISSED_OPPORTUNITY` | trade not taken (cancelled or watching), realized 5d strongly in predicted direction (                    | return                                       | > 2× risk) | same |
| `REGIME_MISMATCH`    | direction correct but regime flipped mid-trade (e.g. BTC risk-on → risk-off causing the SL hit before TP) | same                                         |

## Crypto regime tags

Use these instead of generic equity RISK_ON/RISK_OFF:

| Tag               | Heuristic (use `technical-analyst` confirmation)                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BTC_RISK_ON`     | BTC daily MA20 > MA50 > MA200 (uptrend stack), 30d realized vol < 60%                                                                            |
| `BTC_RISK_OFF`    | BTC daily MA20 < MA50 or MA50 < MA200, 30d vol > 80%                                                                                             |
| `BTC_TRANSITION`  | MA20 crossing MA50 within last 5 bars                                                                                                            |
| `ALT_SEASON`      | BTC dominance dropping, ETH/BTC > 30d rising, ETH-30 vol < BTC-30 vol                                                                            |
| `LIQUIDITY_DRY`   | 24h volume on top-10 USDT pairs < 7d average / 2                                                                                                 |
| `FUNDING_EXTREME` | perp funding > 0.05% per 8h (long-side squeeze risk) or < −0.05% (short squeeze risk) — requires user-provided funding data; skip if unavailable |

Don't invent these — apply only if the user confirms a regime source. Otherwise mark `regime_at_signal: UNKNOWN`.

## Procedure

1. Take one closed trade from `paperStore.history[]` (or run on a list via `--signals-file`).
2. Synthesize signal metadata (id, direction, source_skill, entry, exit).
3. Fetch Bybit OHLCV via server REST for 5-bar and 20-bar returns.
4. Classify outcome using the categories above.
5. Tag regime at signal time and at exit time.
6. Append to a local postmortem journal — suggested path: `docs/postmortem/<SYMBOL>_<YYYY-MM-DD>.md` (or in-memory only during a session).
7. If 20+ samples on a given `source_skill`, generate weight-adjustment JSON.
8. If `false_positive_cluster` detected (3+ FPs in the same regime), generate skill-improvement backlog entry pointing at the relevant TA skill.

## Record schema (adapted)

```json
{
  "schema_version": "1.0",
  "postmortem_id": "pm_btcusdt_20260710_abc123",
  "signal_id": "sig_btcusdt_20260710_abc123",
  "symbol": "BTCUSDT",
  "signal_date": "2026-07-10",
  "exit_date": "2026-07-15",
  "source_skill": "technical-analyst | position-sizer | pre-trade-discipline-gate | manual",
  "predicted_direction": "LONG",
  "entry_price": 78000.0,
  "exit_price": 85000.0,
  "realized_returns": {
    "5d": 0.032,
    "20d": 0.058
  },
  "holding_bars": 5,
  "holding_bars_unit": "1d",
  "outcome_category": "TRUE_POSITIVE",
  "regime_at_signal": "BTC_RISK_ON",
  "regime_at_exit": "BTC_RISK_ON",
  "close_type": "take-profit",
  "net_pnl": 900.0,
  "commission_paid": 27.3,
  "outcome_notes": "Clean breakout, held through minor pullback",
  "recorded_at": "2026-07-17T10:30:00Z"
}
```

## Weight-feedback artifact (only when sample ≥ 20)

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO8601 UTC>",
  "analysis_period": { "from": "2026-06-01", "to": "2026-07-17" },
  "skill_adjustments": [
    {
      "skill": "technical-analyst",
      "current_weight": 1.0,
      "suggested_weight": 0.85,
      "reason": "15% false positive rate in BTC_TRANSITION regime",
      "sample_size": 42
    }
  ],
  "confidence": "MEDIUM",
  "min_sample_threshold": 20
}
```

## Skill-improvement backlog entry

```yaml
- skill: technical-analyst
  issue_type: false_positive_cluster
  severity: medium
  evidence:
    false_positive_rate: 0.15
    sample_size: 42
    regime_correlation: BTC_TRANSITION
  suggested_action: 'Add regime filter or downgrade confidence in BTC_TRANSITION — short base-duration > 6 weeks appears to false-break more often.'
  generated_by: signal-postmortem
  generated_at: '2026-07-17T10:35:00Z'
```

## Compose with other skills

- Reads `paperStore.history[]` (see **`paper-trading-logic`**).
- Uses `technical-analyst` for regime tagging confirmation when uncertain.
- Feeds weight suggestions to `trade-hypothesis-ideator` (informs which setups to research next).
- Feeds backlog entries to `backtest-expert` (creates targeted follow-up backtests).
- Original framework: <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/signal-postmortem/references/outcome-classification.md>.

## Output discipline

- Always cite `paperStore.history[]` entry id.
- Always state `holding_bars_unit` (1d, 1h, 4h — since crypto 24/7 doesn't have equity trading-day semantics).
- Refuse to suggest weight changes with sample size < 20.
- Don't auto-rewrite `technical-analyst`'s behavior — the backlog entry is a recommendation; user-permitting,edit the originating skill later.
