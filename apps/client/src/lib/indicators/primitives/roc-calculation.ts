import type { CandlestickData, LineData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';

export type SupportedData = CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

export interface RocCalculationOptions {
  /** Bars back to compare with (`n` in `src[n]`) */
  length: number;
  /** Candle field: close (default), open, high or low */
  source?: string;
}

/**
 * Rate of Change, as TradingView's built-in ROC: `100 × (src − src[n]) / src[n]`.
 *
 * The first `length` bars have no value (whitespace), and so does any bar whose `src[n]` is
 * missing or zero (a division by zero would plot ±Infinity).
 */
export function calculateRocIndicatorValues(
  data: SupportedData[],
  options: RocCalculationOptions
): (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] {
  const length = Math.max(1, Math.floor(options.length));
  const source = options.source ?? 'close';
  const values = data.map((d) => {
    const v = (d as unknown as Record<string, unknown>)[source];
    return typeof v === 'number' ? v : undefined;
  });
  return data.map((d, i) => {
    const time = d.time;
    const current = values[i];
    const previous = i >= length ? values[i - length] : undefined;
    if (current === undefined || previous === undefined || previous === 0) return { time };
    return { time, value: (100 * (current - previous)) / previous };
  });
}
