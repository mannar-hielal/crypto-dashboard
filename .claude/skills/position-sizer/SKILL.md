---
name: position-sizer
description: Use when the user asks "how many coins/units should I buy", "what's my position size", "risk per trade", "Kelly criterion", "ATR-based sizing", "fractional sizing", or any Bybit crypto position sizing question on cryptopapertrade.com. Converts entry/stop into USDT-denominated coin-unit count using risk rules, ATR scaling, or Kelly. Tailored to the paper trading app's 10× leverage cap and Bybit VIP-0 fees (USDT Perpetual 0.055% taker / 0.02% maker, Spot 0.1%).
---

# Position Sizer — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/position-sizer/SKILL.md`. Math preserved; "shares" semantics swapped to crypto coin units, US-equity FINRA/PDT/short-borrow noise stripped, the app's 10× leverage cap and Bybit fee rates wired in (flat 0.0007 until BP-2).

## When to use

- After the **`technical-analyst`** skill produces an entry and stop.
- Before the user submits an order in `TradingPanel` — confirms the USDT amount and the resulting coin-unit quantity align with their risk rule.
- When the user asks to compare sizing scenarios (0.5% / 1.0% / 1.5% risk, ATR 1.5× / 2.0× / 3.0×).

## App context (cite these, do not recompute)

| Constraint    | Source                                                                         | Value                                         |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Account size  | `paperStore.balance`                                                           | free cash                                     |
| Leverage cap  | `paperStore.leverage` (max 10× via Account Settings modal)                     | see **`paper-trading-logic`** skill           |
| Fees          | `FEE_RATES` exported from `@crypto-dashboard/sdk` (BP-2)                       | perp 0.00055 taker / 0.0002 maker; spot 0.001 |
| Balance check | perp: IM + open fee + est. close fee (taker, on notional) must fit the balance | (`lib/orderMath.ts` `orderPreview`)           |
| Trade value   | `usdtAmount * leverage`                                                        | notional exposure                             |
| Persist path  | `cd-paper-trading` key, `paperStore.history[]` (MAX_HISTORY = 100)             | cap not breached here                         |

## Methods (math is asset-agnostic)

### 1. Fixed Fractional

```
risk_dollars    = account_size * risk_pct            (typical 0.5–2%, default 1%)
risk_per_unit   = |entry_price - stop_price|         (per coin)
coin_units      = floor(risk_dollars / risk_per_unit)
usdt_amount     = coin_units * entry_price
final_risk      = coin_units * risk_per_unit         (slightly less than risk_dollars due to floor)
commission     = qty * price * 0.00055 (open, taker) + qty * price * 0.00055 (est. close)
total_cost      = usdt_amount + commission           (deducted from balance at open)
```

`coin_units` may be fractional in crypto (e.g. 0.00251 BTC) — keep more precision than equities. Round to the Bybit minimum lot size only if displaying confirmation, not during the math.

### 2. ATR-based

```
atr             = Average True Range over N periods (typically 14)
atr_units       = atr_multiplier * atr               (typical 1.5–3.0; crypto often wants wider, 2.5–3.5×)
stop_distance   = atr_units
risk_per_unit   = atr_units                          (stop at entry - atr_units for long, entry + atr_units for short)
coin_units      = risk_dollars / stop_distance       (same fixed_fractional endgame)
```

ATR must be computed from real OHLCV — use the same server REST endpoint as `technical-analyst` (`GET /api/market/history?interval=1d&limit=50`). Don't trust stale `paneStore.bars` for sizing (the user may not be on the right pane).

### 3. Kelly Criterion

```
win_rate        = wins / total_trades                (read from paperStore history; need min 30 trades)
win_loss_ratio  = avg_win / avg_loss                 (gross or net-of-commission — be explicit)
kelly_pct       = win_rate - (1 - win_rate) / win_loss_ratio
fractional_kelly = kelly_pct * 0.5                   (half-Kelly is the responsible default)
coin_units      = (account_size * fractional_kelly) / entry_price
```

Kelly is volatile and over-optimistic on small samples. Below 30 closed trades in `paperStore.history[]`, refuse to emit a Kelly sizing — note "insufficient sample, Kelly undefined". Below 100 trades, cap exposure at half-Kelly.

## Apply portfolio constraints (strictest wins)

- **Max position % of balance**: conservative default 25% of free balance per single position. User-overridable.
- **Max per-symbol exposure**: 40% of balance across all open positions in the same symbol (sum across panes/symbols).
- **Max long+short net exposure**: 100% of balance if no leverage; min(2×, leverage) with leverage applied.
- **Commission budget**: total commissions on planned open must not exceed 1% of `paperStore.balance`.

## Scenarios output

Always present a comparison table — not a single answer:

| Risk % | ATR mult | Coin units | USDT order | Commission | Final risk ($) | Final risk (%) | Margin % of balance |
| ------ | -------- | ---------- | ---------- | ---------- | -------------- | -------------- | ------------------- |
| 0.5%   | 2.0×     | 0.0123     | 957.0      | 0.67       | 50.0           | 0.50%          | 9.5%                |
| 1.0%   | 2.0×     | 0.0246     | 1914.0     | 1.34       | 100.0          | 1.00%          | 19.0%               |
| 1.5%   | 2.5×     | 0.0185     | 1439.7     | 1.01       | 150.0          | 1.50%          | 14.3%               |

`Margin % of balance` = `usdt_amount * leverage / balance` — surfaced because the `TradingPanel` order info block displays this with a red bar when margin > balance.

## JSON output (when scripting needed)

```json
{
  "schema_version": "1.0",
  "mode": "coin_units",
  "symbol": "BTCUSDT",
  "parameters": {
    "entry_price": 78000.0,
    "account_size": 10000.0,
    "stop_price": 76000.0,
    "risk_pct": 1.0,
    "leverage": 1,
    "commission_rate": 0.00055
  },
  "calculations": {
    "fixed_fractional": {
      "method": "fixed_fractional",
      "coin_units": 0.5,
      "risk_per_unit": 2000.0,
      "dollar_risk": 1000.0,
      "usdt_amount": 39000.0,
      "commission": 27.3,
      "total_cost": 39027.3
    },
    "atr_based": null,
    "kelly": null
  },
  "constraints_applied": ["max_per_symbol_40_pct"],
  "final_recommended_units": 0.5,
  "final_position_value": 39000.0,
  "final_risk_dollars": 1000.0,
  "final_risk_pct": 1.0,
  "binding_constraint": "none"
}
```

If `final_position_value > balance` even with leverage, the `TradingPanel` submit will reject (`usdtAmount + fee > balance`). Pre-validate and surface the rejection before the user clicks.

## Compose with other skills

- Reads `paperStore.balance`, `paperStore.leverage`, `paperStore.history[]` (via the **`paper-trading-logic`** skill's state map)
- Output feeds into **`pre-trade-discipline-gate`** to confirm the plan is journaled and not revenge-driven
- Reference reading: original at <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/position-sizer/references/sizing_methodologies.md>

## Output discipline

- Never present one number — always the scenario table.
- Cite the app constants used (`FEE_RATES` from the SDK, the symbol's leverage via `leverageFor`).
- Reject Kelly if sample size below 30 with an explicit message.
- Note "leverage > 5× not recommended — paper learning-app cap is 10×" when the user requests aggressive size.
