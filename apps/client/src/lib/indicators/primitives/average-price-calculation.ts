import type { CandlestickData, LineData, Time, WhitespaceData } from 'lightweight-charts';

export type SupportedData = CandlestickData | WhitespaceData;

/**
 * Options for average price calculation.
 */
export interface AveragePriceCalculationOptions {
  /**
   * Offset to shift the result forward (positive) or backward (negative).
   * E.g. offset=2 will display the average price bars ahead.
   */
  offset?: number;
}

/**
 * Calculates a average price (with optional offset).
 *
 * For each item computes the OHLC/4 value.
 *
 * @param {(CandlestickData | WhitespaceData)[]} data - The input data array (sorted by time).
 * @param {AveragePriceCalculationOptions} options - Calculation options.
 * @returns {(LineData | WhitespaceData)[]} An array of values (or whitespace data).
 *
 * @example
 * const result = calculateAveragePriceIndicatorValues(
 *   [{ time: 1, open: 10, high: 11, low: 9.9, close: 10.2 }, { time: 2, open: 10.2, high: 10.5, low: 9.9, close: 10.3 }],
 *   { length: 2 }
 * );
 */
export function calculateAveragePriceIndicatorValues<T = Time>(
  data: (CandlestickData<T> | WhitespaceData<T>)[],
  options: AveragePriceCalculationOptions
): (LineData<T> | WhitespaceData<T>)[] {
  if (data.length === 0) {
    return [];
  }

  const offset = options.offset ?? 0;
  const result = new Array(data.length);
  const startIndex = offset > 0 ? offset : 0;
  // 🔐 data.length (not data.length - 1) for offset >= 0 — the trailing loop
  //    below only exists to leave blank whitespace for a NEGATIVE offset; at
  //    offset 0 there should be zero trailing whitespace entries, so the value
  //    loop must run all the way through the last bar, not stop one short of it.
  const endIndex = offset < 0 ? data.length + offset : data.length;
  let resultIndex = 0;

  for (let i = 0; i < startIndex; i++) {
    result[resultIndex] = { time: data[i].time };
    resultIndex += 1;
  }

  for (let i = startIndex; i < endIndex; i++) {
    const value = data[i];

    if ('close' in value) {
      result[resultIndex] = {
        time: value.time,
        value: (value.open + value.high + value.low + value.close) / 4,
      };
    } else {
      result[resultIndex] = { time: value.time };
    }

    resultIndex += 1;
  }

  for (let i = endIndex; i < data.length; i++) {
    result[resultIndex] = { time: data[i].time };
    resultIndex += 1;
  }

  return result;
}
