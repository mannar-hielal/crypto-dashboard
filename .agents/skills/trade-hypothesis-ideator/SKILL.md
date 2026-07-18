---
name: trade-hypothesis-ideator
description: Use when the user wants to generate falsifiable trading-strategy hypotheses from their paper-trade logs, journal snippets, chart observations, or screener outputs on cryptopapertrade.com. Triggers: "hypothesis idea", "what edge should I test", "generate strategy suggestions", "rank these trade ideas", "what should my AI bot try", "Phase 6 strategy research". Produces 1-5 ranked hypothesis cards with experiment design + kill criteria. Pure calc — no Bybit API calls; ir only consumes normalized input bundles.
---

# Trade Hypothesis Ideator — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/trade-hypothesis-ideator/SKILL.md`. The pipeline is fully asset-neutral — input normalization, LLM-cloud hypothesis generation, critique pass, ranking, optional strategy.yaml export. Only the _example_ input bundle needs crypto examples, and the optional `strategy.yaml` schema must match whatever downstream edge-finder the cryptopapertrade Phase 6 AI bot will consume.

## When to use

- The user has 50+ trades on cryptopapertrade and asks "what's working / what's not".
- The user has journal notes describing an observed pattern and asks if it's a real edge.
- The user wants ranked trade-strategy ideas to feed into the Phase 6 AI bot.
- The user pastes several chart screenshots and wants to extract candidate edges into a research list.

## When NOT to use

- The user wants a one-off trade analysis → `technical-analyst`.
- The user wants to validate an existing strategy → `backtest-expert`.
- The user wants post-trade review → `signal-postmortem`.
- The user wants app code → `paper-trading-logic` or relevant code skill.

## Input bundle shape (adapted for crypto)

```json
{
  "trade_log": [
    {
      "symbol": "BTCUSDT",
      "side": "buy",
      "opened_at": "2026-06-10T08:00:00Z",
      "closed_at": "2026-06-15T14:00:00Z",
      "entry_price": 78000.0,
      "exit_price": 85000.0,
      "pnl": 900.0,
      "close_type": "take-profit",
      "notes": "Breakout from 6-week base; volume > 2× avg"
    }
  ],
  "journal_snippets": [
    "BTC consolidation > 4 weeks with declining vol seems to break out cleanly > 70% of the time",
    "ETH follows BTC by 2-4 hours on regime shifts",
    "DOGE pumps after Elon tweets — but the window is < 5 minutes"
  ],
  "market_data_observations": [
    "BTC funding > 0.05%/8h preceded 3 of last 5 liquidations",
    "SOL/BTC ratio made higher low on 2026-06-20"
  ],
  "regime_tags": ["BTC_RISK_ON", "BTC_TRANSITION"]
}
```

All four input fields are optional but at least one must be non-empty. The richer the bundle, the higher the hypothesis quality ceiling.

## Pipeline (preserved)

1. **Pass 1 — normalization + evidence extraction**: parse the input, dedupe trade entries, attach regime tags from `signal-postmortem` if available, extract evidence summary (e.g. "observed 12 breakouts from 6-week bases; 9 reached 1R within 5 bars").
2. **Generate hypotheses**: produce 3–5 hypothesis cards using the evidence summary. Each card has:
   - `hypothesis_id` — `h_<topic>_<YYYYMMDDHHMM>_<rand>`
   - `summary` — one sentence
   - `hypothesis_type` — `mean_reversion | momentum | event_driven | breakout | regime_switch | cross_asset | funding_arb | funding_squeeze`
   - `predicted_edge` — `+ returns over what horizon`
   - `evidence_summary` — observed evidence + count
   - `evidence_quality` — `strong | moderate | weak` (per evidence-quality guide)
   - `experiment_design` — entry/exit/sizing rules codified for `backtest-expert`
   - `kill_criteria` — concrete metrics that disprove the hypothesis (e.g., "expectancy < 0 after 30 trades", "Sharpe < 0.5", "max DD > 30%")
