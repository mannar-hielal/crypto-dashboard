import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { chart as chartTokens } from '@/lib/tokens';
import { exponentialMovingAverage, simpleMovingAverage } from './moving-average-calculation';

type MaFn = (values: (number | undefined)[], period: number) => (number | undefined)[];

const MA_FNS: Record<string, MaFn> = {
  ema: exponentialMovingAverage,
  sma: simpleMovingAverage,
};

export interface MacdInputs {
  fast: number;
  slow: number;
  signalLength: number;
  /** close (default), hl2, hlc3 or ohlc4 */
  source: string;
  /** 'ema' (default) or 'sma' — the fast / slow lines */
  oscMaType: string;
  /** 'ema' (default) or 'sma' — the signal line */
  signalMaType: string;
}

export interface MacdValues {
  macd: (number | undefined)[];
  signal: (number | undefined)[];
  histogram: (number | undefined)[];
}

function sourceValue(bar: CandlestickData<UTCTimestamp>, source: string): number {
  switch (source) {
    case 'hl2':
      return (bar.high + bar.low) / 2;
    case 'hlc3':
      return (bar.high + bar.low + bar.close) / 3;
    case 'ohlc4':
      return (bar.open + bar.high + bar.low + bar.close) / 4;
    default:
      return bar.close;
  }
}

/**
 * MACD = MA(src, fast) − MA(src, slow); signal = MA(MACD, signalLength) over the defined MACD
 * values; histogram = MACD − signal. One entry per bar, undefined while a line warms up.
 */
export function calculateMacd(
  bars: CandlestickData<UTCTimestamp>[],
  inputs: MacdInputs
): MacdValues {
  const values = bars.map((b) => sourceValue(b, inputs.source));
  const oscMa = Object.hasOwn(MA_FNS, inputs.oscMaType)
    ? MA_FNS[inputs.oscMaType]
    : exponentialMovingAverage;
  const signalMa = Object.hasOwn(MA_FNS, inputs.signalMaType)
    ? MA_FNS[inputs.signalMaType]
    : exponentialMovingAverage;

  const fastMa = oscMa(values, inputs.fast);
  const slowMa = oscMa(values, inputs.slow);
  const macd = fastMa.map((f, i) => {
    const s = slowMa[i];
    return f !== undefined && s !== undefined ? f - s : undefined;
  });

  // The signal runs over the defined MACD values only, then is laid back onto the bars
  const signalRaw = signalMa(
    macd.filter((v): v is number => v !== undefined),
    inputs.signalLength
  );
  let next = 0;
  const signal = macd.map((m) => (m === undefined ? undefined : signalRaw[next++]));
  const histogram = macd.map((m, i) => {
    const s = signal[i];
    return m !== undefined && s !== undefined ? m - s : undefined;
  });
  return { macd, signal, histogram };
}

/**
 * The histogram bar's colour, as TradingView's MACD: "grow" only when the previous bar is
 * strictly lower (`hist[1] < hist`); an equal bar, or the first one (no previous), counts as
 * "fall". Above zero: grow = macdHistBull, fall = macdHistBullDim; below zero: grow =
 * macdHistBearDim, fall = macdHistBear.
 */
export function macdHistogramColor(previous: number | undefined, current: number): string {
  const grow = previous !== undefined && previous < current;
  if (current >= 0) return grow ? chartTokens.macdHistBull : chartTokens.macdHistBullDim;
  return grow ? chartTokens.macdHistBearDim : chartTokens.macdHistBear;
}
