import { fmtMktPrice } from './utils';

/**
 * sltpSanity.ts
 *
 * Pure helper for SL/TP input sanity checks in TradingPanel.
 * Catches two failure modes observed in the 4.18 incident:
 *
 *   1. Typo guard — SL/TP deviates by more than TYPO_DEVIATION_THRESHOLD from the
 *      live price (e.g. "7800" entered instead of "78000" for a BTC position).
 *
 *   2. Large-distance guard — |entry − sl| / entry > SL_MAX_DISTANCE (default 10%).
 *      Catches an intentionally extreme but plausible SL that is still far
 *      enough from the market to be worth a confirmation step.
 *
 * Both thresholds are exported constants so tests can import them directly.
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────

/**
 * If SL/TP deviates by more than this fraction from the live price,
 * flag it as a probable typo.
 *
 * Example: live price = 78 000, SL = 7 800 → deviation = 90 % → typo.
 *          live price = 78 000, SL = 70 000 → deviation = 10 % → not a typo.
 *
 * Threshold = 0.80 means "more than 80 % away from live price".
 */
export const TYPO_DEVIATION_THRESHOLD = 0.8;

/**
 * If |entry − sl| / entry exceeds this fraction, flag as a large-distance SL.
 *
 * Example: entry = 78 000, SL = 70 000 → distance = 10.3 % → large distance.
 *          entry = 78 000, SL = 75 000 → distance = 3.8 %  → normal.
 */
export const SL_MAX_DISTANCE = 0.1;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SLTPWarnings {
  /** Non-null when the value looks like an order-of-magnitude typo */
  typoWarning: string | null;
  /** Non-null when the SL is further from entry than SL_MAX_DISTANCE */
  largeDistanceWarning: string | null;
}

// ─── Pure check ───────────────────────────────────────────────────────────────

/**
 * Returns SL/TP sanity warnings for the given inputs.
 *
 * @param value     The raw SL or TP price entered by the user.
 * @param execPrice The order execution price (latestPrice for market, priceInput for limit/stop).
 * @param livePrice The current live feed price used for typo detection.
 * @param field     'SL' or 'TP' — used in warning message text.
 */
export function computeSLTPWarnings(
  value: number,
  execPrice: number,
  livePrice: number,
  field: 'SL' | 'TP'
): SLTPWarnings {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(execPrice) ||
    execPrice <= 0 ||
    !Number.isFinite(livePrice) ||
    livePrice <= 0
  ) {
    return { typoWarning: null, largeDistanceWarning: null };
  }

  // ── Typo guard ──────────────────────────────────────────────────────────────
  // Flag when the entered value deviates from the live price by more than
  // TYPO_DEVIATION_THRESHOLD (e.g. 7800 vs 78000 → 90% deviation → typo).
  const valueText = fmtMktPrice(value);
  const livePriceText = fmtMktPrice(livePrice);
  const typoDeviation = Math.abs(value - livePrice) / livePrice;
  const typoWarning =
    typoDeviation > TYPO_DEVIATION_THRESHOLD
      ? `${field} price $${valueText} looks like a typo — it deviates ${(typoDeviation * 100).toFixed(0)}% from the live price ($${livePriceText}). Did you mean a price closer to $${livePriceText}?`
      : null;

  // ── Large-distance guard ─────────────────────────────────────────────────────
  // Flag when |execPrice − sl| / execPrice > SL_MAX_DISTANCE (default 10%).
  // Only applies to SL, not TP (TP distance is intentionally variable).
  const distanceWarning =
    field === 'SL'
      ? (() => {
          const distance = Math.abs(execPrice - value) / execPrice;
          return distance > SL_MAX_DISTANCE
            ? `${field} is ${(distance * 100).toFixed(1)}% away from your entry price ($${fmtMktPrice(execPrice)}), which is beyond the recommended ${(SL_MAX_DISTANCE * 100).toFixed(0)}% limit. Confirm you intend this large a risk stop.`
            : null;
        })()
      : null;

  return {
    typoWarning,
    largeDistanceWarning: distanceWarning,
  };
}
