---
name: technical-analyst
description: Use when the user provides chart screenshots or asks for technical analysis of any symbol on cryptopapertrade.com — crypto (BTCUSDT, ETHUSDT, etc.), indices, or forex. Triggers: "analyze this chart", "TA on BTC/ETH/SOL", "support / resistance", "trend identification", "what's the base case / bull case / bear case", "scenario planning for price", "weekly chart read". Reads chart images via the persisted Grok 4.5 vision subagent when needed; works on Bybit-fed weekly candles or pasted screenshots. Excludes news and fundamentals by design.
---

# Technical Analyst — cryptopapertrade.com (crypto-adapted)

Adapted from `tradermonty/claude-trading-skills` → `skills/technical-analyst/SKILL.md`. Original methodology preserved; US-equity/FMP/COT contrarian script fallback replaced with chart-first analysis on crypto.

## When to use

- The user pastes a chart screenshot (auto-handled by the `opencode-vision` plugin → `[vision:dropped-image]` JSON → routes to Grok 4.5).
- The user asks for a weekly (or daily/4h) chart read on a symbol supported by `apps/server/src/constants.ts` `ALLOWED_SYMBOLS`.
- The user wants probabilistic scenarios (base/bull/bear) — not a single price prediction.
- The user explicitly excludes news and fundamentals ("just chart data").

## When NOT to use

- The user wants news-driven or fundamental analysis — pass to a different workflow.
- The chart covers an unsupported symbol (must extend `ALLOWED_SYMBOLS` first).
- The user is asking about a chart bug or drawing-tool bug — use the `drawing-tools` skill, not TA.

## Methodology (asset-agnostic)

1. **Confirm inputs**: receive one weekly chart image per call. State the symbol, timeframe, and OHLCV coverage visible.
2. **Read methodology**: optional; original reference at <https://github.com/tradermonty/claude-trading-skills/blob/main/skills/technical-analyst/references/technical_analysis_framework.md>. The core framework holds for crypto: trend → S/R → moving averages (20/50/200-week; for crypto also 50/200-day if daily chart) → volume → patterns → synthesis → scenarios.
3. **Analyze each chart systematically**:
   - **Trend**: long-term, intermediate, short-term. Crypto specifics — judge blow-off tops, capitulation wicks, multi-month base-building, post-halving cycle context (only if user explicitly mentions halving).
   - **Support/Resistance**: prior swing highs/lows, volume-ledger nodes, prior breakdown/rally levels.
   - **Moving averages**: 20/50/200-week for weekly; 20/50/200-day for daily. Note slope, spacing, separation, golden/death cross state.
   - **Volume**: rising into breakouts vs distribution into rallies. For crypto futures, funding-rate proxy if available (do not invent).
   - **Patterns**: base-building, VCP-style contraction (see original Minervini notes — useful even on crypto). Blow-off / parabolic / failing flag.
4. **Synthesize** qualitative observations into a single coherent current-state paragraph.
5. **Generate 2–4 probabilistic scenarios** with:
   - Direction (base / bull / bear / alt)
   - Price target(s) — anch landmarks (prior swing, MA, round number, on-chain volume node if user provided)
   - Invalidation — the price level that disproves this scenario
   - Probability — sum of all scenarios MUST equal 100%
6. **Save report** — emulate the original: `reports/<SYMBOL>_technical_analysis_<YYYY-MM-DD>.md` if the user wants persistence, otherwise inline in chat.

## Vision integration — pasting charts

When the user pastes a chart:

1. Detect `[vision:dropped-image]` token in your context.
2. Load the global `vision` skill (`~/.config/opencode/skills/vision/SKILL.md`). Persisted model: `opencode-go/grok-4.5` (see `~/.config/opencode/vision-model-image.txt`).
3. Delegate to the `vision-opencode-go-grok-4.5` subagent with a tailored response template like:

```json
{
  "symbol": "<string|null>",
  "timeframe": "<weekly|daily|4h|unknown>",
  "trend": { "long": "up|down|sideways", "intermediate": "...", "short": "..." },
  "key_supports": [{"price": <num>, "type": "<string>", "evidence": "<string>"}],
  "key_resistances": [{"price": <num>, "type": "<string>", "evidence": "<string>"}],
  "ma_state": { "ma20": {"slope": "...", "price_relation": "above|below"}, "ma50": "...", "ma200": "..." },
  "volume_pattern": "<string>",
  "chart_patterns": ["<pattern-name>"],
  "current_state": "<one paragraph synthesis>",
  "scenarios": [
    { "name": "base", "direction": "...", "target": <num>, "invalidation": <num>, "probability": <0-100>, "rationale": "<string>" },
    { "name": "bull", "direction": "...", "target": <num>, "invalidation": <num>, "probability": <0-100>, "rationale": "<string>" },
    { "name": "bear", "direction": "...", "target": <num>, "invalidation": <num>, "probability": <0-100>, "rationale": "<string>" }
  ],
  "confidence": <0-1>,
  "uncertainty": "<string|null>"
}
```

4. Parse returned JSON, summarize to the user with cited evidence. Never break scenario-probability sum = 100.

## Bybit REST fallback (instead of COT / FMP futures chain)

If the user has no screenshot but asks "analyze BTCUSDT weekly":

- Server REST endpoint: `GET /api/market/history?symbol=BTCUSDT&interval=1w&limit=200` (Fastify route in `apps/server/src/routes/market/index.ts`)
- Returns up to `INTERVAL_FETCH_LIMIT[<'1w'>]` weekly bars (~200, capped at the server max of 1000).
- Aggregate daily bars to weekly client-side if the 1w endpoint isn't directly exposed.
- Do NOT call Bybit directly from the client — the app proxies via the server so rate limits and `ALLOWED_SYMBOLS` enforcement are respected.
- Compare against `apps/client/src/store/paneStore.ts` `MAX_BARS = 1000` and `apps/server/src/services/BybitWebSocketManager.ts` so you know the live cap.

## Compose with other skills

- After TA suggests a setup, the **`position-sizer`** skill converts the entry/stop into a coin-unit count for the cryptopapertrade paperStore balance.
- The **`pre-trade-discipline-gate`** skill runs the plan-through-checklist gate before the user submits via `TradingPanel`.
- The **`paper-trading-logic`** skill documents the app-side bracket lifecycle so TA-derived TP/SL values translate to the `placeLimitOrder` / `placeStopOrder` flow correctly.
- For chart drawing bugs (trendline, parallel channel) use **`drawing-tools`**, not this skill.

## Output discipline

- Always state the chart timeframe and bar count visible.
- Always state the scenario probability sum check (must = 100).
- Never present a single price target without an invalidation level — that's a fundamental TA rule.
- If the chart screenshot is ambiguous, set `confidence < 0.6` and list `uncertainty` — do not fabricate levels.
- Do not invent funding rates, open interest, or on-chain metrics unless the user explicitly provides them.
