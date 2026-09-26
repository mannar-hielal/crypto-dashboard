---
name: backtest-expert
description: Use when developing, testing, stress-testing, or validating a quantitative crypto trading strategy on cryptopapertrade.com. Triggers: "backtest this strategy", "is this strategy robust", "how do I avoid overfitting", "validate my entry/exit rules", "what should I deploy/refine/abandon", "is my crypto bot ready for live", "Phase 6 AI bot testing". Covers beat-the-idea-to-death methodology, parameter robustness, slippage modeling, bias prevention, walk-forward OOS. Bybit OHLCV-aware: 24/7 calendar, perp funding friction, liquidation cascades.
---

# Backtest Expert — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/backtest-expert/SKILL.md`. The "beat ideas to death" methodology transplants cleanly to crypto. The CLI is asset-neutral; **only the calendar bias shifts** — equity markets have weekend gaps, crypto trades 24/7 with no gaps, so look-ahead and survivorship biases express differently.

> Project context: Phase 6 of APP_LOG.md plans an AI trading bot (paper mode first); this skill is the methodology backbone for proving an edge before any wiring. Phase 5 (Bybit live) is gated on Phase 6 proving an edge in paper over ≥20 trades with positive expectancy.

## When to use

- The user proposes a strategy and asks "is this any good".
- The user has run a small paper test (10–20 trades on cryptopapertrade.com) and asks if it's generalizable.
- The user is about to wire an AI bot (Phase 6) and wants a backtest plan first.
- The user wants to escape a local optimum in parameter tuning.

## When NOT to use

- The user asks about app-side code (use `paper-trading-logic` or the relevant code skill).
- The user wants signal screening (use `technical-analyst` or a screener skill).
- The user wants risk-of-ruin analysis on the live account (use `drawdown-circuit-breaker`).

## The 8-step methodology (verbatim essence from the original)

1. **State the hypothesis in one sentence**. If you cannot, the strategy is too vague to backtest. No "let's see what works" tourism.
2. **Codify entry/exit/sizing/filter/universe rules with zero discretion**. A discretionary rule cannot be backtested. If a rule says "draw a trendline by eye," it fails here — require a programmatic definition (e.g. "252-bar linear regression slope").
3. **Initial backtest**: 5+ years (10+ preferred), multiple regimes (bull/bear/range/mix), realistic costs. Crypto specifics:
   - Bybit OHLCV via `/api/market/history?symbol=BTCUSDT&interval=1d&limit=1000` (1000-bar server max — for longer, walk back with `endTime` pagination).
   - Account for Bybit's taker fee per side — USDT Perpetual 0.055%, Spot 0.1% (`FEE_RATES` from `@crypto-dashboard/sdk`).
   - Perp funding every 8h (3×/day) — if holding > 8h, model funding as a friction cost. Use Bybit's historical funding API if accessible; otherwise estimate 0.01%/8h as a baseline (long side pays in bull, receives in bear).
   - Slippage: model 1 tick on entry + 1 tick on exit minimum. For thicker book pairs (BTCUSDT) ~0.01% slippage; thinner pairs (DOGEUSDT) up to 0.1%.
4. **Stress test parameters**: stop loss ±50–150% (crypto often wants ±75% due to vol), profit target ±50–150%, entry/exit timing ±15–30min, slippage 1.5–2× base, worst-case fills, partial fills/rejections. **Seek plateaus, not peaks.** A parameter plateau = robustness; a peak = overfit.
5. **Time robustness**: year-by-year performance. Require positive expectancy in the majority of years (75%+ for crypto due to regime variety). Test per regime year (BTC_RISK_ON, BTC_RISK_OFF, BTC_TRANSITION — see `signal-postmortem`).
6. **Sample size**: 30 trades minimum, 100+ preferred, 200+ for high confidence. Crypto carries implications: BTC's 2020–2025 history yields maybe 250 daily-bar trades on a daily-bar strategy. For intrabar strategies, the sample is plentiful — but avoid intrabar backtests until daily-bar version passes.
7. **Walk-forward out-of-sample**: optimize Year 1–3 in-sample, validate Year 4 OOS, roll forward. Flag if OOS expectancy < 50% of in-sample expectancy — that's classic overfit signature.
8. **Verdict**: Run the evaluation through 5 dimensions. Output `Deploy / Refine / Abandon`.

## 5-dimension evaluation

