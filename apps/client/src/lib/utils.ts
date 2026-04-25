import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a crypto price to a readable precision — matches TradingView style.
 *   >= 1000 → 2 dp  (e.g. 75495.10)
 *   >= 1    → 4 dp  (e.g. 1.2345)
 *   < 1     → 6 dp  (e.g. 0.000123)
 */
export function fmtPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}
