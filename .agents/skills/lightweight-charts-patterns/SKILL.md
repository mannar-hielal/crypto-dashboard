---
name: lightweight-charts-patterns
description: Use when working on a chart in cryptopapertrade.com — ChartPanel.tsx, MultiChartArea.tsx, usePaneFeeds.ts, paneStore.ts, drawing primitives, or any lightweight-charts v5.x integration. Covers chart init, Bybit data mapping (CandleBar → LH chart), real-time candle updates, in-progress vs closed candle handling, multi-pane crosshair/time-range sync, timeframe/symbol switching with store flush, volume histogram, funding/OI overlay (future), crosshair tooltips, React ref/hook patterns, lifecycle cleanup, memory bounds. Complements the drawing-tools skill which handles ISeriesPrimitive rendering.
---

# Lightweight Charts Patterns — cryptopapertrade.com

Adapted from `emeraldls/mmt-api-skills` → `skills/mmt-tradingview-charts/SKILL.md` + its 14 per-rule files. Same patterns; data source swapped from MMT (multi-exchange, CBOR, `OHLCVTPublic`) to cryptopapertrade's Bybit proxy (`/api/market/*` REST, `/api/market/ws` WebSocket, `CandleBar` from `generated/CDSDK/types/index.ts`).

## App context — what's already wired

| File                                                      | Role                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/components/dashboard/ChartPanel.tsx`     | Per-pane chart instance (`createChart`), exposes `onChartReady(chart, series)` to `MultiChartArea`; gates hover legend; composes with `DrawingPrimitive` |
| `apps/client/src/components/dashboard/MultiChartArea.tsx` | CSS grid of 4 panes; cross-pane crosshair + time-range sync; `chartRefs[0..3]` registry                                                                  |
| `apps/client/src/hooks/usePaneFeeds.ts`                   | Manages 4 REST+WS feeds (one per pane slot)                                                                                                              |
| `apps/client/src/store/paneStore.ts`                      | 4 vanilla Zustand stores (`paneStores[0..3]`); `bars` ring-buffer (MAX_BARS=1000)                                                                        |
| `apps/client/src/store/layoutStore.ts`                    | 4-pane layout config + sync options; persisted `cd-layout`                                                                                               |
| `apps/server/src/services/BybitWebSocketManager.ts`       | Server singleton; proxies Bybit WS; rebroadcasts to client WS                                                                                            |
| `apps/server/src/routes/market/index.ts`                  | REST history + WS client endpoint                                                                                                                        |
| `apps/server/src/constants.ts`                            | `ALLOWED_SYMBOLS` (9 coins vs USDT), `ALLOWED_INTERVALS` (6)                                                                                             |
| `generated/CDSDK/types/index.ts`                          | Shared types — `CandleBar`, `WsMessage` union                                                                                                            |
| `apps/client/src/lib/tokens.ts`                           | Chart color tokens (`chart.candleUp`, `chart.candleDown`, `chart.bg`, etc.) — canvas libs read this directly since they can't read CSS vars              |

**Library version**: `lightweight-charts ^5.1.0` (v5 API — `series.update()`, `subscribeCrosshairMove`, `subscribeVisibleTimeRangeChange`, `setCrosshairPosition`, `ISeriesPrimitive`).

This skill COMPLEMENTS the **`drawing-tools`** skill — drawing-tools is _primitives on the chart_; this skill is the chart itself, its data feed, and its lifecycle.

## Chart initialization

```typescript
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import { chart as chartTokens } from '@/lib/tokens';

const chart = createChart(container, {
  layout: {
    background: { type: ColorType.Solid, color: chartTokens.bg }, // matches bg.page = '#060413'
    textColor: chartTokens.textColor,
    fontFamily: 'Geist Variable, ui-sans-serif, sans-serif',
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    timeVisible: true,
    secondsVisible: false,
  },
  autoSize: true, // let LH resize on container change — ChartPanel sets this
});
```

`autoSize: true` removes the need for manual `chart.resize()` calls. If you set `autoSize: false`, you MUST call `chart.applyOptions({ width, height })` on container resize — see lifecycle section.

## Data mapping — Bybit `CandleBar` → LH chart

Server returns `CandleBar` from `generated/CDSDK/types/index.ts`:

```typescript
interface CandleBar {
  time: number; // Unix seconds (Bybit returns seconds for klines)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // base-asset volume
}
```

Lightweight Charts v5 expects:

```typescript
interface CandlestickData<T = Time> {
  time: T; // UTCTimestamp (seconds) — must be unique & ascending
  open: number;
  high: number;
  low: number;
  close: number;
}
```

**Adapter** (drop in `apps/client/src/lib/chartDataAdapter.ts` if you want it factored — currently inline in `ChartPanel`):

```typescript
import type { UTCTimestamp, CandlestickData } from 'lightweight-charts';
import type { CandleBar } from '@crypto-dashboard/sdk';