| Dimension         | Weight | What it measures                                                  |
| ----------------- | ------ | ----------------------------------------------------------------- |
| Sample Size       | 15     | 30+ trades minimum, 100+ preferred                                |
| Expectancy        | 25     | (win_rate × avg_win) − (loss_rate × avg_loss) net of commissions  |
| Risk Management   | 20     | Max drawdown ≤ 25%, risk-of-ruin < 1%, ↗ Sharpe ≥ 0.8             |
| Robustness        | 25     | Parameter plateau width, regime split passes, OOS ratio ≥ 50%     |
| Execution Realism | 15     | Slippage tested, funding modeled, realistic fills, fees both legs |

Weighted score 0–100.

## Verdict mapping

| Score | Verdict     | Action                                                                                                                       |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ≥ 80  | **Deploy**  | Start in paper trading on cryptopapertrade with the strategy config; goal 20+ live trades to compare against backtest sample |
| 60–79 | **Refine**  | Target the weakest dimension; iterate; do not paper-trade yet                                                                |
| < 60  | **Abandon** | Strategy has no robust edge; Pivot or move on                                                                                |

## Recipe: small-sample cryptopapertrade strategy test

1. The user proposes an entry rule (e.g., "buy BTC when daily closes above MA20 after touching MA50").
2. Codify: "entry = daily close > MA20 AND day's low ≤ MA50; exit = close < MA20; sizing = 1% risk per trade; stop = MA50 ± 1 ATR(14)."
3. Run initial backtest on 5y+ BTC Bybit daily bars.
4. Stress: vary MA20 → 18/22, MA50 → 45/55, stop ATR → 1.0/2.0/3.0×.
5. Per-year breakdown.
6. Walk-forward: opt 2020–2023, validate 2024.
7. Score.
8. If ≥ 80, propose paper-trade config to cryptopapertrade (`TradingPanel` with the strategy's entry/stop/TP, sized per `position-sizer`).
9. Goal: 20+ paper trades on cryptopapertrade → run `signal-postmortem` → confirm OOS expectancy tracks backtest expectancy ±30%.

## Crypto-specific gotchas the original doesn't cover

- **24/7 calendar**: no weekend gaps, no NYSE holidays. Year-by-year analysis is straightforward but yearly trade counts skew (a daily-bar strategy on BTC has 365 bars/yr vs equities' 252).
- **Funding rate friction**: long positions pay funding in dominant bull regimes. Model as: `funding_cost = position_notional * funding_rate * (holding_hours / 8)`.
- **Liquidation cascades**: stops near round numbers can be wicked; consider stops on close-only (test both).
- **Perp / spot / inverse pairs differ** — calibrate the backtest to the same instrument the user will trade on cryptopapertrade.
- **Backtest bleed**: cryptopapertrade's `paperStore.MAX_BARS = 1000` caps how much live data a strategy can observe locally. For long history, use the server REST + pagination pattern.
- **Bybit symbol-specific limits**: `ALLOWED_SYMBOLS` in `apps/server/src/constants.ts` constrains the backtest universe to the 9 supported symbols (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK vs USDT). Backtests outside this list need server-side extension first.

## CLI invocation (if running the original script)

Original at <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/backtest-expert/scripts/evaluate_backtest.py>. Same signature:

```bash
python3 evaluate_backtest.py \
  --total-trades 150 \
  --win-rate 62 \
  --avg-win-pct 1.8 \
  --avg-loss-pct 1.2 \
  --max-drawdown-pct 15 \
  --years-tested 8 \
  --num-parameters 3 \
  --slippage-tested \
  --output-dir reports/
```

If you want a crypto-native evaluator with funding and 24/7 calendar in scope, propose a project-local script under `apps/server/src/scripts/evaluate_backtest.ts` — do not write it without the user's explicit approval.

## Compose with other skills

- **`technical-analyst`** — generates the entry/stop concept; backtest proves it.
- **`position-sizer`** — sized per-trade risk into the strategy.
- **`signal-postmortem`** — backtest's predicted expectancy vs live paper-trade observed expectancy.
- **`trade-hypothesis-ideator`** — generates the hypothesis; backtest validates.

## Output discipline

- Always state sample size, date range tested, slippage assumption, funding-rate assumption, commission assumption (`FEE_RATES`: perp taker 0.00055 / maker 0.0002, spot 0.001).
- Never claim a backtest edge on fewer than 30 trades.
- OOS / IS expectancy ratio must be quoted next to any "Deploy" recommendation.
- State the worst regime year and why — survivors of any dimension are still susceptible.
- Original failure-pattern reference: <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/backtest-expert/references/failed_tests.md>.
