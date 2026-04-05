import type { CandleBar } from '@crypto-dashboard/sdk';

// ─── EMA ──────────────────────────────────────────────────────────────────────
// Returns an array aligned to `data`.
// First (period - 1) entries are null — not enough history yet.
// Each subsequent value: EMA = price × k + prevEMA × (1 − k),  k = 2 / (period + 1)
export function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  // Seed: simple average of the first `period` bars
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + (result[i - 1] as number) * (1 - k);
  }
  return result;
}

// ─── VWAP ─────────────────────────────────────────────────────────────────────
// Volume-Weighted Average Price. Resets every UTC calendar day.
// Typical price = (high + low + close) / 3
export function calcVWAP(bars: CandleBar[]): (number | null)[] {
  const result: (number | null)[] = new Array(bars.length).fill(null);
  let cumPV = 0;
  let cumVol = 0;
  let currentDay = -1;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const day = Math.floor(bar.timestamp / 86_400_000); // ms → UTC day bucket

    if (day !== currentDay) {
      // New session — reset accumulators
      cumPV = 0;
      cumVol = 0;
      currentDay = day;
    }

    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumPV += typicalPrice * bar.volume;
    cumVol += bar.volume;
    result[i] = cumVol > 0 ? cumPV / cumVol : null;
  }
  return result;
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
// MACD line  = EMA(fast) − EMA(slow)
// Signal     = EMA(signalPeriod) of the MACD line
// Histogram  = MACD − Signal
// Standard defaults: fast=12, slow=26, signal=9
export function calcMACD(
  data: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calcEMA(data, fast);
  const emaSlow = calcEMA(data, slow);

  // MACD line
  const macdLine: (number | null)[] = data.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  // Signal = EMA of MACD — feed only non-null values, then re-align to original indices
  const nonNullMacd = macdLine.filter((v): v is number => v !== null);
  const signalRaw = calcEMA(nonNullMacd, signalPeriod);

  const signal: (number | null)[] = new Array(data.length).fill(null);
  let idx = 0;
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null) {
      signal[i] = signalRaw[idx++] ?? null;
    }
  }

  // Histogram
  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signal[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macd: macdLine, signal, histogram };
}