3. **Critique pass**: each card is critiqued for:
   - Sample size adequacy
   - Look-ahead/survivorship risk
   - Selection bias (chosen because it worked or because it's observable?)
   - Funding/slippage realism for crypto
4. **Pass 2 — ranking + guardrails**:
   - Rank by evidence quality × potential edge × testability × diversity (avoid 3 near-duplicate momentum hypotheses).
   - Tag each card with `pursue | revise | discard`.
   - Cap at 3 `pursue` cards.
5. **Optional export**: `strategy_<hypothesis_id>.yaml` + `metadata_<hypothesis_id>.json` — schema-compatible with a downstream edge-finder. For cryptopapertrade Phase 6, this YAML becomes the AI bot's first strategy template.

## Hypothesis types — crypto flavored

| Type              | Examples                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `momentum`        | "BTC breaks above 50d MA after touching 200d → +5% over 5 days"                                                                                  |
| `mean_reversion`  | "Funding > 0.10%/8h for 3+ cycles → long squeeze within 24h"                                                                                     |
| `breakout`        | "6-week base consolidation + volume dry-up → breakout within 5 bars"                                                                             |
| `event_driven`    | "Elon tweets DOGE → 5-min window for +2% burst (high execution cost)"                                                                            |
| `regime_switch`   | "ETH/BTC ratio making higher low + BTC vol declining → alt season starting"                                                                      |
| `cross_asset`     | "SOL leads BTC by 2-4h on regime shifts"                                                                                                         |
| `funding_arb`     | "Spot/perp basis > 0.10%/day → short perp long spot riskless carry" (requires paper-side spot+perp — may not be available in current paperStore) |
| `funding_squeeze` | "Negative funding > −0.05%/8h sustained 3+ cycles → short squeeze risk"                                                                          |

The `funding_arb` and `funding_squeeze` types are crypto-native — they don't appear in equity-only hypothesis libraries. Surface them when funding data is in the input bundle.

## Output artifacts

```json
// hypothesis_cards_<date>.json
{
  "schema_version": "1.0",
  "generated_at": "<ISO8601 UTC>",
  "input_evidence_summary": "<one paragraph>",
  "cards": [
    {
      "hypothesis_id": "h_breakout_202607171030_abc",
      "summary": "BTC daily close above MA20 after 6-week base with vol dry-up → 1R within 5 bars > 65% of the time",
      "hypothesis_type": "breakout",
      "predicted_edge": "+5 to +8% over 5 days",
      "evidence_summary": "12 observed instances in 2025-2026 Bybit BTC daily bars; 9 reached ≥1R within 5 bars",
      "evidence_quality": "moderate",
      "experiment_design": {
        "universe": ["BTCUSDT"],
        "timeframe": "1d",
        "entry": "daily close > MA20 AND day's low ≤ MA50 AND 20d ATR percentile < 30",
        "exit": "daily close < MA20",
        "stop": "MA50 − 1.5 × ATR(14)",
        "sizing": "1% risk per trade",
        "lookback_window": "5 years"
      },
      "kill_criteria": [
        "expectancy < 0 after 30 trades",
        "Sharpe < 0.5 after 50 trades",
        "max DD > 30%"
      ],
      "critique": [
        "12 instances is small sample — be cautious on weight even if backtest passes",
        "Vol dry-up definition must be programmatic (not 'I saw it')"
      ],
      "verdict": "pursue",
      "rank": 1
    }
  ]
}
```

`strategy_<hypothesis_id>.yaml` is a normalized machine-readable form whose schema matches the cryptopapertrade Phase 6 AI bot executor config (to be defined — `generated/CDSDK` would be the natural home). Don't ship the export without that schema defined first; skip `--export-strategies` until then.

## Procedure (manual run)

1. Collect the input bundle (from the user, or auto-assembled from `paperStore.history[]` + `paperStore.journal[]` if user has 50+ trades).
2. Normalize + extract evidence summary (read via `signal-postmortem` if regime tags need to be derived per-trade).
3. Draft 3–5 hypothesis cards using the framework above.
4. Critique pass — flag small-sample risks, look-ahead risks, funding/slippage realism gaps.
5. Rank + tag `pursue | revise | discard`; cap at 3 `pursue`.
6. Present ranked list to the user.
7. If user selects a `pursue` card, hand it off to **`backtest-expert`** to validate, and then to **`technical-analyst`** for forward chart read.

## Compose with other skills

- **`signal-postmortem`** assigns regime tags + outcome categories — feeds evidence quality into the ideator.
- **`backtest-expert`** validates a hypothesis card into a Deploy/Refine/Abandon verdict.
- **`technical-analyst`** confirms forward chart pattern matches the hypothesis setup.
- **`paper-trading-logic`** is the analog "the app will trade this config" reference — confirm the experiment design's entry/exit/sizing can be expressed in the app's current order types.

## Output discipline

- Always state the input evidence summary explicitly — even if obvious.
- Always set `evidence_quality` conservatively; flag small-sample cards as `weak`.
- Max 3 `pursue` cards; force diversity of hypothesis types.
- Don't ship `strategy_<id>.yaml` exports until the Phase 6 AI bot's strategy-config schema exists in `generated/CDSDK`. Until then, present cards as inline-ranked text only.
- Original reference reading: <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/trade-hypothesis-ideator/references/evidence_quality_guide.md>.
