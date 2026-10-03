import type { CandlestickData, LineData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';

export type SupportedData = CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

/**
 * Typical Price, as TradingView's `hlc3`: `(high + low + close) / 3` for each bar. A whitespace
 * bar stays whitespace.
 */
export function calculateTypicalPriceIndicatorValues(
  data: SupportedData[]
): (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] {
  return data.map((d) =>
    'close' in d ? { time: d.time, value: (d.high + d.low + d.close) / 3 } : { time: d.time }
  );
}