export function toLHCandle(bar: CandleBar): CandlestickData<UTCTimestamp> {
  return {
    time: bar.time as UTCTimestamp, // Bybit returns seconds → no conversion
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

export function toLHVolume(bar: CandleBar): HistogramData<UTCTimestamp> {
  return {
    time: bar.time as UTCTimestamp,
    value: bar.volume,
    color: bar.close >= bar.open ? chartTokens.candleUp : chartTokens.candleDown,
  };
}
```

**Caveat**: time MUST be ascending and unique. Bybit occasionally sends a duplicate timestamp on the in-progress bar — `series.update()` handles this (it upserts by time), but `series.setData()` will throw if you call it with duplicate timestamps. Always dedupe before bulk `setData`:

```typescript
const dedup = new Map<number, CandlestickData>();
for (const b of bars) dedup.set(b.time, toLHCandle(b));
candleSeries.setData([...dedup.values()].sort((a, b) => a.time - b.time));
```

## Real-time candle updates — in-progress vs closed

Bybit's kline WS sends both in-progress bars (last one updates on every trade) and finalized closed bars. Two patterns:

### Pattern A — append new closed bar, update in-progress

```typescript
ws.onmessage = (ev) => {
  const msg: WsMessage = JSON.parse(ev.data);
  if (msg.type !== 'candle') return;
  const bar = msg.data;
  const lhBar = toLHCandle(bar);
  const lastBar = store.getState().bars.at(-1);

  if (!lastBar || bar.time > lastBar.time) {
    // NEW closed bar — append to ring buffer
    store.getState().addBar(bar);
    candleSeries.update(lhBar);
  } else if (bar.time === lastBar.time) {
    // IN-PROGRESS — same timestamp, mutate the last entry
    store.getState().updateLastBar(bar);
    candleSeries.update(lhBar); // LH dedupes by time
  }
  // else: stale/out-of-order — drop (Bybit shouldn't send these)
};
```

### Pattern B — batch reset on reconnect

After server WS reconnect, you'll either replay the gap via REST or just resync with a fresh `setData`. Always prefer REST gap-fill to avoid wiping the user's visible range:

```typescript
async function backfillGap(store, lastTime: number) {
  const bars = await fetch(
    `/api/market/history?symbol=${symbol}&interval=${interval}&startTime=${lastTime + 1}&limit=1000`
  );
  for (const b of bars) candleSeries.update(toLHCandle(b));
}
```

**Already implemented**: see `apps/client/src/hooks/usePaneFeeds.ts` `addBar` action in `paneStore`.

## Multi-pane layout (4-pane sync) — pattern recap

`MultiChartArea.tsx` already handles this. Pattern reinforced here for new chart instances:

```typescript
// Crosshair sync — subscriber on SOURCE chart, applied to FOLLOWER charts
sourceChart.subscribeCrosshairMove((param) => {
  if (!param.point || !param.time || param.sourceEvent === undefined) return; // skip programmatic
  for (const [i, follower] of chartRefs.entries()) {
    if (i === activePane || !follower) continue;
    const followerSeries = followerSeriesRefs[i];
    if (!followerSeries) continue;
    const followerLatest = paneStores[i].getState().latestPrice;
    if (followerLatest === null) continue; // data not loaded yet

    // Y-sync: map source Y pixel to follower price scale
    const price = followerSeries.coordinateToPrice(param.point.y);
    if (!price) continue;

    // Guard: reject if deviation > 50% from follower's last price (stale scale after symbol change)
    if (Math.abs(price - followerLatest) / followerLatest > 0.5) continue;

    follower.setCrosshairPosition(price, param.time, followerSeries);
  }
});

// Clear on mouse leave
sourceChart.subscribeCrosshairMove((param) => {
  if (!param.point) {
    for (let i = 0; i < chartRefs.length; i++) {
      if (i === activePane || !chartRefs[i]) continue;
      chartRefs[i]!.clearCrosshairPosition();
    }
  }
});
```

**Time-range sync** uses an `isSyncingTimeRange` ref guard to break the cascade — already in `MultiChartArea.tsx`. Don't add a second guard — the existing one is correct.

## Timeframe & symbol switching — flush pattern

```typescript
async function onSymbolOrIntervalChange(paneIdx: number, newSymbol: string, newInterval: string) {
  const store = paneStores[paneIdx];

  // 1. Tear down current WS
  cleanupRef.current?.(); // clears reconnect timer, sets onclose=null, closes socket
  cleanupRef.current = null;

  // 2. Clear chart series and store (zero React re-render — direct LH API)
  candleSeriesRef.current?.setData([]);
  volumeSeriesRef.current?.setData([]);
  store.getState().reset(); // wipes bars, indicators, latestPrice, priceChange, bid, ask

  // 3. REST initial fetch (INTERVAL_FETCH_LIMIT[interval] bars — server max is 1000)
  const bars = await fetch(
    `/api/market/history?symbol=${newSymbol}&interval=${newInterval}&limit=1000`
  );
  const dedup = new Map<number, CandlestickData>();
  for (const b of bars) dedup.set(b.time, toLHCandle(b));
  candleSeriesRef.current?.setData([...dedup.values()].sort((a, b) => a.time - b.time));

  // 4. Apply interval-aware initial bar spacing
  candleSeriesRef.current
    ?.chart()
    .timeScale()
    .applyOptions({ barSpacing: INTERVAL_BAR_SPACING[newInterval] });
  candleSeriesRef.current?.chart().timeScale().scrollToRealTime();

  // 5. Open new WS — done via usePaneFeeds effect dependency
}
```

This is **already implemented in `usePaneFeeds.ts`** — when the user changes symbol/interval on a pane, the effect cleanup tears down the old connection and the new effect run fetches + opens fresh.

**Important**: never call `setData` and then `update` in the same tick — LH throws on `update` with a time ≤ last setData time. Use `requestAnimationFrame` to defer the first `update`.

## Volume histogram

Add a histogram pane — not currently in the app, optional addition:

```typescript
const volumeSeries = chart.addHistogramSeries({
  priceFormat: { type: 'volume' },
  priceScaleId: '', // overlay on top of price — see below for separate-pane variant
});

volumeSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.8, bottom: 0 }, // squash into bottom 20% of price pane
});
```

For a separate pane (cleaner):

```typescript
const volumePane = chart.addPane(); // v5 API — returns pane index
const volumeSeries = chart.addHistogramSeries(
  { priceFormat: { type: 'volume' }, priceScaleId: 'volume' },
  (paneIndex = volumePane)
);
```

**Crypto coloring**: green/red based on close vs open is conventional but misleading — crypto has institutional flow split. If the server exposes `tb` (taker buy volume) like Bybit's `v` field, use:

```typescript
color: bar.close >= bar.open
  ? (bar	tb > bar.vs / 2 ? chartTokens.candleUp : 'rgba(44, 205, 120, 0.4)')
  : (bar.tb < bar.vs / 2 ? chartTokens.candleDown : 'rgba(213, 69, 92, 0.4)')
```

Currently cryptopapertrade's server doesn't expose taker buy/sell split — check `apps/server/src/services/BybitWebSocketManager.ts` before relying on it.

## Funding-rate overlay (future — requires server extension)

```typescript
const fundingSeries = chart.addLineSeries({
  color: chartTokens.ema20, // blue
  lineWidth: 2,
  priceScaleId: 'funding',
  priceFormat: { type: 'percent', precision: 4, minMove: 0.0001 },
});
fundingSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.1, bottom: 0.1 },
});
```

Server change: add `apps/server/src/routes/market/funding.ts` that calls Bybit's `GET /v5/market/funding/history` and forwards to client. Add `{ type: 'funding', symbol, rate, time }` to `WsMessage` union in `generated/CDSDK/types/index.ts`. Cross-reference **`pr-review-checklist`** section 5 (WS) before adding.

## Open-interest overlay (future — same caveat as funding)

```typescript
const oiSeries = chart.addAreaSeries({
  lineColor: chartTokens.ema9, // slate
  topColor: 'rgba(148, 163, 184, 0.2)',
  bottomColor: 'rgba(148, 163, 184, 0)',
  priceScaleId: 'oi',
});
```

Bybit endpoint: `GET /v5/market/open-interest` (5-min intervals for derivatives). Same server-extension discipline as funding.

## Crosshair & tooltip (custom OHLC overlay)

Already in `ChartPanel.tsx`:

```typescript
chart.subscribeCrosshairMove((param) => {
  if (!param.point || !param.time || inProgressDrawing) {
    setHoverData(null);
    return;
  }
  const data = param.seriesData.get(candleSeries);
  if (!data) return;
  setHoverData({
    time: param.time,
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
    volume: volumeSeries?.dataByIndex(param.logical) ?? null,
  });
});
```

`!inProgressDrawing` gates the hover legend off while the user is placing a drawing — see **`drawing-tools`** skill "Hover Legend Gating" section. Don't regress this; without it, the legend flickers over drawing previews.

## React integration patterns

The app uses this exact shape — pattern recap:

```typescript
function ChartPanel({ symbol, interval, paneIdx, onChartReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, CHART_OPTIONS);
    const candleSeries = chart.addCandlestickSeries({
      upColor: chartTokens.candleUp,
      downColor: chartTokens.candleDown,
      borderVisible: false,
      wickUpColor: chartTokens.candleUp,
      wickDownColor: chartTokens.candleDown,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    onChartReady(chart, candleSeries, paneIdx);

    return () => {
      chart.remove(); // clears all series + listeners
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [paneIdx]); // only re-create on pane identity change — NOT on symbol/interval
}
```

**Refs as chart identity**: `chartRef.current` lives across symbol/interval switches (chart is NOT recreated). Data layer (`usePaneFeeds`) is what tears down + reconnects. The chart instance is long-lived; only the data mutates.

**Avoid**:

- Calling `createChart` more than once per container — the first instance's listeners linger.
- Recreating series on every data update — `series.setData()` / `series.update()` upserts.
- Calling React setState on every WS frame — use Zustand store updates or direct DOM manipulation if needed for performance.

## Chart lifecycle & memory

```typescript
// Cleanup order on unmount — DON'T regress this
useEffect(
  () => () => {
    // 1. Clear WS cleanup
    cleanupRef.current?.();
    // 2. Clear all subscriptions on chart (drawing primitives, crosshair, time-range)
    if (drawingPrimitiveRef.current) chartRef.current?.removePrimitive(drawingPrimitiveRef.current);
    // 3. Remove chart entirely — frees canvas + WebGL context
    chartRef.current?.remove();
  },
  []
);
```

**Avoid**: WebGL context leak. Browsers cap ~16 active WebGL contexts. Chartist-leaks give "Too many WebGL contexts" errors. The `chart.remove()` call frees the context — if you skip cleanup in a hot-reload, you'll exhaust contexts after ~16 pane swaps.

**Ring buffer**: `paneStore.ts` `MAX_BARS = 1000` — `addBar` uses `slice(-MAX_BARS)` to trim. If you raise MAX_BARS, also raise `INTERVAL_FETCH_LIMIT` in `apps/server/src/constants.ts` symmetrically — otherwise the initial fetch will underfill the buffer.

## Performance — the chart hot path

- **Don't `setData` on every WS frame** — use `series.update()` for incremental upserts.
- **Don't recreate chart on prop change** — refs persist.
- **Don't subscribe with arrow functions re-created every render** — extract subscribers to module-level or `useCallback` with stable refs.
- **debounce gridTemplate style writes** during `ResizeSplitter` drag — DOM mutation in place via `setPointerCapture` (already implemented in `MultiChartArea`). Don't switch to React state for splitter position.
- **batch rapid WS frames** — if Bybit's 1m kline sends 60 updates/min on an active symbol, throttle UI to 30 Hz via `requestAnimationFrame`. The store can take every frame; the chart series `update` should also be throttled if you see jank.

## Cross-references

- **`drawing-tools`** skill — for `ISeriesPrimitive` (trendline, horizontal, vertical, ray, parallel channel) and hit-testing. This skill is the chart; that skill is the shapes on it.
- **`paper-trading-logic`** skill — `paperStore` interacts with chart via TP/SL monitor (`useTPSLMonitor`) — does NOT mutate chart directly; it reacts to mark-price changes from `paneStore.latestPrice`.
- **`bug-sweep`** skill — WebSocket listener cleanup (P3), `socket.readyState` checks (P3), reconnect timer clearing on unmount (P3). Run it before any chart-feed change.
- **`figma-theme-source`** skill — chart colors come from `tokens.ts` `chart.*` block; those values came from sampling the Exgen Figma. Don't introduce hex inline.
- **`pr-review-checklist`** section 5 (WebSocket) — enforces cleanup discipline on any new feed path.

## When NOT to use this skill

- App business logic (orders, TP/SL, journal, leverage) → **`paper-trading-logic`**.
- Trading workflow / strategy research → **`technical-analyst`**, **`position-sizer`**, etc.
- Drawing primitives specifically → **`drawing-tools`** (more detailed than this skill on the primitive surface).
- Visual design decisions for the chart surrounding UI → **`figma-theme-source`**.
- Pre-commit code review → **`pr-review-checklist`**.

## Output discipline

- Cite `ChartPanel.tsx`, `MultiChartArea.tsx`, `usePaneFeeds.ts`, `paneStore.ts` with `:line` when referencing existing implementations.
- When suggesting an addition (volume histogram, funding overlay, OI overlay), explicitly state which server endpoints need extending and cross-reference the SDK type change path.
- Never break the existing 4-pane sync — it's carefully wired with guard refs (`isSyncingTimeRange`, `param.sourceEvent`). Run **`bug-sweep`** before changing sync handlers.
